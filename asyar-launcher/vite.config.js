import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';
import { existsSync } from 'fs';
import { resolve } from 'path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const sdkSrcDir = resolve(__dirname, '../asyar-sdk/src');
const sdkSubpaths = /** @type {const} */ (['contracts', 'worker', 'view']);
const useLocalSdk = sdkSubpaths.every((sub) => existsSync(resolve(sdkSrcDir, `${sub}.ts`)));

export default defineConfig(({ mode }) => {
  console.log(
    `\x1b[36m[Vite]\x1b[0m Asyar-SDK resolution: \x1b[33m${
      useLocalSdk ? `Local Source (${sdkSrcDir})` : 'node_modules (NPM)'
    }\x1b[0m`,
  );

  // Map each asyar-sdk subpath (./contracts, ./worker, ./view) at alias level
  // so dev edits under ../asyar-sdk/src/ hot-reload without going through the
  // SDK's compiled dist/. In CI/published-npm mode the local source does not
  // exist and Node resolution falls back to node_modules/asyar-sdk/package.json
  // exports, so the alias object is empty.
  const sdkAliases = useLocalSdk
    ? Object.fromEntries(
        sdkSubpaths.map((sub) => [`asyar-sdk/${sub}`, resolve(sdkSrcDir, `${sub}.ts`)]),
      )
    : {};

  return {
    plugins: [tailwindcss(), react()],

    resolve: {
      alias: {
        $lib: resolve(__dirname, 'src/lib'),
        ...sdkAliases,
      },
    },

    // Tauri's frontendDist points at ../build. Every Tauri window loads a
    // plain path ("/island", "/sticky", …) that maps to <path>/index.html — the
    // SPA entries.
    build: {
      // Must land at `asyar-launcher/build` (tauri.conf.json frontendDist is
      // '../build' relative to src-tauri). '../build' resolves to the repo
      // root and breaks `tauri build` with "Unable to find your web assets".
      outDir: 'build',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          island: resolve(__dirname, 'island/index.html'),
          sticky: resolve(__dirname, 'sticky/index.html'),
          snapGuides: resolve(__dirname, 'snap-guides/index.html'),
          onboarding: resolve(__dirname, 'onboarding/index.html'),
          settings: resolve(__dirname, 'settings/index.html'),
        },
      },
    },

    // In local workspace dev, EXCLUDE the SDK subpaths from Vite's dep
    // pre-bundling so every edit in ../asyar-sdk/src hot-reloads immediately.
    // Including them would freeze bundled copies in node_modules/.vite/deps
    // that only invalidate when package.json changes.
    //
    // Never list the bare "asyar-sdk" specifier in either exclude or include —
    // the SDK's exports map has no "." entry, so probing it makes Vite's
    // dep-optimizer abort with "Missing '.' specifier in 'asyar-sdk' package".
    optimizeDeps: useLocalSdk
      ? { exclude: sdkSubpaths.map((sub) => `asyar-sdk/${sub}`) }
      : { include: sdkSubpaths.map((sub) => `asyar-sdk/${sub}`) },

    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
      fs: {
        allow: [
          resolve(__dirname, '..'), // workspace root (for hoisted node_modules/.pnpm)
        ],
      },
    },
  };
});
