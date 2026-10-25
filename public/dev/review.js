/* Owner review: sign in, then approve, decline, open or delete duets. */
(function () {
  var view = document.getElementById('view'), timer = 0;
  var I = { ok: '<svg viewBox="0 0 24 24"><path d="M4 13l5 5L20 6"/></svg>', no: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>', del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>', go: '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg>' };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function api(path, body) {
    return fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); });
  }
  function ago(t) { var s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? 'now' : s < 5400 ? Math.round(s / 60) + ' min' : s < 129600 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; }

  function login(msg) {
    clearTimeout(timer);
    view.innerHTML = '<div class="card cream" style="transform:rotate(-.6deg)"><img class="tp" src="/assets/tape.svg" alt=""><h1 class="lb">PASSPHRASE</h1><div class="row"><input class="f" id="pw" type="password" aria-label="Owner passphrase" autocomplete="current-password"><button class="go" id="go" aria-label="Sign in">' + I.go + '</button></div><p class="err" role="alert">' + esc(msg || '') + '</p></div>';
    var pw = document.getElementById('pw'); pw.focus();
    function submit() {
      api('login', { passphrase: pw.value }).then(function (r) {
        if (r.s === 200) return load();
        login(r.s === 503 ? 'Review is not set up.' : r.s === 429 ? 'Too many tries.' : 'Not quite.');
      }).catch(function () { login('Connection lost.'); });
    }
    document.getElementById('go').onclick = submit; pw.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
  }
  function row(r) {
    var tag = r.status === 'pending' ? '<span class="tag">new</span>' : r.status === 'declined' ? '<span class="tag">declined</span>' : '';
    var acts = r.status === 'pending'
      ? '<button class="ic ok" data-a="live" aria-label="Approve ' + esc(r.slug) + '" title="Approve">' + I.ok + '</button><button class="ic no" data-a="declined" aria-label="Decline ' + esc(r.slug) + '" title="Decline">' + I.no + '</button>'
      : (r.status === 'live' ? '<a class="ic" href="/' + esc(r.slug) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(r.slug) + '" title="Open">' + I.open + '</a>' : '<button class="ic ok" data-a="live" aria-label="Approve ' + esc(r.slug) + '" title="Approve">' + I.ok + '</button>') + '<button class="ic no" data-a="delete" aria-label="Delete ' + esc(r.slug) + '" title="Delete">' + I.del + '</button>';
    var paper = r.status === 'pending' ? 'rose' : r.status === 'live' ? 'sage' : 'cream';
    return '<article class="note ' + paper + '" data-slug="' + esc(r.slug) + '"><img class="tp" src="/assets/tape.svg" alt=""><img class="p" alt="" src="/assets/portrait-' + esc(r.animal_a) + '.svg"><div><div class="who">' + esc(r.name_a) + ' &amp; ' + esc(r.name_b) + ' ' + tag + '</div><div class="meta">/' + esc(r.slug) + ' · ' + esc(r.dynamic) + ' · ' + ago(r.created) + (r.status === 'live' ? ' · ' + r.notes + (r.notes === 1 ? ' note' : ' notes') : '') + '</div></div><div class="acts">' + acts + '</div></article>';
  }
  function load() {
    api('rooms').then(function (r) {
      if (r.s === 401) return login();
      if (r.s !== 200) return login('Review is not set up.');
      var rooms = r.j.rooms.filter(function (x) { return x.id !== 1; });
      var live = rooms.filter(function (x) { return x.status === 'live'; }).length, wait = rooms.filter(function (x) { return x.status === 'pending'; }).length;
      var home = r.j.rooms.filter(function (x) { return x.id === 1; })[0];
      var homeRow = home ? '<article class="note cream" data-home="1"><img class="tp" src="/assets/tape.svg" alt=""><img class="p" alt="" src="/assets/portrait-' + esc(home.animal_a) + '.svg"><div><div class="who">' + esc(home.name_a) + ' &amp; ' + esc(home.name_b) + ' <span class="tag">your wall</span></div><div class="meta">' + (home.slug === 'home' ? 'on the main page' : '/' + esc(home.slug) + ' · main page is the welcome page') + ' · ' + home.notes + ' notes</div></div><div class="acts"><button class="ic" id="mv" aria-label="Change your wall\'s address" title="Change address">' + I.go + '</button></div></article>' : '';
      view.innerHTML = '<p class="sub">' + live + ' live · ' + wait + ' waiting</p><div class="list">' + homeRow + (rooms.length ? rooms.map(row).join('') : '<p class="empty">Nothing yet.</p>') + '</div><p style="margin-top:26px"><button class="bk so" id="out" aria-label="Sign out">Sign out</button></p>';
      var mv = document.getElementById('mv');
      if (mv) mv.onclick = function () {
        var to = prompt('New address for your wall (letters, numbers, hyphens). Type home to put it back on the main page.', home.slug === 'home' ? '' : home.slug);
        if (!to) return; to = to.trim().toLowerCase();
        if (!confirm(to === 'home' ? 'Put your wall back on the main page?' : 'Move your wall to /' + to + '? The main page becomes the welcome page, and anyone logged in is sent to the new address.')) return;
        api('move-home', { slug: to }).then(function (x) { if (x.s !== 200) alert(x.j.error || 'Could not move it.'); load(); });
      };
      document.getElementById('out').onclick = function () { api('logout', {}).then(function () { login(); }); };
      view.querySelectorAll('[data-a]').forEach(function (b) {
        b.onclick = function () {
          var slug = b.closest('[data-slug]').dataset.slug, a = b.dataset.a;
          if (a === 'delete') { if (prompt('Type "' + slug + '" to delete this duet and all its notes.') !== slug) return; api('delete', { slug: slug, confirm: slug }).then(load); return; }
          api('decide', { slug: slug, status: a }).then(load);
        };
      });
      clearTimeout(timer); timer = setTimeout(load, 20000);
    }).catch(function () { timer = setTimeout(load, 8000); });
  }
  load();
})();
