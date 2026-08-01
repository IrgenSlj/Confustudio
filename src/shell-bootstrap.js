const isLoopbackHost = ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
const DEV_SHELL_VERSION = 'confustudio-shell-v7';

async function resetLocalDevShellState() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('[CONFUstudio] Local shell reset failed:', error);
  }
}

window.addEventListener('load', () => {
  if (isLoopbackHost) {
    const previous =
      localStorage.getItem('confustudio-dev-shell-version') ?? localStorage.getItem('confusynth-dev-shell-version');
    if (previous !== DEV_SHELL_VERSION) {
      localStorage.setItem('confustudio-dev-shell-version', DEV_SHELL_VERSION);
      localStorage.removeItem('confusynth-dev-shell-version');
      resetLocalDevShellState().then(() => {
        window.location.reload();
      });
    }
    return;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[CONFUstudio] Service worker registration failed:', error);
    });
  }
});
