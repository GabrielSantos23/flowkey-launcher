#!/usr/bin/env node
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { packageExtension, buildExtension } from './build';
import { devWatch } from './dev';
import { scaffoldExtension, validateFile } from './scaffold';

const cliDir = join(dirname(fileURLToPath(import.meta.url)));

const program = new Command();

program
  .name('flowkey')
  .description('Build, validate, package and install FlowKey extensions.')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate the extension manifest.json')
  .option('--manifest <path>', 'path to manifest.json (default: ./manifest.json)')
  .action((options: { manifest?: string }) => {
    const manifestPath = options.manifest ?? join(process.cwd(), 'manifest.json');
    const { errors } = validateFile(manifestPath);
    process.exitCode = errors > 0 ? 1 : 0;
  });

program
  .command('build')
  .description('Bundle the extension into dist/ ready for packaging')
  .option('--manifest <path>', 'path to manifest.json (default: ./manifest.json)')
  .option('--out <dir>', 'output directory (default: ./dist)')
  .option('--minify', 'minify the bundle', false)
  .action(async (options: { manifest?: string; out?: string; minify?: boolean }) => {
    await buildExtension({
      manifest: options.manifest,
      outDir: options.out,
      minify: options.minify,
      log: console.log,
    });
  });

program
  .command('dev')
  .description('Build, install into FlowKey and rebuild on changes')
  .option('--manifest <path>', 'path to manifest.json (default: ./manifest.json)')
  .option(
    '--target <dir>',
    'extensions root to install into (default: %LOCALAPPDATA%\\FlowKey.Shell\\extensions)',
  )
  .action(async (options: { manifest?: string; target?: string }) => {
    await devWatch({ manifest: options.manifest, target: options.target });
  });

program
  .command('package')
  .description('Build and produce the .flowkey zip for sharing')
  .option('--manifest <path>', 'path to manifest.json (default: ./manifest.json)')
  .option('--out <path>', 'output .flowkey path or directory (default: ./<id>-<version>.flowkey)')
  .option('--skip-build', 'package the existing dist/ without rebuilding', false)
  .action(async (options: { manifest?: string; out?: string; skipBuild?: boolean }) => {
    await packageExtension({
      manifest: options.manifest,
      out: options.out,
      skipBuild: options.skipBuild,
      log: console.log,
    });
  });

program
  .command('init')
  .description('Scaffold a new extension project')
  .argument('<name>', 'extension display name')
  .option('--id <id>', 'extension id (default: derived from the name)')
  .option('--dir <dir>', 'target directory (default: ./<id>)')
  .action((name: string, options: { id?: string; dir?: string }) => {
    scaffoldExtension({
      name,
      id: options.id,
      dir: options.dir,
      templateDir: join(cliDir, '..', 'templates', 'default'),
    });
  });

program.parseAsync(process.argv).catch((error: Error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
