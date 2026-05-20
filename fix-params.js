const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('route.ts')) results.push(file);
    }
  });
  return results;
}

const files = walk('./src/app/api');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  // Replace { params }: { params: { ... } } with { params }: { params: Promise<{ ... }> }
  const regex = /\{ params \}: \{ params: \{([^}]+)\} \}/g;
  content = content.replace(regex, (match, inner) => {
    changed = true;
    return `{ params }: { params: Promise<{${inner}}> }`;
  });
  
  // also handle { params }: { params: Promise<{ id: string, toolId: string }> } which might exist (like in execute)
  
  if (changed || content.includes('params.id') || content.includes('params.toolId') || content.includes('params.serverId') || content.includes('params.branchId')) {
    // replace `params.id` with `(await params).id` only if it's not already awaited
    // be careful not to double await
    content = content.replace(/params\.([a-zA-Z0-9_]+)/g, '(await params).$1');
    content = content.replace(/\(await \(await params\)\.([a-zA-Z0-9_]+)\)/g, '(await params).$1');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
});
