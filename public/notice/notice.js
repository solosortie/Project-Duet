/* The page shown instead of a bare error: an address that leads nowhere, a lost connection, or a hiccup on the server.
   Which one comes from window.DUET_NOTICE (set by the page that failed) or the page's own data-notice. */
(function () {
  var kind = window.DUET_NOTICE || document.documentElement.getAttribute('data-notice') || 'missing';
  var COPY = {
    missing: { title: "Page not found", text: "This address doesn't lead anywhere. Check the link, or start a wall of your own.", cta: 'Back to Project Duet' },
    offline: { title: "No connection", text: "It looks like you're offline. Check your connection and try again.", cta: 'Try again', again: true },
    server: { title: 'Something went wrong', text: "That's on my side, not yours. Give it a minute and try again.", cta: 'Try again', again: true }
  };
  var c = COPY[kind] || COPY.missing, box = document.getElementById('hold');
  var local = /^(\d+\.){3}\d+$|^localhost/.test(location.hostname), home = local || /^dash\./.test(location.hostname) ? '/' : location.protocol + '//dash.' + location.host + '/';
  box.innerHTML = '<div class="lost" role="status"><img class="lost-pic" src="/assets/portrait-deer.webp" alt=""><h2 class="lb">' + c.title + '</h2><p>' + c.text + '</p><p><a class="cta" href="' + (c.again ? '#' : home) + '">' + c.cta + '</a></p></div>';
  if (c.again) box.querySelector('.cta').onclick = function (e) { e.preventDefault(); location.reload(); };
  document.title = c.title + ' · Project Duet';
})();
