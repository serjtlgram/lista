export function triggerFullscreen() {
  const twa = (window as any).Telegram?.WebApp;
  if (!twa) return;
  try {
    if (typeof twa.ready === 'function') {
      twa.ready();
    }
    const isDesktop =
      ['tdesktop', 'macos', 'web', 'weba'].includes(twa.platform || '') ||
      window.innerWidth >= 1024;

    if (isDesktop) {
      // On desktop / PC: expand window without hiding the Windows/Mac taskbar
      if (typeof twa.expand === 'function') {
        twa.expand();
      }
      if (typeof twa.exitFullscreen === 'function' && twa.isFullscreen) {
        twa.exitFullscreen();
      }
    } else {
      // On mobile devices: enter fullscreen if supported
      if (typeof twa.expand === 'function') {
        twa.expand();
      }
      if (typeof twa.requestFullscreen === 'function' && !twa.isFullscreen) {
        twa.requestFullscreen();
      }
    }

    if (typeof twa.disableVerticalSwipes === 'function') {
      twa.disableVerticalSwipes();
    }
  } catch (e) {
    console.warn('triggerFullscreen error:', e);
  }
}
