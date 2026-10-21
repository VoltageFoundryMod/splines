// Scaffold a new entry from the template:  npm run new -- <name> [--kind iii]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, KINDS, SLUG_RE } from './lib.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const kind = args.includes('--kind') ? args[args.indexOf('--kind') + 1] : 'norns';

if (!name || !SLUG_RE.test(name)) {
  console.error('usage: npm run new -- <name> [--kind norns|iii]   (lowercase, digits, "_", "-", ".")');
  process.exit(1);
}
if (!KINDS[kind]) {
  console.error(`unknown kind "${kind}" (use: ${Object.keys(KINDS).join(', ')})`);
  process.exit(1);
}
const dir = path.join(ROOT, kind, name);
if (fs.existsSync(dir)) {
  console.error(`${kind}/${name} already exists`);
  process.exit(1);
}
const tpl = fs.readFileSync(path.join(ROOT, 'templates', 'entry.md'), 'utf8').replaceAll('my-script', name);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.md'), tpl);
console.log(`✓ created ${kind}/${name}/index.md — fill in the front matter, then run: npm run validate`);
