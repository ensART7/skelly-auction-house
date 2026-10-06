// Live diagnostic against OpenSea (uses YOUR key from the environment, prints no secrets):
//   OPENSEA_API_KEY=... npm run inspect:offers
import { AUCTION_NFT } from '../auction.config.js';
import { processOffers } from '../lib/offers.js';

const key = process.env.OPENSEA_API_KEY;
if (!key) { console.error('Set OPENSEA_API_KEY first.'); process.exit(1); }
const nft = { ...AUCTION_NFT, contractAddress: AUCTION_NFT.contractAddress.toLowerCase(), tokenId: String(AUCTION_NFT.tokenId) };

const raw = []; let next = null;
do {
  const q = new URLSearchParams({ limit: '100' }); if (next) q.set('next', next);
  const res = await fetch(`https://api.opensea.io/api/v2/offers/collection/${nft.collectionSlug}/nfts/${nft.tokenId}?${q}`, { headers: { accept: 'application/json', 'x-api-key': key } });
  if (!res.ok) { console.error('OpenSea responded', res.status); process.exit(1); }
  const r = await res.json();
  raw.push(...(r.offers || [])); next = r.next || null;
} while (next && raw.length < 200);

const r = processOffers(raw, nft);
console.log('First offer keys:', raw[0] ? Object.keys(raw[0]) : '(none)');
console.log('Raw status values:', [...new Set(raw.map(o => o.status))]);
console.log('Debug:', JSON.stringify(r.debug, null, 2));
console.log('Latest:', r.latestOffer && { amount: r.latestOffer.amountExact, currency: r.latestOffer.currency, at: r.latestOffer.createdAt, maker: r.latestOffer.maker });
console.log('Highest:', r.highestOffer && { amount: r.highestOffer.amountExact, currency: r.highestOffer.currency, maker: r.highestOffer.maker });
