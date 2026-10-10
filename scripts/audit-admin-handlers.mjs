import fs from 'fs';

const html = fs.readFileSync('admin.html', 'utf8');
const regex = /onclick=["']([^"']+)["']/g;
const matches = new Set();
let match;
while ((match = regex.exec(html)) !== null) {
  matches.add(match[1]);
}

console.log('--- ADMIN ONCLICK HANDLERS ---');
[...matches].sort().forEach(m => console.log(m));
