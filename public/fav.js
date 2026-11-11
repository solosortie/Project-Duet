/* The tab icon: the cat or the deer, taking turns on each visit. */
try { var n = (Number(localStorage.getItem('duet-fav')) || 0) + 1; localStorage.setItem('duet-fav', n); var a = n % 2 ? 'cat' : 'deer', l = document.querySelector('link[rel="icon"]'); if (l) { l.type = 'image/png'; l.href = '/assets/favicon-' + a + '.png'; } } catch (e) { /* keep the default */ }
