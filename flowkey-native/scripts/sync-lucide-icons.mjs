// Generates the lucide-icons extension's bundled icon metadata from the
// lucide-static npm package: names, keywords (tags) and canonical SVG markup
// (built from icon-nodes.json the same way the Raycast extension's
// createLucideIcon does). Written to extensions/lucide-icons/src/generated/.
// The extension bundles this so it works fully offline — the shell stays
// generic (icons travel as iconSvg content, never as shell-shipped assets).
//
// Run: pnpm --dir flowkey-native icons:sync
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'package.json'));

const lucideStaticDir = dirname(require.resolve('lucide-static/package.json'));
const nodesPath = join(lucideStaticDir, 'icon-nodes.json');
const tagsPath = join(lucideStaticDir, 'tags.json');
if (!existsSync(nodesPath) || !existsSync(tagsPath)) {
  console.error('lucide-static is missing icon-nodes.json/tags.json; cannot build metadata');
  process.exit(1);
}

const nodes = JSON.parse(readFileSync(nodesPath, 'utf8'));
const tags = JSON.parse(readFileSync(tagsPath, 'utf8'));

const DEFAULT_ATTRIBUTES = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

/** Builds the canonical lucide SVG for one icon node. */
export function buildSvg(iconNode, className) {
  const attributes = { ...DEFAULT_ATTRIBUTES, class: className };
  const open = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
  const children = iconNode
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${rendered}/>`;
    })
    .join('');
  return `<svg ${open}>${children}</svg>`;
}

const metadata = Object.keys(nodes)
  .sort((a, b) => a.localeCompare(b))
  .map((name) => {
    const pascalName = name
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return {
      name,
      pascalName,
      keywords: tags[name] ?? [],
      svg: buildSvg(nodes[name], `lucide lucide-${name}`),
    };
  });

const generatedDir = join(repoRoot, 'extensions', 'lucide-icons', 'src', 'generated');
rmSync(generatedDir, { recursive: true, force: true });
mkdirSync(generatedDir, { recursive: true });
writeFileSync(join(generatedDir, 'lucide-metadata.json'), JSON.stringify(metadata));
writeFileSync(
  join(generatedDir, 'version.json'),
  JSON.stringify(
    { package: 'lucide-static', generatedAt: new Date().toISOString(), count: metadata.length },
    null,
    2,
  ),
);
console.log(
  `extension metadata: ${metadata.length} icons written to extensions/lucide-icons/src/generated/`,
);
