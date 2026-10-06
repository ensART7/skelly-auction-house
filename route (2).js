import { getAuctionConfig, resolveNft, getOffers, errorResponse } from '../../../../lib/opensea.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const nft = await resolveNft(getAuctionConfig());
    const { offers, latestOffer, highestOffer, highestBidder, debug } = await getOffers(nft);
    return Response.json({
      nft: { chain: nft.chain, collectionSlug: nft.collectionSlug, contractAddress: nft.contractAddress, tokenId: nft.tokenId },
      offers,          // ACTIVE only, newest first
      latestOffer,     // LAST OFFER
      highestOffer,    // TOP BIDDER's offer
      highestBidder,
      debug,           // temporary: status breakdown, no secrets
      fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return errorResponse(e);
  }
}
