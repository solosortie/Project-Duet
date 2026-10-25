/* Shown at /<address> while a room is waiting for approval, or when nobody has that address. */
(function () {
  var slug = location.pathname.replace(/^\/|\/$/g, ''), box = document.getElementById('hold');
  var HG = '<svg viewBox="0 0 24 24"><path d="M6 3h12M6 21h12M7 3c0 6 10 6 10 18M17 3c0 12-10 12-10 18"/></svg>';
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function render(status) {
    document.title = status === 'pending' ? 'Waiting · Project Duet' : 'Nobody here · Project Duet';
    box.innerHTML = '<div class="pair"><figure><img alt="" src="/assets/deer-seat.svg"></figure><figure><img alt="" src="/assets/cat-seat.svg"></figure></div>'
      + (status === 'pending'
        ? '<div class="wait">' + HG + '<span>Waiting for approval.</span></div><p class="sub">/' + esc(slug) + '</p>'
        : '<div class="wait"><span>Nobody here yet.</span></div><p style="margin-top:18px"><a class="cta" href="/dev/">Make one</a></p>');
  }
  function poll() {
    fetch('/api/room?slug=' + encodeURIComponent(slug)).then(function (r) { return r.json(); }).then(function (j) {
      if (j.status === 'live') { location.reload(); return; }
      render(j.status === 'pending' ? 'pending' : 'none');
      if (j.status === 'pending') setTimeout(poll, 10000);
    }).catch(function () { render('pending'); setTimeout(poll, 15000); });
  }
  poll();
})();
