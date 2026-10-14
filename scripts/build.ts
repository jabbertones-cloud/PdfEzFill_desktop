#!/usr/bin/env npx tsx
/**
 * Server build for desktop packaging.
 *
 * Bundles server/index-desktop.ts → dist/index-desktop.cjs
 * using esbuild. The output is a single CommonJS file that
 * Electron can spawn with plain Node.js in production mode.
 */
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

async function main() {
  console.log('[build:server] Bundling server/index-desktop.ts → dist/index-desktop.cjs');

  await build({
    entryPoints: [path.join(ROOT, 'server', 'index-desktop.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: path.join(ROOT, 'dist', 'index-desktop.cjs'),
    external: [
      // Native modules that can't be bundled — shipped as-is
      'better-sqlite3',
      'canvas',
      '@gutenye/ocr-node',
      'electron',
      // Vite is only needed in dev mode (setupVite is behind an if-check)
      'vite',
      // Cloud-only dynamic import in stripeClient.getStripeSync(); the
      // desktop server never calls it (see server/index-desktop.ts header)
      'stripe-replit-sync',
      '@vitejs/plugin-react',
    ],
    sourcemap: true,
    minify: false, // keep readable for debugging packaged app
    // Resolve @shared and @ path aliases
    alias: {
      '@shared': path.join(ROOT, 'shared'),
      '@': path.join(ROOT, 'client', 'src'),
    },
    define: {
      'import.meta.dirname': '__dirname',
      'import.meta.url': '__importMetaUrl',
    },
    // file:// URL of the bundle itself, for import.meta.url consumers
    banner: { js: "const __importMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
    logLevel: 'info',
  });

  console.log('[build:server] Done');
}

main().catch((err) => {
  console.error('[build:server] Failed:', err);
  process.exit(1);
});
