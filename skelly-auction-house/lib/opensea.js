// Server-only. The OpenSea API key is read from process.env and never sent to the browser.
import { AUCTION_NFT, OPEN_SEA_POLL_INTERVAL } from '../auction.config.js';
import { processOffers } from './offers.js';

const API = 'https://api.opensea.io/api/v2';
const NFT_TTL = 10 * 60 * 1000;
const ACCOUNT_TTL = 6 * 60 * 60 * 1000;
const ACCOUNT_MISS_TTL = 30 * 60 * 1000;
const OFFERS_TTL = 5 * 1000; // collapses simultaneous viewers into one OpenSea call

const cache = (globalThis.__skellyAuctionCache ??= { nft: new Map(), accounts: new Map(), offers: new Map() });

export const pollInterval = OPEN_SEA_POLL_INTERVAL;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// All OpenSea traffic goes through here. Errors carry only the HTTP status and path, never the key.
async function opensea(path, { retries = 2 } = {}) {
  const key = process.env.OPENSEA_API_KEY;
  if (!key) throw Object.assign(new Error('OPENSEA_API_KEY is not set on the server'), { status: 500, code: 'SERVER_MISCONFIGURED' });
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(API + path, { headers: { accept: 'application/json', 'x-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
    } catch {
      if (attempt < retries) { await sleep(500 * 2 ** attempt); continue; }
      throw Object.assign(new Error(`Network error calling OpenSea ${path}`), { status: 503 });
    }
    if (res.ok) return res.json();
    const retryAfter = Number(res.headers.get('retry-after')) || null;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(retryAfter ? Math.min(retryAfter * 1000, 5000) : 600 * 2 ** attempt);
      continue;
    }
    throw Object.assign(new Error(`OpenSea responded ${res.status} for ${path}`), { status: res.status, retryAfter });
  }
}

/* ---------- configuration ---------- */
export function getAuctionConfig() {
  const c = { ...AUCTION_NFT };
  for (const k of ['chain', 'collectionSlug', 'contractAddress', 'tokenId']) {
    if (!c[k]) throw Object.assign(new Error(`AUCTION_NFT.${k} is missing`), { status: 500 });
  }
  c.contractAddress = String(c.contractAddress).toLowerCase();
  c.tokenId = String(c.tokenId);
  return c;
}

/* ---------- NFT ---------- */
// → { collectionSlug, tokenId, contractAddress, chain, name, imageUrl, openseaUrl }
export async function resolveNft(c) {
  const key = [c.chain, c.contractAddress, c.tokenId].join(':');
  const hit = cache.nft.get(key);
  if (hit && Date.now() - hit.at < NFT_TTL) return hit.value;

  const { nft } = await opensea(`/chain/${c.chain}/contract/${c.contractAddress}/nfts/${encodeURIComponent(c.tokenId)}`);
  if (!nft || String(nft.identifier) !== c.tokenId || String(nft.contract || '').toLowerCase() !== c.contractAddress) {
    throw Object.assign(new Error('OpenSea returned a different NFT than AUCTION_NFT'), { status: 502 });
  }
  const value = {
    collectionSlug: nft.collection || c.collectionSlug,
    tokenId: c.tokenId,
    contractAddress: c.contractAddress,
    chain: c.chain,
    name: nft.name || null,
    imageUrl: nft.display_image_url || nft.image_url || null, // straight from OpenSea metadata for this token
    openseaUrl: `https://opensea.io/item/${c.chain}/${c.contractAddress}/${c.tokenId}`
  };
  cache.nft.set(key, { at: Date.now(), value });
  return value;
}

/* ---------- Offers ---------- */
const MAX_OFFERS = 200;

// → { offers (ACTIVE only, newest first), latestOffer, highestOffer, highestBidder, debug }
export async function getOffers(nft) {
  const key = `${nft.chain}:${nft.contractAddress}:${nft.tokenId}`;
  const hit = cache.offers.get(key);
  if (hit && Date.now() - hit.at < OFFERS_TTL) return hit.value;

  try {
    const raw = []; let next = null, pages = 0;
    do {
      const q = new URLSearchParams({ limit: '100' });
      if (next) q.set('next', next);
      const r = await opensea(`/offers/collection/${encodeURIComponent(nft.collectionSlug)}/nfts/${encodeURIComponent(nft.tokenId)}?${q}`);
      raw.push(...(Array.isArray(r.offers) ? r.offers : []));
      next = r.next || null; pages++;
    } while (next && raw.length < MAX_OFFERS);

    const result = processOffers(raw.slice(0, MAX_OFFERS), nft);
    result.debug.pages = pages;
    result.debug.truncated = !!next;
    cache.offers.set(key, { at: Date.now(), value: result });
    return result;
  } catch (e) {
    if (hit) return { ...hit.value, debug: { ...hit.value.debug, stale: true, staleReason: e.status || 'network' } }; // keep last good data
    throw e;
  }
}

/* ---------- Accounts (cached per wallet) ---------- */
// → { address, username, displayName, ensName, profileImage }
export async function getAccount(address) {
  const a = String(address).toLowerCase();
  const hit = cache.accounts.get(a);
  if (hit && Date.now() - hit.at < (hit.miss ? ACCOUNT_MISS_TTL : ACCOUNT_TTL)) return hit.value;
  let value, miss = false;
  try {
    const r = await opensea(`/accounts/${a}`);
    value = { address: (r.address || a).toLowerCase(), username: r.username || null, displayName: r.display_name || null, ensName: r.ens_name || null, profileImage: r.profile_image_url || null };
  } catch (e) {
    if (e.status !== 404) throw e;
    value = { address: a, username: null, displayName: null, ensName: null, profileImage: null }; miss = true;
  }
  cache.accounts.set(a, { at: Date.now(), value, miss });
  return value;
}

export async function getAccounts(addresses, concurrency = 4) {
  const list = [...new Set(addresses.map(a => String(a).toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a)))].slice(0, 50);
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < list.length) { const a = list[i++]; try { out.push(await getAccount(a)); } catch { /* skip; client falls back */ } }
  }));
  return out;
}

const ERRORS = {
  401: [502, 'OPENSEA_UNAUTHORIZED', 'OpenSea rejected the API key (401). Check OPENSEA_API_KEY.'],
  403: [502, 'OPENSEA_FORBIDDEN', 'OpenSea refused access (403).'],
  404: [404, 'NOT_FOUND', 'OpenSea could not find this NFT, collection or account (404).'],
  429: [429, 'RATE_LIMITED', 'OpenSea rate limit reached (429). Retrying shortly.']
};

export function errorResponse(e) {
  let [status, code, message] = ERRORS[e.status] || [502, 'OPENSEA_UNAVAILABLE', 'OpenSea is unavailable right now.'];
  if (e.code === 'SERVER_MISCONFIGURED') [status, code, message] = [500, e.code, 'Server is missing OPENSEA_API_KEY.'];
  else if (e.status === 400) [status, code, message] = [400, 'BAD_REQUEST', e.message];
  console.error(`[auction] ${code}: ${e.message}`); // message contains status + path only
  const headers = status === 429 && e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : undefined;
  return Response.json({ error: code, message }, { status, headers });
}
