/* Review site: sign in, then look at the requests in the order they came, and approve, decline, open or delete duets. */
(function () {
  var view = document.getElementById('view'), subEl = document.getElementById('sub'), timer = 0, tab = 'wait', busy = false;
  var ROOT = location.origin.replace('//dev.', '//');
  var I = {
    ok: '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6"/></svg>', no: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>', go: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
    mv: '<svg viewBox="0 0 24 24"><path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/></svg>'
  };
  var STAMP = {
    ok: '<svg class="stampover ok" viewBox="0 0 240 90" aria-hidden="true"><path d="M12 16q3-8 14-8h188q12 0 14 11 2 24 0 52-2 11-14 11H26q-12 0-14-11-2-26-2-55z"/><text x="120" y="62" text-anchor="middle" textLength="160" lengthAdjust="spacingAndGlyphs">Approved</text></svg>',
    no: '<svg class="stampover no" viewBox="0 0 240 90" aria-hidden="true"><path d="M10 18q3-9 15-9h190q12 0 13 10 2 24 1 51-2 12-14 12H26q-12 0-14-12-3-24-2-52z"/><text x="120" y="62" text-anchor="middle" textLength="190" lengthAdjust="spacingAndGlyphs">Not approved</text></svg>'
  };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function api(path, body) {
    return fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); });
  }
  function ago(t) { var s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? 'now' : s < 5400 ? Math.round(s / 60) + ' min' : s < 129600 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* tape: the same rules as the dash (yellow one strip; red a strip or one long corner piece; green and blue a pair, a strip or two slanted pieces) */
  var ROLLS = ['red', 'yellow', 'blue', 'green'], RULES = { yellow: ['h'], red: ['h', 'dtr', 'dtl'], green: ['v', 'h', 'c2', 'c2b'], blue: ['v', 'h', 'c2', 'c2b'] }, PIECES = { h: 1, v: 2, c2: 2, c2b: 2, dtr: 1, dtl: 1 };
  function hash(str) { return Array.from(str).reduce(function (v, ch) { return Math.imul(v ^ ch.charCodeAt(0), 16777619) >>> 0; }, 2166136261); }
  function taped(el, key) {
    var h = hash(key), roll = ROLLS[h % 4], opts = RULES[roll], lay = opts[(h >>> 3) % opts.length]; el.dataset.tape = lay;
    for (var i = 0; i < PIECES[lay]; i++) { var t = document.createElement('img'); t.src = '/assets/tape-' + roll + '.webp'; t.alt = ''; t.className = 'tp ' + roll; el.appendChild(t); }
  }
  function tapeAll() { /* the review site has no tape: plain, calm cards */ }

  function login(msg) {
    clearTimeout(timer); subEl.textContent = ''; document.title = 'Review · Project Duet';
    view.innerHTML = '<div class="card cream login" data-k="login"><h1 class="lb">PASSPHRASE</h1><div class="row"><input class="f" id="pw" type="password" aria-label="Owner passphrase" autocomplete="current-password"><button class="go" id="go" aria-label="Sign in">' + I.go + '</button></div><p class="hint bad" role="status">' + esc(msg || '') + '</p></div>';
    tapeAll(); var pw = document.getElementById('pw'); pw.focus();
    function submit() {
      api('login', { passphrase: pw.value }).then(function (r) {
        if (r.s === 200) return load();
        login(r.s === 503 ? 'Review is not set up.' : r.s === 429 ? 'Too many tries.' : 'Not quite.');
      }).catch(function () { login('Connection lost.'); });
    }
    document.getElementById('go').onclick = submit; pw.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  }

  function portraits(r) { return '<div class="pair2"><img alt="" src="/assets/portrait-' + esc(r.animal_a) + '.webp"><img alt="" src="/assets/portrait-' + esc(r.animal_b) + '.webp"></div>'; }
  function card(r, n) {
    var pending = r.status === 'pending', live = r.status === 'live';
    var paper = pending ? 'rose' : live ? 'sage' : 'cream';
    var acts = pending
      ? '<button class="ic ok" data-a="live" aria-label="Approve ' + esc(r.slug) + '" title="Approve">' + I.ok + '</button><button class="ic no" data-a="declined" aria-label="Decline ' + esc(r.slug) + '" title="Decline">' + I.no + '</button>'
      : (live ? '<a class="ic" href="' + ROOT + '/' + esc(r.slug) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(r.slug) + '" title="Open">' + I.open + '</a>' : '<button class="ic ok" data-a="live" aria-label="Approve ' + esc(r.slug) + '" title="Approve">' + I.ok + '</button>')
        + '<button class="ic no" data-a="delete" aria-label="Delete ' + esc(r.slug) + '" title="Delete">' + I.del + '</button>';
    return '<article class="req paper ' + paper + '" data-slug="' + esc(r.slug) + '" data-k="' + esc(r.slug) + '">' + (pending ? '<span class="num" title="' + n + '">' + n + '</span>' : '')
      + '<div class="top">' + portraits(r) + '<div><div class="who">' + esc(r.name_a) + ' &amp; ' + esc(r.name_b) + '</div><div class="meta">/' + esc(r.slug) + ' · ' + ago(r.created) + (live ? ' · ' + (r.notes || 0) + ' notes' : '') + '</div></div><div class="acts">' + acts + '</div></div>'
      + (r.note ? '<div class="note"><b>Their note</b>' + esc(r.note) + '</div>' : '') + '</article>';
  }
  function homeCard(home) {
    return '<article class="req paper cream" data-home="1" data-k="home"><div class="top">' + portraits(home) + '<div><div class="who">' + esc(home.name_a) + ' &amp; ' + esc(home.name_b) + ' <span class="tag">your wall</span></div><div class="meta"><a href="' + ROOT + '/' + (home.slug === 'home' ? '' : esc(home.slug)) + '" target="_blank" rel="noopener">' + (home.slug === 'home' ? '/' : '/' + esc(home.slug)) + '</a></div></div>'
      + '<div class="acts"><button class="ic" id="mv" aria-label="Move your wall" title="Move your wall">' + I.mv + '</button></div></div></article>';
  }

  var data = null;
  function render() {
    var all = data.rooms.filter(function (x) { return x.id !== 1; }), home = data.rooms.filter(function (x) { return x.id === 1; })[0];
    var by = { wait: all.filter(function (x) { return x.status === 'pending'; }).sort(function (a, b) { return a.created - b.created; }),
      live: all.filter(function (x) { return x.status === 'live'; }), declined: all.filter(function (x) { return x.status === 'declined'; }) };
    subEl.textContent = by.live.length + ' live · ' + by.wait.length + ' waiting';
    document.title = (by.wait.length ? '(' + by.wait.length + ') ' : '') + 'Review · Project Duet';
    if (!by[tab].length && tab !== 'wait') { /* stay on the chosen tab */ }
    var tabs = [['wait', 'waiting'], ['live', 'live'], ['declined', 'declined']].map(function (t) { return '<button class="tab" data-t="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + '<b>' + by[t[0]].length + '</b></button>'; }).join('');
    var list = by[tab].map(function (r, i) { return card(r, i + 1); }).join('');
    view.innerHTML = '<div class="tabs" role="group" aria-label="Show">' + tabs + '</div><div class="grid">' + (tab === 'live' && home ? homeCard(home) : '') + (list || (tab === 'live' && home ? '' : '<p class="empty">Nothing yet.</p>')) + '</div>'
      + '<p><button class="bk so" id="out" aria-label="Sign out">Sign out</button></p>';
    tapeAll(); wire(home);
  }
  function ask(el, html) {
    var old = el.querySelector('.ask'); if (old) { old.remove(); return null; }
    var box = document.createElement('div'); box.className = 'ask'; box.innerHTML = html; el.appendChild(box); return box;
  }
  function wire(home) {
    Array.prototype.forEach.call(view.querySelectorAll('.tab'), function (b) { b.onclick = function () { tab = b.dataset.t; render(); }; });
    document.getElementById('out').onclick = function () { api('logout', {}).then(function () { login(); }); };
    var mv = document.getElementById('mv');
    if (mv) mv.onclick = function () {
      var el = mv.closest('.req'), box = ask(el, '<p>New address for your wall (letters, numbers, hyphens). Type home to put it back on the main page.</p><div class="row"><input class="f" id="to" aria-label="New address" maxlength="24" autocomplete="off" spellcheck="false" value="' + (home.slug === 'home' ? '' : esc(home.slug)) + '"><button class="cta" id="mvgo">' + I.ok + '</button></div><p class="err2" id="mverr"></p>');
      if (!box) return; var to = box.querySelector('#to'); to.focus();
      var step = 0; to.onkeydown = function (e) { if (e.key === 'Enter') box.querySelector('#mvgo').click(); };
      box.querySelector('#mvgo').onclick = function () {
        var v = to.value.trim().toLowerCase(); if (!v) return;
        if (step === 0) { step = 1; box.querySelector('p').textContent = v === 'home' ? 'Put your wall back on the main page?' : 'Move your wall to /' + v + '? The main page becomes the welcome page, and anyone logged in is sent to the new address.'; to.readOnly = true; return; }
        api('move-home', { slug: v }).then(function (x) { if (x.s !== 200) { step = 0; to.readOnly = false; box.querySelector('#mverr').textContent = x.j.error || 'Could not move it.'; return; } load(); });
      };
    };
    Array.prototype.forEach.call(view.querySelectorAll('[data-a]'), function (b) {
      b.onclick = function () {
        var el = b.closest('[data-slug]'), slug = el.dataset.slug, a = b.dataset.a;
        if (a === 'delete') {
          var box = ask(el, '<p>Type "' + esc(slug) + '" to delete this duet and all its notes.</p><div class="row"><input class="f" id="cf" aria-label="Confirm address" autocomplete="off" spellcheck="false"><button class="cta" id="dl">' + I.del + '</button></div><p class="err2"></p>');
          if (!box) return; box.querySelector('#cf').focus(); box.querySelector('#cf').onkeydown = function (e) { if (e.key === 'Enter') box.querySelector('#dl').click(); };
          box.querySelector('#dl').onclick = function () {
            if (box.querySelector('#cf').value.trim() !== slug) { box.querySelector('.err2').textContent = 'Type the address to confirm.'; return; }
            api('delete', { slug: slug, confirm: slug }).then(function (x) { if (x.s !== 200) { box.querySelector('.err2').textContent = x.j.error || 'Could not delete it.'; return; } el.classList.add('gone'); return wait(450).then(load); }, function () { box.querySelector('.err2').textContent = 'Connection lost.'; });
          };
          return;
        }
        if (busy) return; busy = true;
        // a stamp lands on the note, then the list refreshes
        el.insertAdjacentHTML('beforeend', STAMP[a === 'live' ? 'ok' : 'no']);
        api('decide', { slug: slug, status: a }).then(function (x) { if (x.s !== 200) throw 0; return wait(900); }).then(function () { el.classList.add('gone'); return wait(400); }).then(function () { busy = false; load(); }, function () { busy = false; var st = el.querySelector('.stampover'); if (st) st.remove(); load(); });
      };
    });
  }
  function load() {
    api('rooms').then(function (r) {
      if (r.s === 401) return login();
      if (r.s !== 200) return login('Review is not set up.');
      data = r.j; if (view.querySelector('.ask')) { schedule(); return; }
      render(); schedule();
    }).catch(function () { clearTimeout(timer); timer = setTimeout(load, 8000); });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { if (!document.hidden && !busy) load(); else schedule(); }, 15000); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && data) load(); });
  load();
})();
