// Runs before styles/app paint. Only this small UI preference is stored.
(() => {
  let theme = 'light';
  try {
    const raw = localStorage.getItem('image-arena-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.values && typeof parsed.values === 'object') {
        theme = parsed.values.theme === 'dark' ? 'dark' : 'light';
      }
    } else {
      theme = localStorage.getItem('image-arena-theme') === 'dark' ? 'dark' : 'light';
    }
  } catch { /* First paint uses day mode when settings are missing or unreadable. */ }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#252323' : '#f6f2e9');
})();
