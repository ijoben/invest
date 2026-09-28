const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'scratch' || file === '.gemini') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk('.');
const patterns = [
  /fgt/i,
  /UFQgRkdUIFBSTyBJTlZFU1RBU0k=/,
  /fgtpro/i,
  /fgt_pro/i
];

console.log('--- SCAN RESULTS ---');
for (const f of files) {
  if (f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ico') || f.endsWith('.zip') || f.endsWith('.lock') || f.endsWith('.log')) continue;
  let content = '';
  try {
    content = fs.readFileSync(f, 'utf8');
  } catch (e) {
    continue;
  }
  let matched = [];
  for (const p of patterns) {
    if (p.test(content)) matched.push(p.toString());
  }
  if (matched.length > 0) {
    const lines = content.split('\n');
    let lineMatches = [];
    lines.forEach((l, idx) => {
      if (/fgt/i.test(l) || /UFQgRkdUIFBSTyBJTlZFU1RBU0k=/.test(l)) {
        lineMatches.push((idx + 1) + ': ' + l.trim().substring(0, 120));
      }
    });
    console.log('FILE: ' + f + ' (' + matched.join(', ') + ')');
    lineMatches.slice(0, 8).forEach(lm => console.log('   ' + lm));
    if (lineMatches.length > 8) console.log('   ... and ' + (lineMatches.length - 8) + ' more lines');
  }
}
