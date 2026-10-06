# Skelly Auction House

Live auction room for **SKELLY #442** on Robinhood Chain, powered by the OpenSea API.

```
Browser (public/auction.html)
  → /api/auction/nft · /api/auction/offers · /api/auction/account/[address]   (Next.js, server-side)
    → OpenSea API  (x-api-key = process.env.OPENSEA_API_KEY)
```

The OpenSea key is only read on the server. The browser never sees it.

## Project layout
- `public/auction.html`: the approved UI (served at `/`), plus `public/assets/`, `public/logo.webp`, `public/support.js`
- `auction.config.js`: **single source of truth** for the auctioned NFT and the poll interval
- `lib/opensea.js`: all OpenSea calls, normalisation, filtering and caching
- `app/api/auction/*`: API routes

## Auctioned NFT
```js
AUCTION_NFT = {
  chain: 'robinhood',
  collectionSlug: 'skelly-hood',
  contractAddress: '0x679fa586eefc412ced3ec12f38b6138d66354bfc',
  tokenId: '442'
}
```
To auction a different NFT later, change only this object.

## Run locally
```bash
npm install
cp .env.example .env.local   # then put your key in .env.local
npm run dev                  # http://localhost:3000
```
Quick checks: `/api/auction/nft` should return SKELLY #442, and `/api/auction/offers` returns active offers newest-first.

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel, choose **Add New → Project** and import the repo. The framework is auto-detected as Next.js; keep the default build settings.
3. Under **Settings → Environment Variables**, add `OPENSEA_API_KEY` (Production + Preview), then deploy or redeploy.

## Behaviour
- **Bid history (right panel, below the room on mobile):** the latest 10 individual ACTIVE offers, newest first, each with name, unit price, ≈ USD and relative time. New entries slide in and flash.
- **Bid activity:** when a wallet's offer changes, its chair shakes, avatar pulses, amount counts up and a "BID UPDATED" tag pops. New wallets pop in with "NEW BID". Wallets whose offers expire fade out. This only fires when the OpenSea data actually changes.
- **Top bidder seat:** crown, lime glow, ring and a ★ TOP BIDDER badge. When the leader changes, their tag travels into the seat and the crown drops on.
- **Auctioneer speech bubble:** reacts to real events (NEW TOP BIDDER! / DO I HEAR MORE? / WE HAVE A NEW BID!), shows COME ON, SKELLIES! when 3 or more offers arrived in the last 15 minutes, and GOING ONCE / TWICE when `AUCTION_NFT.endsAt` is under 2 minutes / 45 seconds away.
- **USD:** `GET /api/auction/price` (Coinbase spot, CoinGecko fallback, no key, cached 60 s). WETH/ETH are converted at the ETH price, and stablecoins (USDG/USDC/USDT/DAI) at 1:1.
- **Share:** SHARE AUCTION ↗ opens an X post: "Bringing NFT auctions back. 🔨💀 / Welcome to the @skelly_hood Auction House." plus the auction link.
- **TOP OFFER:** the highest active offer, plus who made it (same bidder as the TOP BIDDER chair).
- **TOP BIDDER:** the wallet with the highest active offer. The next 3 bidders take the premium row and the next 6 take the standard row (10 seats). Extra bidders show as "+ N OTHER BIDDERS".
- **Offer filtering:** only offers that target this exact chain, contract and token are shown. Collection and trait offers are dropped.
- **Names:** username, then display name, then shortened wallet. Avatars: OpenSea profile image, falling back to a generated skull.
- **Refresh:** offers are polled every 15 s (`OPEN_SEA_POLL_INTERVAL`), paused while the tab is hidden.
- **No mock data:** if OpenSea can't be reached, the page shows "AUCTION DATA UNAVAILABLE"; with no offers it shows "NO ACTIVE OFFERS".
- **Debug panel:** `public/debug-panel.js`, active only with `/?debug=1` (or `#debug=1`). It reads the query with `URLSearchParams` (the page is static HTML, not a React component, so `useSearchParams()` doesn't apply) and calls only `/api/auction/*`. To remove it, delete the file and its `<script>` tag in `auction.html`.

## Note
`public/support.js` renders the page and loads React from unpkg.com at runtime.

## Offer processing
- `lib/offers.js` parses OpenSea's current `GET /api/v2/offers/collection/{slug}/nfts/{identifier}` response (`response.offers`). It is pure and testable.
- **Active:** `String(status).toUpperCase() === 'ACTIVE'`, and `remaining_quantity > 0` when present. No deprecated fields are used.
- **Price:** OpenSea's `price.value` is the order *total* (unit × quantity). The bid shown is the **unit price per NFT**: Seaport offer amount ÷ NFT quantity in `protocol_data` when present, otherwise `price.value ÷ quantity/remaining_quantity`, read with BigInt and `price.decimals`. Offers are never multiplied or summed; each bidder seat shows that wallet's highest single offer. `priceDebug` on each offer shows rawPrice / decimals / quantity / remainingQuantity / displayPrice (temporary).
- **Pagination:** follows `next` up to 200 offers.
- **Debug summary:** `/api/auction/offers` returns `debug` with `totalReceived`, `active`, `statusCounts`, and the counts of active offers dropped (wrong chain / other NFT / zero remaining / no maker / bad price).

```bash
npm run test:offers      # offline test against scripts/fixtures/offers.sample.json
npm run inspect:offers   # live: prints raw status values + debug summary (needs .env.local)
```

## API errors
401/403 → 502 `OPENSEA_UNAUTHORIZED`/`OPENSEA_FORBIDDEN` · 404 → 404 `NOT_FOUND` · 429 → 429 `RATE_LIMITED` (with Retry-After; last good offers are served while limited) · 5xx/network → 502 `OPENSEA_UNAVAILABLE` (retried twice first) · missing key → 500 `SERVER_MISCONFIGURED`. Messages never include the key.
