import { getAuctionConfig, resolveNft, pollInterval, errorResponse } from '../../../../lib/opensea.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = getAuctionConfig();
    const nft = await resolveNft(config);
    return Response.json({
      // OpenSea field names
      name: nft.name, identifier: nft.tokenId, image_url: nft.imageUrl, collection: nft.collectionSlug,
      contract: nft.contractAddress, chain: nft.chain, opensea_url: nft.openseaUrl,
      // normalized model used by the page
      nft, auction: { endsAt: config.endsAt || null }, pollMs: pollInterval
    });
  } catch (e) {
    return errorResponse(e);
  }
}
