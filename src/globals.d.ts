// CONFUstudio — ambient global declarations (Phase 0.3 boundary support).
// Declares the consolidated `__CONFUSTUDIO__` namespace that lives on window
// (Phase 0.4 target). This is a declarations-only file — no runtime TypeScript.

export {};

declare global {
  interface Window {
    /** Consolidated CONFUstudio runtime namespace (globals live here, not `window._*`). */
    __CONFUSTUDIO__?: Record<string, any>;
  }
}
