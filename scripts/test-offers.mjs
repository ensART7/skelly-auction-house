// Offline parser test:  npm run test:offers
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { processOffers, formatUnits } from '../lib/offers.js';

const nft = { chain: 'robinhood', contractAddress: '0x679fa586eefc412ced3ec12f38b6138d66354bfc', tokenId: '442' };
const fixture = JSON.parse(await readFile(new URL('./fixtures/offers.sample.json', import.meta.url), 'utf8'));
const r = processOffers(fixture.offers, nft);

assert.equal(formatUnits('7500000', 6), '7.5');
assert.equal(formatUnits('5500000000000000000', 18), '5.5');
assert.equal(r.debug.totalReceived, 11);
assert.deepEqual(r.debug.statusCounts, { ACTIVE: 7, INACTIVE: 1, FULFILLED: 1, EXPIRED: 1, CANCELLED: 1, OTHER: 0 });
assert.equal(r.debug.active, 4);                       // a1 a2 a3 a4
assert.equal(r.debug.excludedActive.zeroRemaining, 1); // c1
assert.equal(r.debug.excludedActive.otherNft, 1);      // c2 (token 441)
assert.equal(r.debug.excludedActive.wrongChain, 1);    // c3 (ethereum)
assert.equal(r.latestOffer.id, '0xa4');                // newest ACTIVE (10:06), not the highest
assert.equal(r.highestOffer.id, '0xa2');               // 7.5 USDG > 7.0 ETH after 18-dec normalisation
assert.equal(r.highestBidder, '0x2222222222222222222222222222222222222222');
assert.deepEqual(r.offers.map(o => o.id), ['0xa4', '0xa3', '0xa2', '0xa1']);

// Multi-quantity offers: price.value is the order total → displayed bid must be the unit price.
const multi = processOffers([
  { order_hash: '0xq2', chain: 'robinhood', status: 'ACTIVE', remaining_quantity: 2, order_created_at: '2026-10-06T11:00:00Z',
    price: { currency: 'WETH', decimals: 18, value: '3600000000000000' }, protocol_data: { parameters: { offerer: '0x' + 'b'.repeat(40) } } },
  { order_hash: '0xq10', chain: 'robinhood', status: 'ACTIVE', remaining_quantity: 10, order_created_at: '2026-10-06T11:01:00Z',
    price: { currency: 'WETH', decimals: 18, value: '9000000000000000' },
    protocol_data: { parameters: { offerer: '0x' + 'c'.repeat(40),
      offer: [{ itemType: 1, startAmount: '9000000000000000' }],
      consideration: [{ itemType: 4, startAmount: '10' }, { itemType: 1, startAmount: '225000000000000' }] } } }
], nft);
assert.equal(multi.offers.find(o => o.id === '0xq2').amountExact, '0.0018');
assert.equal(multi.offers.find(o => o.id === '0xq10').amountExact, '0.0009');
assert.equal(multi.highestOffer.id, '0xq2');

console.log('offers parser OK', r.debug);
