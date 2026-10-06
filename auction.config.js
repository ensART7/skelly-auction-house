// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the auctioned NFT.
// The page reads everything (image, name, link, offers, bidders) through the API routes,
// which only ever use this object.
// ─────────────────────────────────────────────────────────────
export const AUCTION_NFT = {
  chain: 'robinhood', // OpenSea chain identifier (Robinhood Chain, EVM chain ID 4663)
  collectionSlug: 'skelly-hood',
  contractAddress: '0x679fa586eefc412ced3ec12f38b6138d66354bfc',
  tokenId: '442',
  endsAt: null // optional ISO time, e.g. '2026-10-12T18:00:00Z' → plays the SOLD sequence
};

export const DEFAULT_CHAIN_ID = 4663;

// How often the page checks OpenSea for new offers (ms). Keep ≥ 10000.
export const OPEN_SEA_POLL_INTERVAL = 15000;
