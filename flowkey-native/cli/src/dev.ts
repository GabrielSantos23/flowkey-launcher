import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { context } from 'esbuild';
import { esbuildConfig, writeDistManifest } from './build';
import {
  findSourceEntry,
  loadManifest,
  resolveDistDir,
  resolveEntryFile,
  resolveInstallDir,
} from './lib/project';

/** Builds, installs into the shell's extensions dir, then watches for changes. */
export async function devWatch(options: { manifest?: string; target?: string }): Promise<void> {
  const loaded = loadManifest(options.manifest);
  const sourceEntry = findSourceEntry(loaded.dir);
  const entryFile = resolveEntryFile(loaded.manifest);
  const distDir = resolveDistDir(loaded.dir);
  const installDir = resolveInstallDir(loaded.manifest, options.target);

  const install = (): void => {
    rmSync(installDir, { recursive: true, force: true });
    mkdirSync(installDir, { recursive: true });
    cpSync(distDir, installDir, { recursive: true });
    console.log(`installed ${loaded.manifest.name} → ${installDir}`);
    console.log('restart FlowKey to load the new build');
  };

  const ctx = await context(esbuildConfig(sourceEntry, join(distDir, entryFile), false));
  await ctx.rebuild();
  writeDistManifest(loaded, distDir, entryFile);
  install();
  console.log('watching for changes… (Ctrl+C to stop)');
  await ctx.watch();
  await new Promise<void>(() => {
    /* esbuild keeps the watcher alive */
  });
}
