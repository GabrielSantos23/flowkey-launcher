import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { validateManifest } from '@flowkey/native-sdk';
import { ProjectError } from './lib/project';

export function validateFile(manifestPath: string): { errors: number; warnings: number } {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const result = validateManifest(parsed);
    for (const issue of result.errors) {
      console.error(`error: ${issue.field || 'manifest'} [${issue.code}]: ${issue.message}`);
    }
    for (const issue of result.warnings) {
      console.warn(`warning: ${issue.field || 'manifest'} [${issue.code}]: ${issue.message}`);
    }
    if (result.errors.length === 0) {
      console.log(`${manifestPath}: OK (${result.warnings.length} warning(s))`);
    }
    return { errors: result.errors.length, warnings: result.warnings.length };
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error(`error: manifest is not valid JSON: ${error.message}`);
      return { errors: 1, warnings: 0 };
    }
    throw error;
  }
}

function copyTemplate(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

export function scaffoldExtension(options: {
  name: string;
  id?: string;
  dir?: string;
  templateDir: string;
}): string {
  const id =
    options.id ??
    options.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/\.(ts|tsx|js)$/, '');
  const validation = validateManifest({
    id,
    name: options.name,
    version: '0.1.0',
    commands: [{ id: 'open', title: options.name }],
    nativeMethods: [],
    httpHosts: [],
  });
  if (validation.errors.length > 0) {
    throw new ProjectError(
      `derived id '${id}' is invalid; pass a --id like 'com.yourname.${options.name.toLowerCase().replace(/[^a-z0-9]/g, '')}'`,
    );
  }
  const targetDir = options.dir ?? join(process.cwd(), id);
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new ProjectError(`target directory is not empty: ${targetDir}`);
  }
  copyTemplate(options.templateDir, targetDir);

  const replacements: Record<string, string> = {
    __EXTENSION_ID__: id,
    __EXTENSION_NAME__: options.name,
    __EXTENSION_DESCRIPTION__: `${options.name} — a FlowKey extension.`,
  };
  const applyReplacements = (path: string): void => {
    if (path.endsWith('.DS_Store')) return;
    if (renameSyncSafe(path)) return;
    const content = readFileSync(path, 'utf8');
    writeFileSync(
      path,
      content.replace(/__EXTENSION_[A-Z_]+__/g, (token) => replacements[token] ?? token),
    );
  };
  walk(targetDir, applyReplacements);

  console.log(`scaffolded ${options.name} in ${targetDir}`);
  console.log('next steps:');
  console.log(`  cd ${basename(targetDir)}`);
  console.log('  pnpm install        # or npm install / bun install');
  console.log('  pnpm dev            # build + install into FlowKey, watching for changes');
  console.log('  pnpm package        # produce the .flowkey zip for sharing');
  return targetDir;
}

function renameSyncSafe(path: string): boolean {
  // Files named with the .tmpl suffix (used for assets that would otherwise
  // be picked up by tooling inside the template) are renamed during install.
  if (!path.endsWith('.tmpl')) {
    return false;
  }
  renameSync(path, path.slice(0, -'.tmpl'.length));
  return true;
}

function walk(dir: string, visit: (path: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statIsDirectory(full)) {
      walk(full, visit);
    } else {
      visit(full);
    }
  }
}

function statIsDirectory(path: string): boolean {
  return statSync(path).isDirectory();
}
