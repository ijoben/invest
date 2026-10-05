// Lightweight PHP balance checker (no PHP CLI available locally).
// Skips single/double quoted strings, heredocs/nowdocs and comments,
// then verifies {}, () and [] are balanced.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/php-balance-check.mjs <file.php>');
  process.exit(2);
}

const src = readFileSync(file, 'utf8');
let i = 0;
const n = src.length;
const stack = [];
const lineOf = (pos) => src.slice(0, pos).split('\n').length;
let mode = 'code';
let heredocTag = '';
let ok = true;

while (i < n) {
  const c = src[i];
  const next = src[i + 1];

  if (mode === 'line') {
    if (c === '\n') mode = 'code';
    i++;
    continue;
  }
  if (mode === 'block') {
    if (c === '*' && next === '/') { mode = 'code'; i += 2; continue; }
    i++;
    continue;
  }
  if (mode === 'sq' || mode === 'dq') {
    if (c === '\\') { i += 2; continue; }
    if (c === (mode === 'sq' ? "'" : '"')) mode = 'code';
    i++;
    continue;
  }
  if (mode === 'heredoc') {
    if (c === '\n') {
      const rest = src.slice(i + 1);
      const m = rest.match(new RegExp('^' + heredocTag.replace(/[$]/g, '\\$') + ';?'));
      if (m) { mode = 'code'; i += 1 + m[0].length; continue; }
    }
    i++;
    continue;
  }

  // code mode
  if (c === '/' && next === '/') { mode = 'line'; i += 2; continue; }
  if (c === '#') { mode = 'line'; i++; continue; }
  if (c === '/' && next === '*') { mode = 'block'; i += 2; continue; }
  if (c === "'") { mode = 'sq'; i++; continue; }
  if (c === '"') { mode = 'dq'; i++; continue; }
  const hd = src.slice(i).match(/^<<<\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/);
  if (hd) { mode = 'heredoc'; heredocTag = hd[2]; i += hd[0].length; continue; }

  if (c === '{' || c === '(' || c === '[') {
    stack.push({ ch: c, line: lineOf(i) });
    i++;
    continue;
  }
  if (c === '}' || c === ')' || c === ']') {
    const open = stack.pop();
    const pair = { '}': '{', ')': '(', ']': '[' }[c];
    if (!open || open.ch !== pair) {
      console.error(`MISMATCH: '${c}' at line ${lineOf(i)} but top of stack is ${open ? `'${open.ch}' from line ${open.line}` : 'empty'}`);
      ok = false;
      i++;
      continue;
    }
    i++;
    continue;
  }
  i++;
}

for (const left of stack) {
  console.error(`UNCLOSED: '${left.ch}' opened at line ${left.line}`);
  ok = false;
}

if (ok) {
  console.log(`OK: ${file} — braces/parens/brackets balanced, unterminated mode=${mode}`);
  process.exit(0);
}
process.exit(1);
