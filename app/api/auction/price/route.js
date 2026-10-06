// ETH/USD for the "≈ $X.XX" labels. Public endpoints, no API key. Cached 60 s on the server.
export const dynamic = 'force-dynamic';

const cache = (globalThis.__skellyPrice ??= { at: 0, value: null });
const TTL = 60 * 1000;

async function coinbase() {
  const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { cache: 'no-store' });
  const j = await r.json(); const v = Number(j && j.data && j.data.amount);
  if (!(v > 0)) throw new Error('coinbase');
  return { ethUsd: v, source: 'coinbase' };
}
async function coingecko() {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', { cache: 'no-store' });
  const j = await r.json(); const v = Number(j && j.ethereum && j.ethereum.usd);
  if (!(v > 0)) throw new Error('coingecko');
  return { ethUsd: v, source: 'coingecko' };
}

// GET /api/auction/price → { ethUsd, source, at }   (WETH is priced 1:1 with ETH)
export async function GET() {
  if (cache.value && Date.now() - cache.at < TTL) return Response.json(cache.value);
  for (const src of [coinbase, coingecko]) {
    try {
      cache.value = { ...(await src()), at: new Date().toISOString() }; cache.at = Date.now();
      return Response.json(cache.value);
    } catch (e) { /* try next source */ }
  }
  if (cache.value) return Response.json({ ...cache.value, stale: true });
  return Response.json({ error: 'PRICE_UNAVAILABLE' }, { status: 502 });
}
