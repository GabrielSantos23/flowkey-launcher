#!/usr/bin/env node
/**
 * Full clean production build.
 * 1. Clean previous Tauri build output
 * 2. Build asyar-sdk (types + CLI)
 * 3. Run pnpm tauri build (Rust + frontend -> native binary)
 *
 * Windows (Node.js).
 */
import { execSync } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const launcherDir = resolve(root, 'asyar-launcher');
const requestedBuildArgs = process.argv.slice(2);
const buildArgs = requestedBuildArgs[0] === '--' ? requestedBuildArgs.slice(1) : requestedBuildArgs;
const isLocalBuild = buildArgs.length === 1 && buildArgs[0] === '--local';

if (buildArgs.length > 0 && !isLocalBuild) {
  console.error('Usage: pnpm build [--local]');
  process.exit(64);
}

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(msg) {
  console.log(`\n── ${msg} ${'─'.repeat(Math.max(0, 60 - msg.length))}`);
}

// 1. Clean
step('Cleaning previous build output');

const toClean = [
  resolve(launcherDir, 'src-tauri', 'target', 'release', 'bundle'),
  resolve(launcherDir, '.svelte-kit', 'output'),
  resolve(launcherDir, '.vite'),
];
for (const dir of toClean) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`  removed ${dir.replace(root + '/', '')}`);
  }
}

// 2. Build SDK
step('Building asyar-sdk');
try {
  run('pnpm run build:all', resolve(root, 'asyar-sdk'));
  console.log('✓ SDK built');
} catch {
  console.error('✗ SDK build failed');
  process.exit(1);
}

// 3. Tauri build (Rust + frontend)
step('Building asyar-launcher (pnpm tauri build)');
try {
  const buildCommand = isLocalBuild
    ? 'ASYAR_KEYCHAIN_SERVICE=org.asyar.dev pnpm tauri build --config src-tauri/tauri.dev.conf.json --config \'{"bundle":{"createUpdaterArtifacts":false}}\''
    : 'pnpm tauri build';
  run(buildCommand, launcherDir);
  console.log('\n✓ Build complete');
} catch {
  console.error('✗ Tauri build failed');
  process.exit(1);
}
