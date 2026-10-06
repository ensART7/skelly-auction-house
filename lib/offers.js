// Pure parsing for OpenSea v2 "Get offers by NFT" responses. No network, no secrets, so it can be unit-tested.
// Response shape: { offers: [{ asset, chain, order_created_at, order_hash, price: { currency, decimals, value },
//                              protocol, protocol_address, protocol_data, remaining_quantity, status }], next }

export const STATUSES = ['ACTIVE', 'INACTIVE', 'FULFILLED', 'EXPIRED', 'CANCELLED'];

export function toMillis(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) { const n = Number(v); return n < 1e12 ? Math.round(n * 1000) : n; }
  const s = String(v);
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z') || 0; // zone-less timestamps are UTC
}

// BigInt-exact "123450000000000000" (18) → "0.12345"
export function formatUnits(value, decimals) {
  const v = BigInt(value), d = BigInt(decimals);
  const neg = v < 0n, a = neg ? -v : v, base = 10n ** d;
  const frac = d > 0n ? (a % base).toString().padStart(Number(d), '0').replace(/0+$/, '') : '';
  return (neg ? '-' : '') + (a / base).toString() + (frac ? '.' + frac : '');
}

// Scale any token amount to 18 decimals (BigInt) so offers can be compared exactly.
export function to18(value, decimals) {
  const v = BigInt(value), d = Number(decimals);
  return d <= 18 ? v * 10n ** BigInt(18 - d) : v / 10n ** BigInt(d - 18);
}

function makerOf(o) {
  const p = (o.protocol_data && o.protocol_data.parameters) || {};
  const m = typeof o.maker === 'string' ? o.maker : o.maker && o.maker.address;
  const addr = String(m || p.offerer || '').toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(addr) ? addr : null;
}

// true = asset explicitly matches, false = asset explicitly points at another NFT, null = no asset info
function assetMatches(o, nft) {
  const a = o.asset;
  if (!a || typeof a !== 'object') return null;
  const id = a.identifier ?? a.token_id ?? a.tokenId;
  const contract = a.contract ?? a.contract_address ?? a.address;
  if (id == null && contract == null) return null;
  if (id != null && String(id) !== nft.tokenId) return false;
  if (contract != null && String(contract).toLowerCase() !== nft.contractAddress) return false;
  if (a.chain && String(a.chain).toLowerCase() !== nft.chain) return false;
  return true;
}

/**
 * @param raw  all offers returned by OpenSea (every page)
 * @param nft  { chain, contractAddress (lowercase), tokenId (string) }
 */
export function processOffers(raw, nft) {
  const statusCounts = { ACTIVE: 0, INACTIVE: 0, FULFILLED: 0, EXPIRED: 0, CANCELLED: 0, OTHER: 0 };
  const excludedActive = { wrongChain: 0, otherNft: 0, zeroRemaining: 0, noMaker: 0, badPrice: 0 };
  const offers = [];

  for (const o of raw) {
    const status = String(o.status || '').toUpperCase();
    if (STATUSES.includes(status)) statusCounts[status]++; else statusCounts.OTHER++;
    if (status !== 'ACTIVE') continue; // only offers OpenSea explicitly reports as ACTIVE

    if (o.chain && String(o.chain).toLowerCase() !== nft.chain) { excludedActive.wrongChain++; continue; }
    if (assetMatches(o, nft) === false) { excludedActive.otherNft++; continue; }
    if (o.remaining_quantity != null && !(Number(o.remaining_quantity) > 0)) { excludedActive.zeroRemaining++; continue; }
    const maker = makerOf(o);
    if (!maker) { excludedActive.noMaker++; continue; }

    const price = o.price || {};
    let amountExact, amount18;
    try {
      const decimals = Number(price.decimals);
      if (!Number.isInteger(decimals) || decimals < 0) throw new Error('decimals');
      amountExact = formatUnits(price.value, decimals);
      amount18 = to18(price.value, decimals);
    } catch { excludedActive.badPrice++; continue; }
    if (amount18 <= 0n) { excludedActive.badPrice++; continue; }

    const created = toMillis(o.order_created_at) || toMillis(o.protocol_data && o.protocol_data.parameters && o.protocol_data.parameters.startTime);
    offers.push({
      id: o.order_hash || `${maker}:${created}:${amountExact}`,
      maker,
      amount: Number(amountExact),     // display only
      amountExact,                     // exact decimal string
      amount18: amount18.toString(),   // exact, comparable across currencies with different decimals
      currency: price.currency || '',
      createdAt: new Date(created || 0).toISOString(),
      status: 'ACTIVE',
      chain: nft.chain, contractAddress: nft.contractAddress, tokenId: nft.tokenId
    });
  }

  // LAST OFFER: newest ACTIVE offer by order_created_at
  offers.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latestOffer = offers[0] || null;

  // TOP BIDDER: highest ACTIVE offer (ties → earliest)
  let highestOffer = null;
  for (const o of offers) {
    if (!highestOffer) { highestOffer = o; continue; }
    const a = BigInt(o.amount18), b = BigInt(highestOffer.amount18);
    if (a > b || (a === b && Date.parse(o.createdAt) < Date.parse(highestOffer.createdAt))) highestOffer = o;
  }

  return {
    offers,
    latestOffer,
    highestOffer,
    highestBidder: highestOffer ? highestOffer.maker : null,
    debug: {
      totalReceived: raw.length,
      active: offers.length,
      inactive: statusCounts.INACTIVE,
      fulfilled: statusCounts.FULFILLED,
      expired: statusCounts.EXPIRED,
      cancelled: statusCounts.CANCELLED,
      statusCounts,
      excludedActive
    }
  };
}
