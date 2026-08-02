import { defineConfig } from 'vite';

// AudioWorklet plus any future SharedArrayBuffer use needs cross-origin
// isolation, and server.mjs already sends these on every response. The dev
// server has to match or the built app and the source app behave differently.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  // index.html sits at the repo root and pulls in /src/*.js directly.
  root: '.',
  // public/ is copied to the build root, so manifest.webmanifest, icon.svg and
  // sw.js keep the same URLs they have under server.mjs.
  publicDir: 'public',
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Worklets are emitted as standalone assets via new URL(..., import.meta.url).
    // Keep the sourcemap so a hashed worklet failure is still debuggable.
    sourcemap: true,
    target: 'es2023',
    // Assets under the inline limit (4 KB by default) become data: URLs. Our
    // CSP is `script-src 'self'`, which blocks data: scripts, so an inlined
    // worklet fails audioWorklet.addModule() at runtime — and a dead worklet
    // only shows up as missing sound, never as a build or test failure. The
    // small worklets (resampler, bitcrusher) sit right under the limit, so
    // force them to stay real files.
    assetsInlineLimit(filePath) {
      if (filePath.includes('/worklets/')) return false;
      return undefined;
    },
  },
});
