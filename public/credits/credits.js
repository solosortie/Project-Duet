/* Shows the source link once a repository address is set in <meta name="repo-url">. */
(function () {
  var m = document.querySelector('meta[name="repo-url"]'), url = m && m.content.trim();
  if (!/^https:\/\/[^ ]+$/.test(url || '')) return;
  document.getElementById('repo').href = url; document.getElementById('repo-line').hidden = false;
})();
