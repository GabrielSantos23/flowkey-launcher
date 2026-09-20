import fs from 'fs';
import path from 'path';

function findSvelteTsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'build' && file !== 'dist') {
        results = results.concat(findSvelteTsFiles(filePath));
      }
    } else if (file.endsWith('.svelte.ts') || file.endsWith('.svelte.test.ts')) {
      results.push(filePath);
    }
  }
  return results;
}

function convertRuneContent(content) {
  let out = content;

  // Remove Svelte imports
  out = out.replace(/import\s*\{[^}]*\}\s*from\s*['"]svelte['"];?\r?\n?/g, '');
  out = out.replace(/import\s+type\s*\{[^}]*\}\s*from\s*['"]svelte['"];?\r?\n?/g, '');

  // Convert $derived.by(() => { ... })
  out = out.replace(/=\s*\$derived\.by\(\(\)\s*=>\s*\{([\s\S]*?)\}\);/g, (match, body) => {
    return `= (() => {${body}})();`;
  });

  // Convert $derived(...)
  out = out.replace(/=\s*\$derived<([^>]+)>\(([^)]+)\);/g, ': $1 = $2;');
  out = out.replace(/=\s*\$derived\(([^)]+)\);/g, '= $1;');

  // Convert $state<Type>(initialValue)
  out = out.replace(/=\s*\$state<([^>]+)>\(([\s\S]*?)\);/g, ': $1 = $2;');

  // Convert $state(initialValue)
  out = out.replace(/=\s*\$state\(([\s\S]*?)\);/g, '= $1;');

  // Convert $state<Type>()
  out = out.replace(/=\s*\$state<([^>]+)>\(\);/g, ': $1 | undefined = undefined;');
  out = out.replace(/=\s*\$state\(\);/g, '= undefined;');

  // Convert $effect
  out = out.replace(/\$effect\(\(\)\s*=>\s*\{/g, '/* effect */ (() => {');

  return out;
}

const files = findSvelteTsFiles('D:/projects/asyar/asyar-launcher/src');
console.log(`Found ${files.length} .svelte.ts files.`);

for (const f of files) {
  const content = fs.readFileSync(f, 'utf-8');
  const converted = convertRuneContent(content);
  let newPath = f;
  if (f.endsWith('.svelte.test.ts')) {
    newPath = f.replace(/\.svelte\.test\.ts$/, '.test.ts');
  } else if (f.endsWith('.svelte.ts')) {
    newPath = f.replace(/\.svelte\.ts$/, '.ts');
  }
  fs.writeFileSync(newPath, converted, 'utf-8');
  if (newPath !== f) {
    fs.unlinkSync(f);
  }
  console.log(`Converted: ${f} -> ${newPath}`);
}
