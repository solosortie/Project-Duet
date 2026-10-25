/* Loads the app. At "/" it is the original room; at "/<address>" it first fetches that room's
   names and animals (or shows the waiting / nobody-here page) and personalises the page. */
(function () {
  var path = location.pathname;
  if (path.length > 1 && /\/$/.test(path) && /^\/[a-z0-9-]{3,24}\/$/.test(path)) { location.replace(path.slice(0, -1) + location.search); return; }
  var m = path.match(/^\/([a-z0-9](?:[a-z0-9-]{1,22})[a-z0-9])$/);
  var slug = m && m[1];
  var SCRIPTS = ['/drawing-store.js', '/app.js', '/ambience.js', '/export.js'];
  function start() {
    SCRIPTS.forEach(function (src) { var s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s); });
    document.documentElement.classList.remove('room-wait');
  }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  if (!slug) { ready(start); return; }

  document.documentElement.classList.add('room-wait');
  function hold() {
    fetch('/dev/hold/').then(function (r) { return r.text(); }).then(function (html) {
      document.open(); document.write(html); document.close();
    }).catch(function () { document.documentElement.classList.remove('room-wait'); });
  }
  function swapName(text, names) { return text.replace(/Aryan Chan/g, names.aryan).replace(/ChatChan/g, names.chat); }
  function personalise(cfg) {
    var names = cfg.names, animals = cfg.animals;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) if (/Aryan Chan|ChatChan/.test(node.nodeValue)) node.nodeValue = swapName(node.nodeValue, names);
    document.querySelectorAll('[aria-label],[title],[alt]').forEach(function (el) {
      ['aria-label', 'title', 'alt'].forEach(function (a) { var v = el.getAttribute(a); if (v && /Aryan Chan|ChatChan/.test(v)) el.setAttribute(a, swapName(v, names)); });
    });
    document.querySelectorAll('img[src^="assets/"]').forEach(function (img) {
      var mm = img.getAttribute('src').match(/^assets\/(portrait-|favicon-)?(cat|deer)((?:-[a-z]+)*)\.svg$/);
      if (!mm) return;
      var animal = animals[mm[2] === 'cat' ? 'aryan' : 'chat'];
      img.setAttribute('src', 'assets/' + (mm[1] || '') + animal + mm[3] + '.svg');
      var alt = img.getAttribute('alt'); if (alt) img.setAttribute('alt', alt.replace(/\b(deer|cat)\b/i, animal));
    });
    document.title = names.aryan + ' & ' + names.chat + ' · Project Duet';
  }
  fetch('/api/room?slug=' + slug).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
    if (!res.ok || res.j.status !== 'live') { ready(hold); return; }
    window.DUET_ROOM = { slug: slug, names: res.j.names, animals: res.j.animals, timezone: res.j.timezone, dynamic: res.j.dynamic, legacy: !!res.j.legacy };
    ready(function () { personalise(window.DUET_ROOM); start(); });
  }).catch(function () { ready(hold); });
})();
