import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'desktop' ? [{
    name: 'desktop-csp',
    // Tauri injects the packaged WebView CSP; Web retains its original strict meta policy.
    transformIndexHtml: { order: 'pre', handler: (html: string) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '') },
  }] : [],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    // Evidence and generated fixtures are not app source; copying them can briefly lock files on Windows.
    watch: { ignored: ['**/validation/**', '**/test-results/**', '**/src-tauri/**', '**/desktop-dist/**'] },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
}));
