// Scaffold a new entry from the template:  npm run new -- <name> [--platform crow]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, ENTRIES_DIR, PLATFORMS, DEFAULT_PLATFORM, SLUG_RE } from './lib.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : DEFAULT_PLATFORM;
const platforms = Object.keys(PLATFORMS).join('|');

if (!name || !SLUG_RE.test(name)) {
  console.error(`usage: npm run new -- <name> [--platform ${platforms}]   (letters, digits, "_", "-", "."; use the exact repo name)`);
  process.exit(1);
}
if (!PLATFORMS[platform]) {
  console.error(`unknown platform "${platform}" (use: ${platforms})`);
  process.exit(1);
}
const rel = `${ENTRIES_DIR}/${name}`;
const dir = path.join(ROOT, rel);
const taken = fs.existsSync(path.join(ROOT, ENTRIES_DIR)) && fs.readdirSync(path.join(ROOT, ENTRIES_DIR)).some((d) => d.toLowerCase() === name.toLowerCase());
if (taken) {
  console.error(`${rel} already exists; names are shared by all platforms, so pick another one`);
  process.exit(1);
}
const tpl = fs
  .readFileSync(path.join(ROOT, 'templates', 'entry.md'), 'utf8')
  .replaceAll('my-script', name)
  .replace(/^platform: .*$/m, `platform: ${platform}`)
  .replace(/^added: .*$/m, `added: ${new Date().toISOString().slice(0, 10)}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.md'), tpl);
console.log(`✓ created ${rel}/index.md — fill in the front matter, then run: npm run validate`);
