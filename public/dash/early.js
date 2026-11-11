/* Decides, before the first paint, whether the what-it-is page is shown (first visit) or skipped. */
try {
  var seen = localStorage.getItem('duet-read') === '1', m = JSON.parse(localStorage.getItem('duet-maker') || 'null');
  document.documentElement.dataset.read = seen || (m && m.sent) ? 'yes' : 'no';
} catch (e) { document.documentElement.dataset.read = 'no'; }
