/* Project Duet maker: names and animals, an address, a passphrase. Then a request waits for approval. */
(function () {
  var ANIMALS = ['deer', 'cat'];
  var WORDS = ('moss ember lantern otter clover tide hazel finch ripple amber fern harbor wren cedar dune pebble thistle maple comet willow marsh sparrow cinder dawn meadow lark brook acorn birch cloud '
    + 'daisy elder falcon grove heron iris juniper kettle lily mist nettle olive pine quill robin sage tulip umber violet walnut yarrow zephyr almond basil cobble dapple eddy flint garnet hollow '
    + 'ivory jasper kindle linen mallow nimbus orchid poppy quartz reed sorrel thimble upland vesper wheat yonder zinnia apricot bramble pearl dewdrop echo fable glimmer hearth inkwell jonquil '
    + 'kite lagoon rose nutmeg oak petal quince rowan sundial tansy ulmus velvet willet amberly moor copper drizzle snow wisp gable harvest island jam knoll lullaby solar lunar oatmeal pasture '
    + 'quiet thaw saffron storm bluff cricket dove fawn gorse hickory lilac plum').split(' ').slice(0, 128);
  var PAPER = ['cream', 'rose', 'sage'], TAPE = '/assets/tape.svg', KEY = 'duet-maker';
  var $ = function (s) { return document.querySelector(s); };
  var S = { i: 0, a: { n: '', an: 'cat' }, b: { n: '', an: 'deer' }, slug: '', ok: null, sug: [], pass: '', show: false, busy: false, sent: false, gone: false };
  var tick = 0, pollTimer = 0;
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) { S.sent = !!saved.sent; S.i = Math.min(saved.i | 0, 2); S.a = saved.a || S.a; S.b = saved.b || S.b; S.slug = saved.slug || ''; }
  } catch (e) { /* nothing saved */ }
  function keep() { try { localStorage.setItem(KEY, JSON.stringify({ i: S.i, a: S.a, b: S.b, slug: S.slug, sent: S.sent })); } catch (e) { /* private mode */ } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

  var I = {
    ok: '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6"/></svg>', no: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    go: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>', bk: '<svg viewBox="0 0 24 24"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12q10-12 20 0-10 12-20 0z"/><circle cx="12" cy="12" r="3"/></svg>',
    cp: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>',
    hg: '<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 18M17 3c0 12-10 12-10 18"/></svg>',
    dice: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="#594739"/><circle cx="15" cy="15" r="1" fill="#594739"/><circle cx="15" cy="9" r="1" fill="#594739"/><circle cx="9" cy="15" r="1" fill="#594739"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M5 9h13l-3-3M19 15H6l3 3"/></svg>'
  };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function slugify(t) { return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/, ''); }
  function slugShape(s) { return /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,22}[a-z0-9])$/.test(s) && s.indexOf('--') < 0; }
  var NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{0,19}$/u;
  function namesState() {
    var a = S.a.n.trim(), b = S.b.n.trim();
    if ((a && !NAME.test(a)) || (b && !NAME.test(b))) return 'Letters, numbers and spaces only.';
    if (a && b && a.toLowerCase() === b.toLowerCase()) return 'Use two different names.';
    return a && b ? 'ok' : '';
  }
  function valid() {
    if (S.i === 0) return namesState() === 'ok';
    if (S.i === 1) return slugShape(S.slug) && S.ok === true;
    return Array.from(S.pass).length >= 3;
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
    if (S.i === 2) { var len = Array.from(S.pass).length; hint(len && len < 3 ? 'At least 3 characters.' : len >= 3 && len < 8 ? 'Longer is safer.' : '', len && len < 3 ? 'bad' : ''); }
  }

  /* ---- address: check what is typed, and offer free variations of the names ---- */
  function candidates() {
    var a = slugify(S.a.n), b = slugify(S.b.n), out = [];
    if (a && b) out = [a + '-' + b, a + '-and-' + b, b + '-' + a, a + b];
    else if (a || b) out = [a || b];
    return out.map(function (c) { return c.slice(0, 24).replace(/-+$/, ''); }).filter(function (c, i, all) { return slugShape(c) && all.indexOf(c) === i; }).slice(0, 4);
  }
  function free(s) { return fetch('/api/slug?slug=' + encodeURIComponent(s)).then(function (r) { return r.json(); }).then(function (j) { return !!j.ok; }); }
  function check() {
    var s = S.slug, t = ++tick; S.ok = null; refresh();
    if (!slugShape(s)) { S.ok = false; refresh(); return; }
    free(s).then(function (ok) { if (t === tick) { S.ok = ok; refresh(); } }).catch(function () { if (t === tick) { S.ok = null; refresh(); } });
  }
  function suggest() {
    var list = candidates();
    Promise.all(list.map(function (c) { return free(c).then(function (ok) { return ok ? c : null; }).catch(function () { return null; }); })).then(function (r) {
      S.sug = r.filter(Boolean).slice(0, 3);
      var box = $('#sug'); if (!box) return;
      box.innerHTML = S.sug.map(function (c) { return '<button class="chip" data-s="' + esc(c) + '">' + esc(c) + '</button>'; }).join('');
      box.querySelectorAll('.chip').forEach(function (b) { b.onclick = function () { S.slug = b.dataset.s; $('#sl').value = S.slug; check(); keep(); }; });
      if (!S.slug && S.sug.length) { S.slug = S.sug[0]; var f = $('#sl'); if (f) f.value = S.slug; check(); keep(); }
    });
  }

  /* ---- cards ---- */
  function tag(p) {
    var d = S[p], other = ANIMALS.filter(function (x) { return x !== d.an; })[0];
    return '<div class="tg"><button class="pt" data-p="' + p + '" aria-label="' + d.an + '. Tap to change to ' + other + '."><img alt="" src="/assets/portrait-' + d.an + '.svg"><span class="sw">' + I.swap + '</span></button>'
      + '<input class="f nm" id="n' + p + '" aria-label="' + (p === 'a' ? 'Your name' : 'Their name') + '" placeholder="' + (p === 'a' ? 'you' : 'them') + '" maxlength="20" autocomplete="off" value="' + esc(d.n) + '"></div>';
  }
  function body() {
    var i = S.i, h = '';
    if (i === 0) h = '<h1 class="lb">WHO</h1><div class="tags">' + tag('a') + tag('b') + '</div>';
    if (i === 1) h = '<h1 class="lb">ADDRESS</h1><div class="row"><span class="pre2">' + esc(location.host) + '/</span><input class="f" id="sl" aria-label="Address" maxlength="24" autocomplete="off" spellcheck="false" autocapitalize="off" value="' + esc(S.slug) + '"><span class="ic" id="st"></span></div><div class="sug" id="sug"></div>';
    if (i === 2) h = '<h1 class="lb">PASSPHRASE</h1><div class="row"><input class="f" id="pw" type="' + (S.show ? 'text' : 'password') + '" aria-label="Passphrase" autocomplete="new-password" maxlength="64" value="' + esc(S.pass) + '"><button class="ic" id="ey" aria-label="Show passphrase">' + I.eye + '</button><button class="ic" id="dc" aria-label="Make me a passphrase" title="Make me a passphrase">' + I.dice + '</button></div><p class="slip" id="slip"></p><div class="dots" aria-hidden="true">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (n) { return '<b class="' + (Array.from(S.pass).length > n ? 'on' : '') + '"></b>'; }).join('') + '</div>';
    return h + '<p class="hint" id="hint" role="status"></p><div class="nav">' + (i ? '<button class="bk" id="bk" aria-label="Back">' + I.bk + '</button>' : '<span></span>') + (i === 2 ? '<button class="cta" id="go">Send request</button>' : '<button class="go" id="go" aria-label="Next">' + I.go + '</button>') + '</div>';
  }
  function draw() {
    var c = $('#card'); c.className = 'card ' + PAPER[S.i] + ' pre'; c.innerHTML = '<img class="tp" src="' + TAPE + '" alt="">' + body(); c.setAttribute('aria-label', 'Step ' + (S.i + 1) + ' of 3');
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.remove('pre'); }); });
    $('#chips').innerHTML = PAPER.map(function (p, n) { return '<button class="' + p + ' ' + (n < S.i ? 'd' : n === S.i ? 'c' : '') + '" ' + (n > S.i ? 'disabled' : '') + ' data-n="' + n + '" aria-label="Step ' + (n + 1) + '"></button>'; }).join('');
    bind(); refresh(); keep();
    if (S.i === 2 && S.show && $('#slip')) $('#slip').textContent = S.pass;
    if (S.i === 1) { suggest(); if (S.slug) check(); }
    var f = c.querySelector('input'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
  }
  function go(n) { var c = $('#card'); c.classList.add('out'); setTimeout(function () { S.i = n; draw(); }, 230); }
  function next() { if (!valid() || S.busy) return; if (S.i < 2) { if (S.i === 0 && !S.slug) S.ok = null; return go(S.i + 1); } send(); }

  function bind() {
    document.querySelectorAll('.pt').forEach(function (b) {
      b.onclick = function () {
        var d = S[b.dataset.p]; d.an = ANIMALS.filter(function (x) { return x !== d.an; })[0];
        b.querySelector('img').src = '/assets/portrait-' + d.an + '.svg';
        var other = ANIMALS.filter(function (x) { return x !== d.an; })[0]; b.setAttribute('aria-label', d.an + '. Tap to change to ' + other + '.'); keep();
      };
    });
    if ($('#na')) ['a', 'b'].forEach(function (p) { $('#n' + p).oninput = function (e) { S[p].n = e.target.value; S.slug = ''; refresh(); keep(); }; });
    if ($('#sl')) $('#sl').oninput = function (e) { var v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); e.target.value = v; S.slug = v; check(); keep(); };
    if ($('#pw')) {
      var slip = function () { var e = $('#slip'); if (e) e.textContent = S.show ? S.pass : ''; };
      var dots = function () { document.querySelectorAll('.dots b').forEach(function (b, n) { b.className = Array.from(S.pass).length > n ? 'on' : ''; }); };
      $('#pw').oninput = function (e) { S.pass = e.target.value; dots(); slip(); refresh(); };
      $('#ey').onclick = function () { S.show = !S.show; $('#pw').type = S.show ? 'text' : 'password'; slip(); };
      $('#dc').onclick = function () {
        var u = new Uint32Array(5); crypto.getRandomValues(u);   // 128 words, so no modulo bias
        S.pass = Array.prototype.map.call(u, function (x) { return WORDS[x % 128]; }).join(' '); S.show = true;
        $('#pw').value = S.pass; $('#pw').type = 'text'; dots(); slip(); refresh();
      };
    }
    if ($('#bk')) $('#bk').onclick = function () { go(S.i - 1); };
    $('#go').onclick = next;
    document.querySelectorAll('#chips button').forEach(function (b) { b.onclick = function () { var n = +b.dataset.n; if (n < S.i) go(n); }; });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !S.sent && e.target.tagName !== 'BUTTON') { e.preventDefault(); next(); } });

  /* ---- send, then wait ---- */
  function send() {
    S.busy = true; refresh(); $('#go').textContent = '…';
    var tz; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = 'UTC'; }
    fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: [S.a.n.trim(), S.b.n.trim()], animals: [S.a.an, S.b.an], slug: S.slug, passphrase: S.pass, timezone: tz }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (res) {
        if (res.r.status === 201 || res.r.status === 200) { S.sent = true; keep(); return sent(); }
        S.busy = false;
        if (res.r.status === 409) { S.ok = false; go(1); setTimeout(function () { hint('That address was just taken.', 'bad'); }, 320); return; }
        $('#go').textContent = 'Send request'; refresh(); hint(res.j.error || 'Could not send. Try again.', 'bad');
      }).catch(function () { S.busy = false; $('#go').textContent = 'Send request'; refresh(); hint('Connection lost. Try again.', 'bad'); });
  }
  function sent() {
    clearTimeout(pollTimer); $('#chips').innerHTML = ''; var url = location.origin + '/' + S.slug;
    var c = $('#card'); c.className = 'card sage sent pre';
    c.innerHTML = '<img class="tp" src="' + TAPE + '" alt=""><div class="pair"><figure><img alt="" src="/assets/' + S.a.an + '-seat.svg"><figcaption>' + esc(S.a.n.trim()) + '</figcaption></figure><figure><img alt="" src="/assets/' + S.b.an + '-seat.svg"><figcaption>' + esc(S.b.n.trim()) + '</figcaption></figure></div>'
      + '<div class="addr"><span>' + esc(location.host + '/' + S.slug) + '</span><button class="ic" id="cp" aria-label="Copy link">' + I.cp + '</button></div>'
      + '<div class="wait" id="wt">' + I.hg + '<span>Waiting for approval.</span></div>'
      + '<div class="acts2">' + (S.pass ? '<button class="cta" id="inv">Copy invite</button>' : '') + '<button class="lnk" id="again">New request</button></div>';
    requestAnimationFrame(function () { requestAnimationFrame(function () { c.classList.remove('pre'); }); });
    function copy(text, btn, label) { try { navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ } var old = btn.innerHTML; btn.innerHTML = label || I.ok; setTimeout(function () { btn.innerHTML = old; }, 1600); }
    $('#cp').onclick = function () { copy(url, $('#cp')); };
    if ($('#inv')) $('#inv').onclick = function () { copy('Come to our wall: ' + url + '\nPassphrase: ' + S.pass, $('#inv'), 'Copied'); };
    $('#again').onclick = function () { clearTimeout(pollTimer); forget(); S = { i: 0, a: { n: '', an: 'cat' }, b: { n: '', an: 'deer' }, slug: '', ok: null, sug: [], pass: '', show: false, busy: false, sent: false }; draw(); };
    (function poll() {
      fetch('/api/room?slug=' + encodeURIComponent(S.slug)).then(function (r) { return r.json(); }).then(function (j) {
        if (j.status === 'live') { $('#wt').innerHTML = '<a class="cta" href="/' + S.slug + '">Open</a>'; return; }
        if (j.status === 'none') { $('#wt').innerHTML = '<span>Not approved.</span>'; return; }
        pollTimer = setTimeout(poll, 8000);
      }).catch(function () { pollTimer = setTimeout(poll, 12000); });
    })();
  }
  /* ---- the deer sits in the grass: measure the hill's edge under it and sink the feet just below ---- */
  var hillImg = null, ridgeW = 0, ridgeH = 0, ridge = null;
  function placeDeer() {
    var hills = document.querySelector('.hills'), deer = $('#pet'); if (!hills || !deer) return;
    var W = Math.round(hills.clientWidth), H = Math.round(hills.clientHeight); if (!W || !H) return;
    var dw = Math.min(170, Math.max(96, innerWidth * 0.15)), left = Math.max(10, innerWidth * 0.16 - dw / 2);
    deer.style.width = dw + 'px'; deer.style.left = left + 'px';
    function apply() {
      // sit on the crest of the first hill: the highest point of its edge, smoothed over the deer's width
      var win = Math.max(8, Math.round(dw * 0.5)), best = 0, bestVal = 1e9, lim = Math.min(W - 1, Math.round(W * 0.42));
      for (var c = win; c <= lim; c++) { var sum = 0; for (var k = c - win; k <= c + win && k < W; k++) sum += ridge[k]; if (sum < bestVal) { bestVal = sum; best = c; } }
      left = Math.min(Math.max(8, best - dw / 2), Math.max(8, W - dw - 8)); deer.style.left = left + 'px';
      var worst = 0, from = Math.floor(left + dw * 0.15), to = Math.min(W - 1, Math.ceil(left + dw * 0.85));
      for (var x = from; x <= to; x++) worst = Math.max(worst, ridge[x]);
      deer.style.bottom = (H - worst - dw * 0.0615 + 3) + 'px';   // the art has a little empty space under the feet
    }
    if (ridge && ridgeW === W && ridgeH === H) return apply();
    function scan() {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var cx = cv.getContext('2d');
      cx.drawImage(hillImg, 0, 0, W, H); var d = cx.getImageData(0, 0, W, H).data; ridge = new Array(W);
      for (var x = 0; x < W; x++) { ridge[x] = H; for (var y = 0; y < H; y++) if (d[(y * W + x) * 4 + 3] > 20) { ridge[x] = y; break; } }
      ridgeW = W; ridgeH = H; apply();
    }
    if (hillImg) return scan();
    hillImg = new Image(); hillImg.onload = scan; hillImg.src = '/assets/meadow-hills.svg';
  }
  var resizeTimer = 0; addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(placeDeer, 120); });
  if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(placeDeer, 60); }).observe(document.querySelector('.hills'));
  placeDeer();

  /* ---- music: starts when "I have read this" is clicked; the round button turns it off and on ---- */
  var SND = 'duet-maker-sound', audio = null, playing = false, fadeTimer = 0;
  var SPK = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/>', ON = SPK + '<path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg>', OFF = SPK + '<path d="M17 9l5 6M22 9l-5 6"/></svg>';
  function paintSound() { var b = $('#snd'); b.innerHTML = playing ? ON : OFF; b.setAttribute('aria-pressed', playing); b.setAttribute('aria-label', playing ? 'Music on' : 'Music off'); b.title = b.getAttribute('aria-label'); }
  function fade(to, done) {
    clearInterval(fadeTimer); var steps = 24;
    fadeTimer = setInterval(function () {
      var v = audio.volume, d = (to - v) / 4; audio.volume = Math.max(0, Math.min(1, Math.abs(to - v) < 0.01 ? to : v + d));
      if (--steps <= 0 || audio.volume === to) { clearInterval(fadeTimer); audio.volume = to; if (done) done(); }
    }, 90);
  }
  function musicOn() {
    var t = document.body.dataset.time, src = t === 'night' || t === 'evening' ? '/assets/calm.mp3' : '/assets/coffee.mp3';
    if (!audio) { audio = new Audio(src); audio.loop = true; audio.volume = 0; }
    var p = audio.play();
    (p && p.then ? p : Promise.resolve()).then(function () { playing = true; paintSound(); fade(0.35); }).catch(function () { playing = false; paintSound(); });
  }
  function musicOff() { playing = false; paintSound(); if (audio) fade(0, function () { audio.pause(); }); }
  $('#snd').onclick = function () { try { localStorage.setItem(SND, playing ? 'off' : 'on'); } catch (e) { /* ignore */ } playing ? musicOff() : musicOn(); };
  document.addEventListener('visibilitychange', function () { if (!audio) return; if (document.hidden) audio.pause(); else if (playing) audio.play().catch(function () {}); });
  paintSound();

  /* ---- the what-it-is page comes first; the cards open after "I have read this" ---- */
  var READ = 'duet-read';
  function proceed() {
    document.documentElement.dataset.read = 'yes'; window.scrollTo(0, 0);
    S.sent ? sent() : draw(); placeDeer();
  }
  var seen = false; try { seen = localStorage.getItem(READ) === '1'; } catch (e) { /* treat as first visit */ }
  if (seen || S.sent) proceed();
  else {
    document.documentElement.dataset.read = 'no';
    $('#read').onclick = function () {
      try { localStorage.setItem(READ, '1'); } catch (e) { /* ignore */ }
      var quiet = false; try { quiet = localStorage.getItem(SND) === 'off'; } catch (e) { /* ignore */ }
      if (!quiet) musicOn();
      proceed();
    };
  }
})();
