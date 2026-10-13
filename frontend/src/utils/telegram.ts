export function isDesktopDevice(): boolean {
  const twa = (window as any).Telegram?.WebApp;
  const platform = (twa?.platform || '').toLowerCase();
  if (['tdesktop', 'macos', 'web', 'weba'].includes(platform)) return true;
  if (['ios', 'android'].includes(platform)) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return false;
  return (typeof window !== 'undefined' && window.innerWidth >= 1024) || /Windows|Macintosh|Linux/i.test(ua);
}

export function triggerFullscreen() {
  const twa = (window as any).Telegram?.WebApp;
  if (!twa) return;
  try {
    if (typeof twa.ready === 'function') {
      twa.ready();
    }
    if (typeof twa.expand === 'function') {
      twa.expand();
    }
    if (typeof twa.disableVerticalSwipes === 'function') {
      twa.disableVerticalSwipes();
    }
    if (typeof twa.requestFullscreen === 'function' && !twa.isFullscreen) {
      twa.requestFullscreen();
    }
  } catch (e) {
    console.warn('triggerFullscreen error:', e);
  }
}
