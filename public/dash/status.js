/* The waiting scene. A request hangs on a line behind the ones that came first. When it is decided, a stamp lands on it:
   green and petals for approved, red and a slumped note for not approved. Used by the dash after sending, and by the
   page shown at /<address> while a wall is waiting. */
(function () {
  /* a hand-drawn hourglass: two even bulbs, a little sand in the lower one */
  var HG = '<svg class="hg" viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="hgt"><path d="M8.3 4h7.4v2L12.5 11.9h-1L8.3 6z"/></clipPath><clipPath id="hgb"><path d="M8.3 20h7.4v-2L12.5 12.1h-1L8.3 18z"/></clipPath></defs><g clip-path="url(#hgt)"><rect class="sandt" x="7" y="4" width="10" height="8"/></g><g clip-path="url(#hgb)"><rect class="sandb" x="7" y="12" width="10" height="8"/></g><path class="stm" d="M12 11.8V19.6"/><path class="gl" d="M5.5 3h13M5.5 21h13M7.6 3.6v2.5c0 2.7 3.1 4.5 4.4 5.9-1.3 1.4-4.4 3.200-4.400 5.900v2.500M16.4 3.6v2.5c0 2.700-3.100 4.500-4.400 5.900 1.300 1.400 4.400 3.200 4.400 5.900v2.500"/></svg>';
  var OK = '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6"/></svg>', NO = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var STACK = '<svg viewBox="0 0 24 24"><path d="M8 4l10-1 2 15-10 2zM5 8L4 21l12 1"/></svg>';
  /* a wooden clothes-peg that clips a paper to the line */
  var PEG = '<svg class="peg" viewBox="0 0 18 38" aria-hidden="true"><path d="M3.4 2.6q5.6-1.8 11.2 0l-.8 15.2q-.2 2.2-1.4 3.6l-1 1.2v12.6q0 1.4-1.4 1.6-1.4-.2-1.4-1.6V22.6l-1-1.2q-1.2-1.4-1.4-3.6z"/><path class="sl" d="M9 21v6"/><circle cx="9" cy="10" r="1.3"/></svg>';
  var STAMP = {
    ok: '<svg class="stamp ok" viewBox="0 0 240 90" aria-hidden="true"><path d="M12 16q3-8 14-8h188q12 0 14 11 2 24 0 52-2 11-14 11H26q-12 0-14-11-2-26-2-55z"/><text x="120" y="62" text-anchor="middle" textLength="160" lengthAdjust="spacingAndGlyphs">Approved</text></svg>',
    no: '<svg class="stamp no" viewBox="0 0 240 90" aria-hidden="true"><path d="M10 18q3-9 15-9h190q12 0 13 10 2 24 1 51-2 12-14 12H26q-12 0-14-12-3-24-2-52z"/><text x="120" y="62" text-anchor="middle" textLength="190" lengthAdjust="spacingAndGlyphs">Not approved</text></svg>'
  };
  var TITLES = { wait: 'Waiting', live: 'Approved', declined: 'Not approved', none: 'Nobody here' };
  var LABELS = { wait: 'Waiting for approval.', live: 'Approved', declined: 'Not approved.', none: 'Nobody here yet.' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  /* opts: slug, pair ({a:{n,an}, b:{n,an}} or null), declinedAsNone, rootUrl, onState(state, ahead), actions (element) */
  function mount(root, opts) {
    var pair = opts.pair, state = 'wait', ahead = 0, timer = 0, stopped = false, fails = 0, petalsOn = false;
    root.innerHTML = '<div class="scene" data-state="wait"><div class="line" id="line"><svg class="rope" aria-hidden="true"><path id="ropeShade"/><path id="ropePath"/><path id="ropeTwist"/><g id="nails"></g></svg><div id="items"></div></div><div class="state" role="status" id="state"></div></div>';
    var scene = root.firstChild, line = scene.querySelector('#line'), items = scene.querySelector('#items'), ropePath = scene.querySelector('#ropePath'), ropeTwist = scene.querySelector('#ropeTwist'), ropeShade = scene.querySelector('#ropeShade'), nails = scene.querySelector('#nails'), label = scene.querySelector('#state');
    function portrait(an) { return '/assets/portrait-' + an + '.webp'; }
    function mineHtml() {
      var a = pair ? pair.a : { n: '', an: 'cat' }, b = pair ? pair.b : { n: '', an: 'deer' };
      var addr = opts.rootUrl.replace(/^https?:\/\//, '') + '/' + opts.slug;
      return '<div class="mine paper cream"><div class="pair"><figure><img alt="" src="' + portrait(a.an) + '">' + (a.n ? '<figcaption>' + esc(a.n) + '</figcaption>' : '') + '</figure>'
        + '<figure><img alt="" src="' + portrait(b.an) + '">' + (b.n ? '<figcaption>' + esc(b.n) + '</figcaption>' : '') + '</figure></div>'
        + '<div class="addr"><span>' + esc(addr) + '</span></div>' + (opts.info || '') + STAMP.ok + STAMP.no + '</div>';
    }
    var SAG = 26, TOP = 12, TILTS = [-3, 2.5, -1.5, 3.5, -2.5, 2, -3.5, 1.5];
    function ropeY(x, W) { var t = x / W; return TOP + 4 * SAG * t * (1 - t); }   // the line sags in the middle
    function ropeTilt(x, W) { return Math.atan(4 * SAG * (1 - 2 * x / W) / W) * 180 / Math.PI; }   // the pegs lean with the line, the papers hang straight down
    /* Everything hangs from the line: each paper has a peg at the rope's height at that spot, so papers follow the curve. */
    function layout() {
      var W = Math.round(line.clientWidth); if (!W) return;
      line.style.height = (TOP + SAG + 300) + 'px';   // room to measure in; trimmed to the papers below
      var d = 'M3 ' + TOP + ' Q' + (W / 2) + ' ' + (TOP + 2 * SAG) + ' ' + (W - 3) + ' ' + TOP;
      ropePath.setAttribute('d', d); ropeTwist.setAttribute('d', d); ropeShade.setAttribute('d', d);
      nails.innerHTML = '<circle cx="3" cy="' + TOP + '" r="4.2"/><circle cx="' + (W - 3) + '" cy="' + TOP + '" r="4.2"/>';
      var mw = Math.min(300, Math.round(W * 0.56)), cx = W / 2, mini = Math.max(32, Math.min(54, Math.round(W * 0.075))), gap = 10;
      var room = cx - mw / 2 - 14, fit = Math.max(0, Math.floor(room / (mini + gap))), shown = Math.min(ahead, fit, 3), html = '';
      var my = ropeY(cx, W);
      function pegAt(k, x, W, base) { return PEG.replace('class="peg"', 'class="peg ' + k + '" style="left:' + ((x - (cx - mw / 2)) / mw * 100).toFixed(1) + '%;top:' + (ropeY(x, W) - base - 20).toFixed(1) + 'px;--lean:' + ropeTilt(x, W).toFixed(1) + 'deg"'); }
      html += '<div class="hung big" style="left:' + (cx - mw / 2) + 'px;top:' + my + 'px;width:' + mw + 'px"><div class="sway">' + mineHtml() + pegAt('l', cx - mw * 0.26, W, my) + pegAt('r', cx + mw * 0.26, W, my) + '</div></div>';
      for (var i = 0; i < shown; i++) {
        var x = cx - mw / 2 - 14 - mini / 2 - i * (mini + gap), more = i === shown - 1 && ahead > shown, y = ropeY(x, W);
        html += '<div class="hung sm" style="left:' + (x - mini / 2) + 'px;top:' + y + 'px;width:' + mini + 'px;--i:' + i + ';--r:' + TILTS[i % 8] + 'deg;--sw:' + (5.2 + (i % 3) * 0.7) + 's"><div class="sway">' + PEG
          + '<div class="sheet"><div class="mini paper c' + (i % 3) + '" style="height:' + Math.round(mini * 1.34) + 'px">' + (more ? '<b>+' + (ahead - shown + 1) + '</b>' : '<i class="ln"></i>') + '</div></div></div></div>';
      }
      items.innerHTML = html;
      var low = 0; Array.prototype.forEach.call(items.children, function (h) { low = Math.max(low, h.offsetTop + h.offsetHeight); }); line.style.height = (low + 14) + 'px';
    }
    function paint() {
      scene.dataset.state = state;
      layout();
      var icon = state === 'live' ? OK : state === 'declined' ? NO : state === 'wait' ? HG : '';
      label.innerHTML = icon + '<span>' + LABELS[state] + '</span>';
      document.title = TITLES[state] + ' · Project Duet';
    }
    var sizeTimer = 0;
    if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(sizeTimer); sizeTimer = setTimeout(layout, 60); }).observe(line);
    function petals() {
      if (petalsOn) return; petalsOn = true;
      var box = document.createElement('div'); box.className = 'petals'; scene.appendChild(box);
      var colors = ['#efd2bd', '#dce1c6', '#fff6e5', '#e8dbb9', '#d9e3e2'];
      for (var i = 0; i < 22; i++) {
        var p = document.createElement('i'); p.className = 'petal';
        p.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + '%;--c:' + colors[i % 5] + ';--d:' + (4 + Math.random() * 3).toFixed(1) + 's;--dl:-' + (Math.random() * 5).toFixed(1) + 's;--s:' + Math.round(Math.random() * 80 - 40) + 'px';
        box.appendChild(p);
      }
      setTimeout(function () { box.remove(); }, 9000);
    }
    function set(next, n) {
      var changed = next !== state || n !== ahead; state = next; ahead = n; if (!changed) return;
      paint(); if (next === 'live') petals();
      if (opts.onState) opts.onState(state, ahead);
    }
    function decide(j) {
      if (j.status === 'live') return 'live';
      if (j.status === 'pending') return 'wait';
      return j.status === 'declined' && !opts.declinedAsNone ? 'declined' : 'none';
    }
    function poll() {
      if (stopped) return;
      if (document.hidden) { timer = setTimeout(poll, 3000); return; }
      fetch('/api/request?slug=' + encodeURIComponent(opts.slug)).then(function (r) { return r.json(); }).then(function (j) {
        fails = 0; var s = decide(j); set(s, s === 'wait' ? j.ahead || 0 : 0);
        if (s === 'wait') timer = setTimeout(poll, 6000);
      }).catch(function () { fails++; timer = setTimeout(poll, Math.min(30000, 6000 * (fails + 1))); });
    }
    function wake() { if (!document.hidden && !stopped && (state === 'wait')) { clearTimeout(timer); poll(); } }
    document.addEventListener('visibilitychange', wake);
    paint(); poll();
    return { stop: function () { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); }, state: function () { return state; } };
  }
  window.DashStatus = { mount: mount };
})();
