/* Shown at /<address> while a wall is waiting for approval, or when nobody has that address. */
(function () {
  var slug = location.pathname.replace(/^\/|\/$/g, ''), box = document.getElementById('hold');
  var local = /^(\d+\.){3}\d+$|^localhost/.test(location.hostname);
  var dash = local ? '/' : location.protocol + '//dash.' + location.host + '/';
  DashStatus.mount(box, {
    slug: slug, pair: null, declinedAsNone: true, rootUrl: location.origin,
    onState: function (state) {
      if (state === 'live') { location.reload(); return; }
      var old = document.getElementById('make'); if (old) old.remove();
      if (state === 'none') { var p = document.createElement('p'); p.id = 'make'; p.style.marginTop = '18px'; p.innerHTML = '<a class="cta" href="' + dash + '">Make one</a>'; box.appendChild(p); }
    }
  });
})();
