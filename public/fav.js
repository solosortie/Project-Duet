/* The tab icon: the deer, unless a page picks the chosen animal. */
try { var l = document.querySelector('link[rel="icon"]'); if (l) { l.type = 'image/png'; l.href = '/assets/favicon-deer.png'; } } catch (e) { /* keep the default */ }
