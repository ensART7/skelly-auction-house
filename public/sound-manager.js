/* Skelly Auction House — SoundManager
 * Plain browser script (no build step). Exposes window.SoundManager.
 * - Master volume (default 0.5) + mute, persisted in localStorage (skelly.soundEnabled / skelly.masterVolume)
 * - Never plays before the first user gesture (autoplay-safe; no AudioContext is created until then)
 * - Uses /sounds/*.mp3 if listed in /sounds/manifest.json, otherwise a short built-in synthesized sound
 * - Priority + short "busy" window so simultaneous events don't stack into noise
 */
(function () {
  if (window.SoundManager) return;
  var KEY_ON = 'skelly.soundEnabled', KEY_VOL = 'skelly.masterVolume';
  var FILES = { bell: 'auction-bell.mp3', newBidder: 'new-bidder.mp3', newBid: 'new-bid.mp3', increase: 'bid-increase.mp3', top: 'top-bidder.mp3' };
  var PRI = { bell: 5, top: 4, newBid: 3, increase: 2, newBidder: 1 };
  var BUSY = { bell: 0.8, top: 0.9, newBid: 0.45, increase: 0.2, newBidder: 0.3 };

  var enabled = true, volume = 0.5;
  try {
    var e = localStorage.getItem(KEY_ON); if (e !== null) enabled = e === '1';
    var v = parseFloat(localStorage.getItem(KEY_VOL)); if (isFinite(v)) volume = Math.min(1, Math.max(0, v));
  } catch (_) {}

  var ctx = null, master = null, unlocked = false, pendingBell = false, bellPlayed = false, busyUntil = 0, busyPri = 0;
  var buffers = {}, available = {}, subs = [];
  var script = document.currentScript;
  var base = script && script.src ? new URL('sounds/', script.src).href : 'sounds/';

  fetch(base + 'manifest.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : { files: [] }; })
    .then(function (m) { (m.files || []).forEach(function (f) { available[f] = true; }); if (unlocked) loadBuffers(); })
    .catch(function () {});

  function save() { try { localStorage.setItem(KEY_ON, enabled ? '1' : '0'); localStorage.setItem(KEY_VOL, String(volume)); } catch (_) {} }
  function emit() { var st = { enabled: enabled, volume: volume }; subs.slice().forEach(function (fn) { try { fn(st); } catch (_) {} }); }
  function applyGain() { if (master) master.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.015); }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = enabled ? volume : 0;
    master.connect(comp); comp.connect(ctx.destination);
    return ctx;
  }
  function loadBuffers() {
    if (!ctx) return;
    Object.keys(FILES).forEach(function (k) {
      var f = FILES[k]; if (!available[f] || buffers[k]) return;
      buffers[k] = 'loading';
      fetch(base + f).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
        .then(function (buf) { buffers[k] = buf; })
        .catch(function () { delete buffers[k]; available[f] = false; });
    });
  }
  function unlock() {
    if (!ensureCtx()) return;
    var go = function () {
      unlocked = ctx.state === 'running';
      if (!unlocked) return;
      loadBuffers();
      if (pendingBell && !bellPlayed && play('bell')) { bellPlayed = true; pendingBell = false; }
    };
    if (ctx.state !== 'running') ctx.resume().then(go, function () {}); else go();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });

  /* ---------- tiny synth (fallback when no mp3 is provided) ---------- */
  function tone(t, freq, dur, type, gain, attack, endFreq) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, gain, freq, q) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = b; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  var SYN = {
    bell: function (t) { [[880, 1.3, 0.26], [1760, 1.0, 0.09], [2390, 0.8, 0.07], [3520, 0.45, 0.03]].forEach(function (p) { tone(t, p[0], p[1], 'sine', p[2], 0.003); }); },
    newBidder: function (t) { tone(t, 520, 0.08, 'sine', 0.28, 0.003, 1150); tone(t + 0.1, 96, 0.16, 'sine', 0.42, 0.004, 55); noise(t + 0.1, 0.06, 0.16, 380, 0.8); },
    newBid: function (t) { tone(t, 1568, 0.65, 'sine', 0.2, 0.003); tone(t, 3136, 0.3, 'sine', 0.05, 0.003); },
    increase: function (t) { noise(t, 0.035, 0.45, 2300, 2); tone(t, 190, 0.08, 'triangle', 0.28, 0.002, 120); },
    top: function (t) {
      [[523.25, 0], [659.25, 0.1], [783.99, 0.2], [1046.5, 0.32]].forEach(function (p, i) {
        tone(t + p[1], p[0], i === 3 ? 0.65 : 0.14, 'triangle', 0.17, 0.008);
        if (i === 3) tone(t + p[1], p[0] * 2, 0.4, 'sine', 0.045, 0.01);
      });
    }
  };

  function play(name, delay) {
    if (!enabled || volume <= 0 || !unlocked || !ctx || ctx.state !== 'running') return false;
    var now = ctx.currentTime, t = now + (delay || 0);
    if (!delay) {
      if (now < busyUntil && PRI[name] <= busyPri) return false;
      busyUntil = now + BUSY[name]; busyPri = PRI[name];
    }
    var buf = buffers[name];
    if (buf && buf !== 'loading') { var s = ctx.createBufferSource(); s.buffer = buf; s.connect(master); s.start(t); }
    else SYN[name](t);
    return true;
  }

  window.SoundManager = {
    get: function () { return { enabled: enabled, volume: volume }; },
    subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
    setEnabled: function (v) { enabled = !!v; save(); applyGain(); if (enabled) unlock(); emit(); },
    toggle: function () { this.setEnabled(!enabled); },
    setVolume: function (v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); save(); applyGain(); emit(); },
    playAuctionBell: function () { if (bellPlayed) return; if (play('bell')) bellPlayed = true; else pendingBell = true; },
    playNewBidder: function () { return play('newBidder'); },
    playNewBid: function () { return play('newBid'); },
    playBidIncrease: function () { return play('increase'); },
    playTopBidderChange: function () { return play('top'); },
    /* One call per real data change. Priority: top > newBid > increase > newBidder.
       A genuinely new bidder adds a short pop after the main sound (except under the fanfare). */
    playEvents: function (e) {
      var main = e.topChange ? 'top' : e.newBid ? 'newBid' : e.increase ? 'increase' : null;
      if (main) play(main);
      if (e.newBidder) { if (!main) play('newBidder'); else if (main !== 'top') play('newBidder', 0.3); }
    }
  };
  window.dispatchEvent(new Event('skelly-sound-ready'));
})();
