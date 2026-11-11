/* The dash: names and animals, an address, a passphrase, a look at the two walls, then the request waits for approval. */
(function () {
  var ANIMALS = ['deer', 'cat'];
  var WORDS = 'coffee cookie honey lemon maple apple peach berry butter toast cocoa mango plum pepper ginger cinnamon sugar candy muffin waffle pancake noodle pickle olive tulip daisy clover willow cedar birch pine acorn fern moss river brook pebble puddle meadow garden orchard cabin lantern candle blanket pillow slipper mitten scarf button ribbon teapot kettle spoon biscuit bagel donut pretzel pudding cherry melon pear fig lime orange mint basil thyme sage poppy lilac violet pansy robin sparrow finch wren otter badger rabbit squirrel hedgehog kitten puppy panda koala turtle ducky bunny pony lamb sunny rainy cloudy breezy snowy misty foggy dewy cozy sleepy happy gentle quiet little tiny fluffy woolly rustic cobble ember hazel amber pearl coral marble velvet cotton linen wool cabbage carrot pumpkin radish sunset moonlit apricot clementine'.split(' ');
  var KEY = 'duet-maker', STEPS = 4;
  var $ = function (s) { return document.querySelector(s); };
  var ROOT = location.origin.replace('//dash.', '//'), ROOT_HOST = location.host.replace(/^dash\./, '');
  function fresh() { return { i: 0, a: { n: '', an: 'cat' }, b: { n: '', an: 'deer' }, slug: '', ok: null, pass: '', show: false, busy: false, sent: false, ticket: '', note: false }; }
  var S = fresh(), poll = null, slugTimer = 0, slugSeq = 0;
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) { S.sent = !!saved.sent; S.i = Math.min(saved.i | 0, STEPS - 1); S.a = saved.a || S.a; S.b = saved.b || S.b; S.slug = saved.slug || ''; S.ticket = saved.ticket || ''; S.note = !!saved.note; }
  } catch (e) { /* nothing saved */ }
  if (S.i > 2) S.i = 2;   // the passphrase is never stored, so a refresh goes back to choosing it
  function keep() { try { localStorage.setItem(KEY, JSON.stringify({ i: S.i, a: S.a, b: S.b, slug: S.slug, sent: S.sent, ticket: S.ticket, note: S.note })); } catch (e) { /* private mode */ } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  var I = {
    ok: '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6"/></svg>', no: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    go: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>', bk: '<svg viewBox="0 0 24 24"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12q10-12 20 0-10 12-20 0z"/><circle cx="12" cy="12" r="3"/></svg>',
    cp: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="#594739"/><circle cx="15" cy="15" r="1" fill="#594739"/><circle cx="15" cy="9" r="1" fill="#594739"/><circle cx="9" cy="15" r="1" fill="#594739"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M5 9h13l-3-3M19 15H6l3 3"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M12 3.2c5 -.2 8.9 3.6 8.8 8.7 -.1 5 -3.8 8.9 -8.9 8.8 -5 -.1 -8.7 -3.9 -8.7 -8.9 0 -4.800 3.700 -8.500 8.800 -8.600z"/><path d="M12 10.800v5.600"/><path d="M12 7.300v.1" stroke-width="2.600"/></svg>',
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/></svg>'
  };
  var TIPS = {
    a: 'Type your name in the first card and the other person\'s name in the second. Tap a picture to swap the two animals.',
    address: 'This is the web address of your wall. Pick a short one that is easy to share. Use letters, numbers or hyphens.',
    pass: 'You both use this passphrase to open the wall. Choose one you will remember, or tap the dice to get one. Share it only with the other person.',
    look: 'Check that everything is right. Tap a pencil to change something. Then press Send request.',
    wait: 'Your request is waiting for me to approve it. You can close this page and come back later. The address starts working once it is approved.'
  };
  function info(k) { return '<button type="button" class="inf" data-i="' + k + '" aria-label="What is this?" aria-expanded="false">' + I.info + '</button>'; }
  /* the explanation opens as a small note beside the cards (below them on a narrow screen), never on the card itself */
  var box = document.createElement('aside'); box.className = 'infobox'; box.hidden = true; box.setAttribute('role', 'note'); document.body.appendChild(box);
  var infoBtn = null;
  function closeInfo() { box.hidden = true; if (infoBtn) infoBtn.setAttribute('aria-expanded', 'false'); infoBtn = null; }
  function placeInfo() {
    if (!infoBtn || !infoBtn.isConnected) { closeInfo(); return; }
    var anchor = infoBtn.closest('.duo') || infoBtn.closest('.mine') || infoBtn.closest('.card'), r = anchor.getBoundingClientRect(), b = infoBtn.getBoundingClientRect();
    var room = innerWidth - r.right - 18, side = room >= 210, w = side ? Math.min(250, room) : Math.min(340, innerWidth - 24);
    box.style.width = w + 'px'; box.classList.toggle('side', side); box.classList.toggle('below', !side);
    if (side) { box.style.left = (r.right + 18) + 'px'; box.style.top = Math.max(10, b.top - 6) + 'px'; }
    else {
      box.style.left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
      var h = box.offsetHeight, nav = host.querySelector('.stepnav'), under = (nav ? nav.getBoundingClientRect().bottom : r.bottom) + 10;
      if (under + h <= innerHeight - 8) box.style.top = under + 'px';                  /* under the buttons, never over Next */
      else if (r.top - h - 12 >= 8) box.style.top = (r.top - h - 12) + 'px';           /* above the card */
      else box.style.top = Math.max(8, innerHeight - h - 8) + 'px';                     /* last resort: bottom of the screen */
      box.classList.toggle('below', !nav && under + h <= innerHeight - 8);
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.inf');
    if (b) { if (infoBtn === b) return closeInfo(); closeInfo(); infoBtn = b; b.setAttribute('aria-expanded', 'true'); box.textContent = TIPS[b.dataset.i]; box.hidden = false; placeInfo(); return; }
    if (!box.hidden && !(e.target.closest && e.target.closest('.infobox'))) closeInfo();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeInfo(); });
  addEventListener('resize', placeInfo);
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function slugify(t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, ''); }
  function slugShape(s) { return /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,22}[a-z0-9])$/.test(s) && s.indexOf('--') < 0; }
  var NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{0,19}$/u;

  /* ---- tape. Yellow is always one strip across. Red: one strip, or one long piece over a top corner.
         Green and blue: an upright pair, one strip, or two slanted pieces. Chosen from a key, so a note keeps its look. ---- */
  var ROLLS = ['red', 'yellow', 'blue', 'green'];
  var RULES = { yellow: ['h'], red: ['h', 'dtr', 'dtl'], green: ['v', 'h', 'c2', 'c2b'], blue: ['v', 'h', 'c2', 'c2b'] };
  var PIECES = { h: 1, v: 2, c2: 2, c2b: 2, dtr: 1, dtl: 1 };
  function hash(str) { return Array.from(str).reduce(function (v, ch) { return Math.imul(v ^ ch.charCodeAt(0), 16777619) >>> 0; }, 2166136261); }
  function strip(el, key) { var roll = ROLLS[hash(key) % 4]; el.dataset.tape = 'h'; var t = document.createElement('img'); t.src = '/assets/tape-' + roll + '.webp'; t.alt = ''; t.className = 'tp ' + roll; el.appendChild(t); }
  function taped(el, key) {
    var h = hash(key), roll = ROLLS[h % 4], opts = RULES[roll], lay = opts[(h >>> 3) % opts.length];
    el.dataset.tape = lay;
    for (var i = 0; i < PIECES[lay]; i++) { var t = document.createElement('img'); t.src = '/assets/tape-' + roll + '.webp'; t.alt = ''; t.className = 'tp ' + roll; el.appendChild(t); }
  }

  /* ---- validation ---- */
  function namesState() {
    var a = S.a.n.trim(), b = S.b.n.trim();
    if ((a && !NAME.test(a)) || (b && !NAME.test(b))) return 'Letters, numbers and spaces only.';
    if (a && b && a.toLowerCase() === b.toLowerCase()) return 'Use two different names.';
    return a && b ? 'ok' : '';
  }
  function valid() {
    if (S.i === 0) return namesState() === 'ok';
    if (S.i === 1) return slugShape(S.slug) && S.ok === true;
    if (S.i === 2) return Array.from(S.pass).length >= 3;
    return true;
  }
  function hint(text, cls) { var e = $('#hint'); if (e) { e.textContent = text || ''; e.className = 'hint' + (cls ? ' ' + cls : ''); } }
  function refresh() {
    var g = $('#go'); if (g) g.disabled = !valid() || S.busy;
    if (S.i === 0) { var n = namesState(); hint(n === 'ok' ? '' : n, n && n !== 'ok' ? 'bad' : ''); }
    if (S.i === 1) {
      var s = S.slug, st = $('#st');
      if (!s) hint(''); else if (!slugShape(s)) hint('1 to 24 letters, numbers or hyphens.', 'bad'); else if (S.ok === false) hint('Not available. Try another.', 'bad'); else if (S.ok === true) hint('Free.', 'good'); else hint('');
      if (st) { st.className = 'ic ' + (S.ok === true ? 'ok' : S.ok === false && s ? 'no' : ''); st.innerHTML = !s ? '' : !slugShape(s) ? I.no : S.ok === null ? '<i class="sp"></i>' : S.ok ? I.ok : I.no; }
    }
    if (S.i === 2) { var len = Array.from(S.pass).length; hint(len && len < 3 ? 'At least 3 characters.' : len >= 3 && len < 6 ? 'Longer is safer.' : '', len && len < 3 ? 'bad' : ''); }
  }
  function candidates() {
    var a = slugify(S.a.n), b = slugify(S.b.n), out = [];
    if (a && b) out = [a + '-' + b, a + '-and-' + b, b + '-' + a, a + b]; else if (a || b) out = [a || b];
    return out.map(function (c) { return c.slice(0, 24).replace(/-+$/, ''); }).filter(function (c, i, all) { return slugShape(c) && all.indexOf(c) === i; }).slice(0, 4);
  }
  function check() {
    clearTimeout(slugTimer);
    if (!slugShape(S.slug)) { S.ok = null; refresh(); return; }
    S.ok = null; refresh(); var seq = ++slugSeq, want = S.slug;
    slugTimer = setTimeout(function () {
      fetch('/api/slug?slug=' + encodeURIComponent(want)).then(function (r) { return r.json(); }).then(function (j) {
        if (seq !== slugSeq) return; S.ok = !!j.ok; refresh();
      }).catch(function () { if (seq === slugSeq) { S.ok = null; hint('Could not check. Try again.', 'bad'); } });
    }, 350);
  }
  function suggest() {
    var box = $('#sug'); if (!box) return;
    if (S.slug) { box.innerHTML = ''; return; }   // their own address: no suggestions
    box.innerHTML = candidates().filter(function (c) { return c !== S.slug; }).map(function (c) { return '<button class="chip" data-s="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.chip'), function (b) { b.onclick = function () { S.slug = b.dataset.s; $('#sl').value = S.slug; keep(); check(); suggest(); }; });
  }

  /* ---- drawing the steps ---- */
  var host = $('#scene'), chipsEl = $('#chips');
  function stepOk(k) { return k === 0 ? namesState() === 'ok' : k === 1 ? slugShape(S.slug) && S.ok === true : k === 2 ? Array.from(S.pass).length >= 3 : true; }
  function reach(n) { if (n <= S.i) return true; for (var k = 0; k < n; k++) if (!stepOk(k)) return false; return true; }   // forward only when the steps before are done
  function chips() {
    var NAMES = ['Names', 'Address', 'Passphrase', 'Review'];
    chipsEl.innerHTML = S.sent ? '' : Array.apply(null, Array(STEPS)).map(function (_, n) { return '<button type="button" class="' + (n < S.i ? 'd' : n === S.i ? 'c' : '') + (reach(n) ? '' : ' off') + '" data-n="' + n + '" aria-label="Step ' + (n + 1) + ': ' + NAMES[n] + '" title="' + NAMES[n] + '"' + (n === S.i ? ' aria-current="step"' : '') + '></button>'; }).join('');
    Array.prototype.forEach.call(chipsEl.querySelectorAll('button'), function (b) { b.onclick = function () { var n = Number(b.dataset.n); if (n !== S.i && reach(n)) go(n); }; });
  }
  function nav(wide, last) {
    return '<div class="stepnav' + (wide ? ' wide' : '') + '"><p class="hint" id="hint" role="status"></p><div class="nav">' + (S.i ? '<button class="bk" id="bk" aria-label="Back">' + I.bk + '<span>Back</span></button>' : '<span></span>')
      + (last ? '<button class="go send" id="go">Send request' + I.go + '</button>' : '<button class="go" id="go" aria-label="Next"><span>Next</span>' + I.go + '</button>') + '</div></div>';
  }
  function tagCard(p, paper) {
    var d = S[p], other = ANIMALS.filter(function (x) { return x !== d.an; })[0];
    return '<div class="card ' + paper + ' pre" data-k="who-' + p + '">' + (p === 'a' ? info('a') : '') + '<button class="pt" data-p="' + p + '" aria-label="' + d.an + '. Tap to swap the two animals."><img alt="" src="/assets/portrait-' + d.an + '.webp"><span class="sw">' + I.swap + '</span></button>'
      + '<input class="f nm" id="n' + p + '" aria-label="' + (p === 'a' ? 'Your name' : 'Their name') + '" placeholder="' + (p === 'a' ? 'you' : 'them') + '" maxlength="20" autocomplete="off" value="' + esc(d.n) + '"></div>';
  }
  function paintPw() { var v = $('#pwv'); if (!v) return; var e = $('#pwe'); v.textContent = S.show ? S.pass : '•'.repeat(Math.min(Array.from(S.pass).length, 14)); v.classList.toggle('open', !!S.show); if (e) { e.setAttribute('aria-label', S.show ? 'Hide passphrase' : 'Show passphrase'); e.classList.toggle('on', !!S.show); } }
  function dots() { var d = $('#dots'); if (d) d.innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<b class="' + (Array.from(S.pass).length > n ? 'on' : '') + '"></b>'; }).join(''); }
  function reveal() {
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      Array.prototype.forEach.call(host.querySelectorAll('.card'), function (c) { strip(c, c.dataset.k || 'x' + S.i); c.classList.remove('pre'); });
    }); });
  }
  function draw() {
    closeInfo();
    if (poll) { poll.stop(); poll = null; }
    chips();
    if (S.sent) return sent();
    var i = S.i;
    if (i === 0) {
      host.innerHTML = '<div class="duo">' + tagCard('a', 'rose') + tagCard('b', 'sage') + '</div>' + nav(true);
    } else if (i === 1) {
      host.innerHTML = '<div class="card cream solo pre" data-k="address">' + info('address') + '<h1 class="lb">ADDRESS</h1><div class="row"><span class="pre2">' + esc(ROOT_HOST) + '/</span><input class="f" id="sl" aria-label="Address" maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="off" value="' + esc(S.slug) + '"><span class="ic" id="st"></span></div><div class="sug" id="sug"></div></div>' + nav(false);
    } else if (i === 2) {
      host.innerHTML = '<div class="card blue solo pre" data-k="pass">' + info('pass') + '<h1 class="lb">PASSPHRASE</h1><div class="row"><input class="f" id="pw" type="' + (S.show ? 'text' : 'password') + '" aria-label="Passphrase" autocomplete="new-password" maxlength="64" value="' + esc(S.pass) + '"><button class="ic" id="ey" aria-label="Show passphrase">' + I.eye + '</button><button class="ic" id="dc" aria-label="Make me a passphrase" title="Make me a passphrase">' + I.dice + '</button></div><div class="dots" id="dots" aria-hidden="true"></div></div>' + nav(false);
    } else {
      var a = S.a, b = S.b;
      host.innerHTML = '<div class="card cream look pre" data-k="look">' + info('look') + '<div class="walls"><figure><img alt="" src="/assets/' + a.an + '-seat.webp"><figcaption>' + esc(a.n.trim()) + '<button class="ic" data-edit="0" aria-label="Change names">' + I.pen + '</button></figcaption></figure>'
        + '<figure><img alt="" src="/assets/' + b.an + '-seat.webp"><figcaption>' + esc(b.n.trim()) + '</figcaption></figure></div>'
        + '<div class="addr"><span>' + esc(ROOT_HOST + '/' + S.slug) + '</span><button class="ic" data-edit="1" aria-label="Change address">' + I.pen + '</button></div>'
        + '<p class="pw-note"><span class="k">Passphrase</span><span class="v" id="pwv"></span><button class="ic" id="pwe" aria-label="Show passphrase">' + I.eye + '</button><button class="ic" data-edit="2" aria-label="Change passphrase">' + I.pen + '</button></p></div>' + nav(false, true);
    }
    wire(); reveal(); refresh(); if (i === 3) paintPw();
    var first = host.querySelector('input'); if (first && !first.value) first.focus({ preventScroll: true });
  }
  /* the two cards slide across each other, each carrying its animal; the names fade in once they land */
  function swapCards(before) {
    var cs = host.querySelectorAll('.duo .card');
    if (cs.length !== 2 || before.length !== 2 || !cs[0].animate || (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)) return;
    Array.prototype.forEach.call(cs, function (c, n) {
      var r = c.getBoundingClientRect(), o = before[1 - n], end = getComputedStyle(c).transform;
      c.classList.remove('pre'); c.style.transition = 'none'; c.style.zIndex = n ? 1 : 3;
      c.animate([{ transform: 'translate(' + (o.left - r.left) + 'px,' + (o.top - r.top - 18) + 'px) rotate(' + (n ? -5 : 5) + 'deg)' }, { transform: 'translate(' + ((o.left - r.left) * .45) + 'px,-34px) rotate(' + (n ? 3 : -3) + 'deg)', offset: .45 }, { transform: end }], { duration: 560, easing: 'cubic-bezier(.3,1.1,.4,1)' });
      var nm = c.querySelector('.nm'); if (nm) nm.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1 }], { duration: 560 });
      setTimeout(function () { c.style.transition = ''; c.style.zIndex = ''; }, 620);
    });
  }
  function go(n) { S.i = n; keep(); draw(); }
  function wire() {
    var i = S.i, g = $('#go'), b = $('#bk');
    if (b) b.onclick = function () { go(i - 1); };
    if (g) g.onclick = function () { if (!valid() || S.busy) return; if (i === 3) send(); else go(i + 1); };
    Array.prototype.forEach.call(host.querySelectorAll('[data-edit]'), function (e) { e.onclick = function () { go(Number(e.dataset.edit)); }; });
    if (i === 0) {
      var swapping = false;
      function ptLabel(an) { return an + '. Tap to swap the two animals.'; }
      Array.prototype.forEach.call(host.querySelectorAll('.pt'), function (e) { e.onclick = function () {
        if (swapping) return; swapping = true;
        var before = Array.prototype.map.call(host.querySelectorAll('.duo .card'), function (c) { return c.getBoundingClientRect(); });
        S.a.n = $('#na').value; S.b.n = $('#nb').value;
        var t = S.a.an; S.a.an = S.b.an; S.b.an = t; keep();
        draw(); swapCards(before);
        setTimeout(function () { swapping = false; }, 600);
      }; });
      ['a', 'b'].forEach(function (p) { $('#n' + p).oninput = function () { S[p].n = this.value; if (S.slug === '' ) S.ok = null; keep(); refresh(); }; $('#n' + p).onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); if (p === 'a') $('#nb').focus(); else if (valid()) g.click(); } }; });
    }
    if (i === 1) {
      var sl = $('#sl'); sl.oninput = function () { S.slug = this.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); this.value = S.slug; keep(); check(); suggest(); };
      sl.onkeydown = function (e) { if (e.key === 'Enter' && valid()) g.click(); };
      suggest(); if (S.slug) check();
    }
    if (i === 3) { $('#pwe').onclick = function () { S.show = !S.show; paintPw(); }; }
    if (i === 2) {
      var pw = $('#pw'); dots();
      pw.oninput = function () { S.pass = this.value; dots(); refresh(); };
      pw.onkeydown = function (e) { if (e.key === 'Enter' && valid()) g.click(); };
      $('#ey').onclick = function () { S.show = !S.show; pw.type = S.show ? 'text' : 'password'; this.classList.toggle('on', S.show); };
      $('#dc').onclick = function () {
        var u = new Uint32Array(2); crypto.getRandomValues(u);   // 128 words and 10 to 99, so no modulo bias
        S.pass = WORDS[u[0] % 128] + (10 + u[1] % 90); S.show = true;
        pw.value = S.pass; pw.type = 'text'; dots(); refresh();
      };
    }
  }

  /* ---- sending, then waiting ---- */
  function send() {
    S.busy = true; refresh(); $('#go').textContent = '…';
    var tz; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = 'UTC'; }
    fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: [S.a.n.trim(), S.b.n.trim()], animals: [S.a.an, S.b.an], slug: S.slug, passphrase: S.pass, timezone: tz }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (res) {
        if (res.r.status === 201 || res.r.status === 200) { S.sent = true; S.ticket = res.j.ticket || ''; S.note = false; S.busy = false; keep(); return draw(); }
        S.busy = false;
        if (res.r.status === 409) { S.ok = false; go(1); setTimeout(function () { hint('That address was just taken.', 'bad'); }, 320); return; }
        $('#go').textContent = 'Send request'; refresh(); hint(res.j.error || 'Could not send. Try again.', 'bad');
      }).catch(function () { S.busy = false; $('#go').textContent = 'Send request'; refresh(); hint('Connection lost. Try again.', 'bad'); });
  }
  function copy(text, btn, label) { try { navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ } var old = btn.innerHTML; btn.innerHTML = label || I.ok; setTimeout(function () { btn.innerHTML = old; }, 1600); }
  function sent() {
    var url = ROOT + '/' + S.slug;
    host.innerHTML = '<div id="live"></div><div class="keep" id="keep"></div><div class="acts2" id="acts"></div>';
    var acts = $('#acts'), keep2 = $('#keep'), shown = false;
    function paintKeep(state) {
      if (state === 'declined') { keep2.innerHTML = ''; return; }
      if (!S.pass) { keep2.innerHTML = '<p class="kt">Your passphrase can\'t be shown again.</p><p class="kt"><button class="bk" id="kad">' + I.cp + '<span>Copy address</span></button></p>'; $('#kad').onclick = function () { copy(url, $('#kad'), '<span>Copied</span>'); }; return; }
      keep2.innerHTML = '<div class="kv"><span class="k">Passphrase</span><span class="v' + (shown ? ' open' : '') + '" id="kval">' + (shown ? esc(S.pass) : '•'.repeat(Math.min(Array.from(S.pass).length, 12))) + '</span><button class="ic' + (shown ? ' on' : '') + '" id="keye" aria-label="' + (shown ? 'Hide' : 'Show') + ' passphrase">' + I.eye + '</button><button class="ic" id="kcp" aria-label="Copy address and passphrase" title="Copy address and passphrase">' + I.cp + '</button></div>'
        + '<p class="kt">Save it now. It can\'t be shown again.</p>';
      $('#keye').onclick = function () { shown = !shown; paintKeep(state); };
      $('#kcp').onclick = function () { copy('Come to our wall: ' + url + '\nPassphrase: ' + S.pass, $('#kcp')); };
    }
    function actions(state) {
      closeInfo();
      var h = '';
      if (state === 'live') h += '<a class="go" href="' + esc(url) + '"><span>Open</span>' + I.go + '</a>' + (S.pass ? '<button class="bk" id="inv">' + I.cp + '<span>Copy invite</span></button>' : '');
      if (state === 'wait') h += '<button class="bk" id="addnote">' + I.pen + '<span>' + (S.note ? 'Edit note' : 'Add a note') + '</span></button>';
      h += '<button class="lnk" id="again">New request</button>';
      acts.innerHTML = h; paintKeep(state);
      if ($('#inv')) $('#inv').onclick = function () { copy('Come to our wall: ' + url + '\nPassphrase: ' + S.pass, $('#inv'), '<span>Copied</span>'); };
      if ($('#addnote')) $('#addnote').onclick = openNote;
      $('#again').onclick = function () { if (poll) poll.stop(); poll = null; forget(); S = fresh(); draw(); };
    }
    actions('wait');
    poll = DashStatus.mount($('#live'), { slug: S.slug, pair: { a: S.a, b: S.b }, rootUrl: ROOT, onState: actions, info: info('wait') });
  }

  /* ---- the optional note for the owner, sent while waiting ---- */
  var nd = $('#notedlg'), ntx = $('#notetx'), ncnt = $('#notecnt'), nhint = $('#notehint');
  function openNote() { ntx.value = S.noteText || ''; ncnt.textContent = ntx.value.length + ' / 400'; nhint.textContent = ''; nd.showModal(); ntx.focus(); }
  ntx.oninput = function () { ncnt.textContent = this.value.length + ' / 400'; };
  $('#note-x').onclick = function () { nd.close(); };
  nd.addEventListener('click', function (e) { if (e.target === nd) nd.close(); });
  $('#notego').onclick = function () {
    var t = ntx.value.trim(); if (!t) { nhint.className = 'hint bad'; nhint.textContent = 'Write a few words first.'; return; }
    var b = this; b.disabled = true;
    fetch('/api/request/note', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: S.slug, ticket: S.ticket, note: t }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        b.disabled = false;
        if (x.r.status === 200) { S.note = true; S.noteText = t; keep(); nhint.className = 'hint good'; nhint.textContent = 'Sent. Thank you.'; var a = $('#addnote'); if (a) a.lastChild.textContent = 'Edit note'; setTimeout(function () { if (nd.open) nd.close(); }, 900); }
        else { nhint.className = 'hint bad'; nhint.textContent = x.r.status === 409 ? 'This request was already decided.' : (x.j.error || 'Could not send. Try again.'); }
      }).catch(function () { b.disabled = false; nhint.className = 'hint bad'; nhint.textContent = 'Connection lost. Try again.'; });
  };

  /* ---- music: the same player as the main page's settings (same saved volume and track), nothing else ---- */
  var TRACKS = [['Coffee', '/assets/coffee.mp3'], ['Tranquil', '/assets/calm.mp3'], ['Sky', '/assets/coffee-evening.mp3']];
  var AUD = 'duet-audio', TRK = 'duet-track', audio = new Audio(), playing = false, muted = false, volume = 30, track = 0, dlg = $('#sound');
  try { var sv = JSON.parse(localStorage.getItem(AUD) || 'null'); if (sv) { volume = Math.max(0, Math.min(100, Number(sv.volume))); if (isNaN(volume)) volume = 30; muted = !!sv.muted; } track = Math.max(0, Math.min(2, Number(JSON.parse(localStorage.getItem(TRK) || '0')) || 0)); } catch (e) { /* defaults */ }
  audio.volume = volume / 100; audio.src = TRACKS[track][1];
  function saveAudio() { try { localStorage.setItem(AUD, JSON.stringify({ volume: volume, muted: muted })); localStorage.setItem(TRK, JSON.stringify(track)); } catch (e) { /* private mode */ } }
  function paintSound() {
    $('#sndl').textContent = playing ? 'Mute' : 'Play'; $('#snd').setAttribute('aria-pressed', playing);
    $('#snd svg').innerHTML = playing ? '<path d="M5 12l5-1 7-6v22l-7-6-5-1zM21 12l6 8m0-8l-6 8"/>' : '<path d="m10 5 17 11-18 12z"/>';
    $('#trk').textContent = TRACKS[track][0]; $('#vol').value = volume; $('#volv').textContent = volume + '%';
  }
  function musicOn() {
    muted = false; saveAudio(); var p = audio.play();
    (p && p.then ? p : Promise.resolve()).then(function () { playing = true; paintSound(); }).catch(function () {
      playing = false; paintSound();   // the browser wanted a tap first: try once more on the next one
      var again = function () { removeEventListener('pointerdown', again, true); if (!muted && !playing) audio.play().then(function () { playing = true; paintSound(); }).catch(function () {}); };
      addEventListener('pointerdown', again, true);
    });
  }
  function musicOff() { muted = true; playing = false; audio.pause(); saveAudio(); paintSound(); }
  function choose(n, play) { track = n % TRACKS.length; audio.src = TRACKS[track][1]; saveAudio(); if (play) musicOn(); else paintSound(); }
  $('#snd').onclick = function () { playing ? musicOff() : musicOn(); };
  $('#nxt').onclick = function () { choose(track + 1, playing); };
  $('#vol').oninput = function () { volume = Number(this.value); audio.volume = volume / 100; saveAudio(); $('#volv').textContent = volume + '%'; };
  audio.addEventListener('ended', function () { choose(track + 1, true); });
  $('#gear').onclick = function () { dlg.showModal(); };
  $('#sound-x').onclick = function () { dlg.close(); };
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) audio.pause(); else if (playing) audio.play().catch(function () {}); });
  paintSound();

  /* ---- the what-it-is page comes first; the steps open after "I have read this" ---- */
  var READ = 'duet-read';
  function proceed() { document.documentElement.dataset.read = 'yes'; window.scrollTo(0, 0); draw(); }
  /* the first page is three short pages inside one card, so nothing has to scroll */
  (function () {
    var pgs = Array.prototype.slice.call(document.querySelectorAll('#about .pg')), cur = 0, dots = $('#apdots'), TT = ['WHAT THIS IS', 'HOW TO START', 'PLEASE KNOW'];
    function paint() {
      pgs.forEach(function (e, n) { e.classList.toggle('on', n === cur); });
      dots.innerHTML = pgs.map(function (_, n) { return '<button type="button" class="' + (n < cur ? 'd' : n === cur ? 'c' : '') + '" data-n="' + n + '" aria-label="Page ' + (n + 1) + '"' + (n === cur ? ' aria-current="step"' : '') + '></button>'; }).join('');
      Array.prototype.forEach.call(dots.querySelectorAll('button'), function (b) { b.onclick = function () { cur = Number(b.dataset.n); paint(); }; });
      $('#ab-t').textContent = TT[cur] || TT[0];
      var last = cur === pgs.length - 1; $('#about .apnav').classList.toggle('last', last);
      $('#apback').style.visibility = cur ? 'visible' : 'hidden'; $('#apnext').style.display = last ? 'none' : ''; $('#read').style.display = last ? '' : 'none';
    }
    $('#apback').onclick = function () { cur = Math.max(0, cur - 1); paint(); };
    $('#apnext').onclick = function () { cur = Math.min(pgs.length - 1, cur + 1); paint(); };
    paint();
  })();
  var seen = false; try { seen = localStorage.getItem(READ) === '1'; } catch (e) { /* treat as first visit */ }
  var about = $('#about'); about.dataset.tape = 'h'; (function () { var t = document.createElement('img'); t.src = '/assets/tape-blue.webp'; t.alt = ''; t.className = 'tp blue'; about.appendChild(t); })();
  if (seen || S.sent) proceed();
  else {
    document.documentElement.dataset.read = 'no';
    $('#read').onclick = function () {
      try { localStorage.setItem(READ, '1'); } catch (e) { /* ignore */ }
      musicOn();   // the click is the gesture that lets the browser play, so it always starts here
      proceed();
    };
  }
  /* the "i" next to the gear brings the intro back, any time; continuing goes back to where you were */
  $('#infoopen').onclick = function () {
    closeInfo(); document.documentElement.dataset.read = 'no'; $('#read').onclick = function () { proceed(); };
    var first = document.querySelector('#about .pg'); if (first) { $('#apback').click(); $('#apback').click(); }
    window.scrollTo(0, 0);
  };
})();
