/* Shared by the /dev pages: time-of-day sky, same rules as the walls screen. */
(function () {
  function time() { var h = new Date().getHours(); document.body.dataset.time = h >= 5 && h < 9 ? 'morning' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'evening' : 'night'; }
  time(); setInterval(time, 60000);
})();
