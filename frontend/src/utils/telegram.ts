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
    if (typeof twa.requestFullscreen === 'function' && !twa.isFullscreen) {
      twa.requestFullscreen();
    }
    if (typeof twa.disableVerticalSwipes === 'function') {
      twa.disableVerticalSwipes();
    }
  } catch (e) {
    console.warn('triggerFullscreen error:', e);
  }
}
