import { getAccount, errorResponse } from '../../../../../lib/opensea.js';

export const dynamic = 'force-dynamic';

// GET /api/auction/account/0xabc…  → { address, username, displayName, ensName, profileImage }
export async function GET(_request, { params }) {
  try {
    const { address } = await params;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) return Response.json({ error: 'INVALID_ADDRESS' }, { status: 400 });
    return Response.json(await getAccount(address));
  } catch (e) {
    return errorResponse(e);
  }
}
