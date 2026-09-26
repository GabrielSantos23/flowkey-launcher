import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { build, type BuildOptions } from 'esbuild';
import { zipSync, type Zippable } from 'fflate';
import { isImageFileName, type ExtensionManifest } from '@flowkey-cli/native-sdk';
import {
  findSourceEntry,
  loadManifest,
  resolveDistDir,
  resolveEntryFile,
  resolveInstallDir,
  shimAliases,
  type LoadedManifest,
} from './lib/project';

export interface BuildResult {
  outDir: string;
  entryFile: string;
  entryPath: string;
  files: string[];
}

/** Shared esbuild config for one-off builds and the dev watcher. */
export function esbuildConfig(
  sourceEntry: string,
  entryPath: string,
  minify: boolean,
): BuildOptions {
  return {
    entryPoints: [sourceEntry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    jsx: 'automatic',
    outfile: entryPath,
    alias: shimAliases,
    minify,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    metafile: true,
  };
}

/** Writes the dist manifest with the entry field pinned to the bundled file. */
export function writeDistManifest(
  loaded: LoadedManifest,
  distDir: string,
  entryFile: string,
): string {
  const distManifest: ExtensionManifest = { ...loaded.manifest, entry: entryFile };
  const path = join(distDir, 'manifest.json');
  writeFileSync(path, `${JSON.stringify(distManifest, null, 2)}\n`);
  return path;
}

/** Bundles the extension source into a self-contained dist directory. */
export async function buildExtension(options: {
  manifest?: string;
  outDir?: string;
  minify?: boolean;
  log?: (message: string) => void;
}): Promise<BuildResult> {
  const log = options.log ?? (() => {});
  const loaded = loadManifest(options.manifest);
  for (const warning of loaded.warnings) {
    log(`warning: ${warning}`);
  }
  const sourceEntry = findSourceEntry(loaded.dir);
  const entryFile = resolveEntryFile(loaded.manifest);
  const outDir = options.outDir ?? resolveDistDir(loaded.dir);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const entryPath = join(outDir, entryFile);

  const result = await build(esbuildConfig(sourceEntry, entryPath, options.minify ?? false));
  const bundled = Object.keys(result.metafile?.inputs ?? {}).length;

  writeDistManifest(loaded, outDir, entryFile);
  copyManifestIcon(loaded, outDir, log);

  const files = readdirSync(outDir).map((name) => join(outDir, name));
  log(`bundled ${bundled} module(s) → ${entryPath}`);
  for (const file of files) {
    log(`  ${basename(file)}: ${statSync(file).size} bytes`);
  }
  return { outDir, entryFile, entryPath, files };
}

/**
 * Image-form manifest icons ship with the package: copy the referenced file
 * (from the project root or its assets/ folder) into dist so the packaged
 * zip carries it, preserving the manifest's relative path.
 */
function copyManifestIcon(
  loaded: LoadedManifest,
  outDir: string,
  log: (message: string) => void,
): void {
  const icon = loaded.manifest.icon;
  if (icon === undefined || !isImageFileName(icon) || icon.includes('..')) {
    return;
  }
  for (const candidate of [join(loaded.dir, icon), join(loaded.dir, 'assets', icon)]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      const target = join(outDir, icon);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(candidate, target);
      log(`copied icon ${icon} → ${target}`);
      return;
    }
  }
  log(`warning: manifest icon '${icon}' not found in the project (looked in ./ and ./assets/)`);
}

function collectFiles(dir: string, into: Zippable, prefix = ''): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectFiles(full, into, `${prefix}${name}/`);
    } else {
      into[`${prefix}${name}`] = new Uint8Array(readFileSync(full));
    }
  }
}

/** Builds (unless skipped) and packages dist into an <id>-<version>.flowkey zip. */
export async function packageExtension(options: {
  manifest?: string;
  out?: string;
  skipBuild?: boolean;
  log?: (message: string) => void;
}): Promise<string> {
  const log = options.log ?? (() => {});
  const loaded = loadManifest(options.manifest);
  const outDir = resolveDistDir(loaded.dir);
  if (options.skipBuild && !existsSync(join(outDir, 'manifest.json'))) {
    throw new Error(`--skip-build set but ${outDir} has no build output; run a build first`);
  }
  if (!options.skipBuild) {
    await buildExtension({ manifest: options.manifest, log });
  }

  const files: Zippable = {};
  collectFiles(outDir, files);
  const zipBytes = zipSync(files, { level: 9 });

  const fileName = `${loaded.manifest.id}-${loaded.manifest.version}.flowkey`;
  const outPath = options.out
    ? options.out.endsWith('.flowkey')
      ? options.out
      : join(options.out, fileName)
    : join(loaded.dir, fileName);
  writeFileSync(outPath, zipBytes);
  log(`packaged ${outPath} (${zipBytes.length} bytes)`);
  return outPath;
}

/** Copies dist into the shell's extensions directory (dev workflow). */
export async function installForDev(options: {
  manifest?: string;
  target?: string;
  log?: (message: string) => void;
}): Promise<string> {
  const log = options.log ?? (() => {});
  await buildExtension({ manifest: options.manifest, log });
  const loaded: LoadedManifest = loadManifest(options.manifest);
  const installDir = resolveInstallDir(loaded.manifest, options.target);
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(installDir, { recursive: true });
  cpSync(resolveDistDir(loaded.dir), installDir, { recursive: true });
  log(`installed to ${installDir} — restart FlowKey to load the new build`);
  return installDir;
}
