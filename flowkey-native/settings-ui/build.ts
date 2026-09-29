import { mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// Build output lands inside the shell's Assets/Web folder so the existing
// app.flowkey.local virtual host serves it — no new host mapping needed.
const outDir = join(here, '..', 'shell', 'src', 'Shell', 'Assets', 'Web', 'settings');

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(here, 'src', 'main.tsx')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  platform: 'browser',
  jsx: 'automatic',
  outfile: join(outDir, 'app.js'),
  alias: { '@': join(here, 'src') },
  minify: !watch,
  sourcemap: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

const tailwind = Bun.spawnSync({
  cmd: [
    'bunx',
    '@tailwindcss/cli',
    '-i',
    join(here, 'src', 'styles.css'),
    '-o',
    join(outDir, 'app.css'),
    '--minify',
  ],
  cwd: here,
  stdout: 'inherit',
  stderr: 'inherit',
});
if (tailwind.exitCode !== 0) {
  throw new Error(`tailwind build failed with exit code ${tailwind.exitCode}`);
}

// Inter ships as WPF resources; copy the same faces for @font-face in the page.
const fontsSource = join(here, '..', 'shell', 'src', 'Shell', 'Assets', 'Fonts');
const fontsTarget = join(outDir, 'fonts');
if (existsSync(fontsSource)) {
  mkdirSync(fontsTarget, { recursive: true });
  for (const face of ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf']) {
    cpSync(join(fontsSource, face), join(fontsTarget, face));
  }
}

console.log(`settings ui built → ${outDir}`);
