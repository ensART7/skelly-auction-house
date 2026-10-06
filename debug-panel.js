/* Skelly Auction House — developer debug panel.
 * Shows only when the URL contains ?debug=1 (also accepts #debug=1).
 * Standalone: reads our own /api/auction/* routes; no OpenSea key is ever involved client-side.
 * To remove: delete this file and its <script> tag in auction.html.
 */
(function () {
  var qs = new URLSearchParams(window.location.search);
  var hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  var on = qs.get('debug') === '1' || hash.get('debug') === '1';
  if (!on) return;

  var API = '/api/auction';
  var POLL = 15000;
  var FIELDS = ['NFT', 'Status', 'Offers received', 'Active offers', 'Latest offer', 'Latest offer time', 'Highest offer', 'Highest bidder', 'Statuses', 'Offer prices'];
  var cells = {};

  function build() {
    var box = document.createElement('div');
    box.setAttribute('data-debug-panel', '');
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:min(560px,calc(100vw - 24px));' +
      'background:rgba(11,27,51,.94);color:#E8F0FF;border-radius:10px;padding:10px 12px;' +
      'font:500 11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;display:grid;' +
      'grid-template-columns:auto minmax(0,1fr);column-gap:12px;box-shadow:0 4px 18px rgba(0,0,0,.25)';
    FIELDS.forEach(function (label) {
      var k = document.createElement('span'); k.textContent = label; k.style.color = '#CCFF00';
      var v = document.createElement('span'); v.textContent = '—'; v.style.overflowWrap = 'anywhere'; v.style.whiteSpace = 'pre-line';
      box.appendChild(k); box.appendChild(v); cells[label] = v;
    });
    document.body.appendChild(box);
  }
  function set(label, value) { if (cells[label]) cells[label].textContent = value == null || value === '' ? '—' : String(value); }
  function money(o) { return o ? (o.amountExact || o.amount) + ' ' + (o.currency || '') : '—'; }

  function getJSON(path) {
    return fetch(API + path, { headers: { accept: 'application/json' }, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) { var e = new Error(body.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return body;
      });
    });
  }

  function loadNft() {
    return getJSON('/nft').then(function (r) {
      var n = r.nft || {};
      set('NFT', [n.collectionSlug, n.tokenId].join(' / ') + ' · ' + n.chain + ' · ' + n.contractAddress + (n.name ? ' · ' + n.name : ''));
      if (r.pollMs) POLL = Math.max(5000, r.pollMs);
    }).catch(function (e) { set('NFT', 'error: ' + e.message); });
  }

  function loadOffers() {
    getJSON('/offers').then(function (r) {
      var d = r.debug || {};
      set('Status', 'ready' + (d.stale ? ' (stale: ' + d.staleReason + ')' : '') + ' · ' + new Date().toLocaleTimeString());
      set('Offers received', d.totalReceived != null ? d.totalReceived + (d.pages ? ' (' + d.pages + ' page' + (d.pages > 1 ? 's' : '') + ')' : '') : (r.offers || []).length);
      set('Active offers', d.active != null ? d.active : (r.offers || []).length);
      set('Latest offer', money(r.latestOffer));
      set('Latest offer time', r.latestOffer ? r.latestOffer.createdAt : '—');
      set('Highest offer', money(r.highestOffer));
      set('Highest bidder', r.highestBidder || '—');
      set('Offer prices', (r.offers || []).slice(0, 10).map(function (o) { var p = o.priceDebug || {}; return o.maker.slice(0, 6) + '…' + o.maker.slice(-3) + ' raw ' + p.rawPrice + '/' + p.decimals + 'd qty ' + p.quantity + ' rem ' + p.remainingQuantity + ' → ' + p.displayPrice + ' ' + o.currency; }).join('\n') || '—');
      var sc = d.statusCounts;
      var ex = d.excludedActive;
      var exText = ex ? Object.keys(ex).filter(function (k) { return ex[k]; }).map(function (k) { return k + ' ' + ex[k]; }).join(', ') : '';
      set('Statuses', sc ? Object.keys(sc).map(function (k) { return k + ' ' + sc[k]; }).join(' · ') + (exText ? ' | dropped active: ' + exText : '') : '—');
    }).catch(function (e) {
      set('Status', 'error: ' + e.message + (e.status ? ' (' + e.status + ')' : '') + ' · ' + new Date().toLocaleTimeString());
    }).then(function () { setTimeout(loadOffers, POLL); });
  }

  function start() { build(); loadNft().then(loadOffers); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
