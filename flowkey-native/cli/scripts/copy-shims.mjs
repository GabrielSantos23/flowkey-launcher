import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distShims = join(cliRoot, 'dist', 'shims');
rmSync(distShims, { recursive: true, force: true });
cpSync(join(cliRoot, 'shims'), distShims, { recursive: true });
console.log('copied shims → dist/shims');
