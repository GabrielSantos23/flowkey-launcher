import fs from 'fs';
import path from 'path';

function findFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'build' && file !== 'dist') {
        results = results.concat(findFiles(filePath));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.mjs')) {
      results.push(filePath);
    }
  }
  return results;
}

const files = findFiles('D:/projects/asyar/asyar-launcher/src');
let updatedCount = 0;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf-8');
  let original = content;

  // Replace imports with .svelte.ts
  content = content.replace(/from\s+['"]([^'"]+)\.svelte['"]/g, (match, importPath) => {
    // Check if there is a .ts or .tsx file at that location
    const absPathTs = path.resolve(path.dirname(f), importPath + '.ts');
    const absPathTsx = path.resolve(path.dirname(f), importPath + '.tsx');
    if (fs.existsSync(absPathTs)) {
      return `from '${importPath}'`;
    }
    if (fs.existsSync(absPathTsx)) {
      return `from '${importPath}'`;
    }
    return `from '${importPath}'`;
  });

  content = content.replace(/from\s+['"]([^'"]+)\.svelte\.ts['"]/g, (match, importPath) => {
    return `from '${importPath}'`;
  });

  content = content.replace(/import\s*\(\s*['"]([^'"]+)\.svelte['"]\s*\)/g, (match, importPath) => {
    return `import('${importPath}')`;
  });

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf-8');
    updatedCount++;
  }
}

console.log(`Updated import paths in ${updatedCount} files.`);
