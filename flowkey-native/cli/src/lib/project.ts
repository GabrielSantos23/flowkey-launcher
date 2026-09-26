import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, type ExtensionManifest } from '@flowkey/native-sdk';

/** Absolute path to the CLI package directory (works from src and dist). */
function findCliRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'shims', 'react.ts'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return start;
}

export const cliRoot = findCliRoot(dirname(fileURLToPath(import.meta.url)));

export const shimAliases: Record<string, string> = {
  react: join(cliRoot, 'shims', 'react.ts'),
  'react/jsx-runtime': join(cliRoot, 'shims', 'react-jsx-runtime.ts'),
  'react/jsx-dev-runtime': join(cliRoot, 'shims', 'react-jsx-runtime.ts'),
  '@flowkey/react-ui': join(cliRoot, 'shims', 'flowkey-react-ui.ts'),
  '@flowkey/native-sdk': join(cliRoot, 'shims', 'flowkey-native-sdk.ts'),
};

export const SOURCE_ENTRIES = ['src/index.tsx', 'src/index.ts'];
export const DEFAULT_ENTRY_FILE = 'main.js';

export interface LoadedManifest {
  path: string;
  dir: string;
  manifest: ExtensionManifest;
  warnings: string[];
}

export class ProjectError extends Error {}

export function findManifestPath(explicit?: string): string {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new ProjectError(`manifest not found: ${explicit}`);
    }
    return resolve(explicit);
  }
  const local = resolve('manifest.json');
  if (existsSync(local)) {
    return local;
  }
  throw new ProjectError('manifest.json not found in the current directory (use --manifest)');
}

export function loadManifest(explicit?: string): LoadedManifest {
  const path = findManifestPath(explicit);
  const dir = dirname(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProjectError(`manifest is not valid JSON: ${(error as Error).message}`);
  }
  const result = validateManifest(parsed);
  if (result.errors.length > 0) {
    const lines = result.errors.map((e) => `  ${e.field || 'manifest'} [${e.code}]: ${e.message}`);
    throw new ProjectError(`manifest has ${result.errors.length} error(s):\n${lines.join('\n')}`);
  }
  return {
    path,
    dir,
    manifest: parsed as ExtensionManifest,
    warnings: result.warnings.map((w) => `${w.field} [${w.code}]: ${w.message}`),
  };
}

export function findSourceEntry(dir: string): string {
  for (const candidate of SOURCE_ENTRIES) {
    const full = join(dir, candidate);
    if (existsSync(full)) {
      return full;
    }
  }
  throw new ProjectError(
    `no source entry found (expected ${SOURCE_ENTRIES.join(' or ')} in ${dir})`,
  );
}

export function resolveEntryFile(manifest: ExtensionManifest): string {
  return manifest.entry ?? DEFAULT_ENTRY_FILE;
}

export function resolveDistDir(manifestDir: string): string {
  return join(manifestDir, 'dist');
}

/** Default install target mirrors the shell: %LOCALAPPDATA%\FlowKey.Shell\extensions\<id>. */
export function defaultExtensionsRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    return join(localAppData, 'FlowKey.Shell', 'extensions');
  }
  return join(process.env.HOME ?? process.cwd(), '.flowkey', 'extensions');
}

export function resolveInstallDir(manifest: ExtensionManifest, target?: string): string {
  const root = target ? (isAbsolute(target) ? target : resolve(target)) : defaultExtensionsRoot();
  return join(root, manifest.id);
}
