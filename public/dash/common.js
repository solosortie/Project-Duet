/* Shared by the dash, the waiting page and the review site: the same sky as the walls (same hours, same colours, Kolkata time),
   and text colour that flips from dark to light as the sky darkens. */
(function () {
  var stops = [[0, '#293548', '#394348'], [5, '#41495a', '#777367'], [7, '#f1d8ba', '#e6ddbd'], [10, '#c8deea', '#e6ecda'], [16, '#cededc', '#e8dfc4'], [18, '#c99279', '#b0a08a'], [20, '#293548', '#394348'], [24, '#293548', '#394348']];
  function hex(c, i) { return parseInt(c.slice(i, i + 2), 16); }
  function mix(a, b, t) { return '#' + [1, 3, 5].map(function (i) { return Math.round(hex(a, i) * (1 - t) + hex(b, i) * t).toString(16).padStart(2, '0'); }).join(''); }
  function lum(c) { return 0.2126 * hex(c, 1) / 255 + 0.7152 * hex(c, 3) / 255 + 0.0722 * hex(c, 5) / 255; }
  function time() {
    var d = new Date(Date.now() + 19800000), h = d.getUTCHours() + d.getUTCMinutes() / 60, b = document.body;
    b.dataset.time = h >= 5 && h < 9 ? 'morning' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night';
    var i = 0; while (i < stops.length - 2 && h >= stops[i + 1][0]) i++;
    var a = stops[i], n = stops[i + 1], t = (h - a[0]) / (n[0] - a[0]), s1 = mix(a[1], n[1], t), s2 = mix(a[2], n[2], t);
    b.style.setProperty('--sky1', s1); b.style.setProperty('--sky2', s2);
    var L = (lum(s1) + lum(s2)) / 2, u = L <= 0.58 ? 1 : L >= 0.62 ? 0 : (0.62 - L) / 0.04;
    u = u * u * (3 - 2 * u); if (u > 0.5) u = Math.max(u, 0.85); else if (u > 0) u = Math.min(u, 0.15);
    b.style.setProperty('--ink', mix('#594739', '#f3e6d0', u)); b.style.setProperty('--muted', mix('#85745f', '#cfc3b0', u));
  }
  time(); setInterval(time, 60000);
})();
