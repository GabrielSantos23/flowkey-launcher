import { defineConfig } from 'vitest/config';
import { existsSync } from 'fs';
import { fileURLToPath, URL } from 'url';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const sdkSrcDir = resolve(__dirname, '../asyar-sdk/src');
const sdkSubpaths = ['contracts', 'worker', 'view'] as const;
const useLocalSdk = sdkSubpaths.every((sub) => existsSync(resolve(sdkSrcDir, `${sub}.ts`)));

const sdkAliases = useLocalSdk
  ? Object.fromEntries(
      sdkSubpaths.map((sub) => [`asyar-sdk/${sub}`, resolve(sdkSrcDir, `${sub}.ts`)]),
    )
  : {};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Legacy SvelteKit alias still used by a few service modules.
      $lib: resolve(__dirname, 'src/lib'),
      ...sdkAliases,
    },
    conditions: ['browser'],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx,js}', 'scripts/**/*.test.mjs'],
  },
});
