// Shared helpers: config, entry loading, front matter parsing, validation rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// All entries live in scripts/<name>/index.md, whatever platform they run on.
export const ENTRIES_DIR = 'scripts';

// Where the code runs (front matter `platform`, default norns). Grid and arc are controllers, so they are
// hardware (`requires`), not platforms. Only `maiden` platforms go into catalog.json; `luaRoot` enables
// the online "main .lua at the repo root" check.
export const PLATFORMS = {
  norns: { label: 'norns', maiden: true, luaRoot: true },
  iii: { label: 'iii' },
  crow: { label: 'crow' },
  teletype: { label: 'teletype' },
};
export const DEFAULT_PLATFORM = 'norns';

export const AI_VALUES = ['none', 'assisted', 'generated', 'unknown'];
export const SOURCE_VALUES = ['submitted', 'imported'];
export const KNOWN_REQUIRES = ['grid', 'arc', 'crow', 'midi', 'audio-in', 'keyboard', 'jf', 'ansible', 'teletype', 'hid', 'osc', 'txo', 'er-301'];
export const SLUG_RE = /^[a-z0-9_][a-z0-9_.-]*$/;
export const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
}

export function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  return { data: YAML.parse(m[1]) ?? {}, body: m[2] };
}

export function stringifyFrontMatter(data, body = '') {
  return `---\n${YAML.stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export function normalizeRepo(url) {
  return String(url || '')
    .trim()
    .replace(/^git\+/, '')
    .replace(/^http:\/\//, 'https://')
    .replace(/^https:\/\/www\./, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function githubSlug(url) {
  const m = normalizeRepo(url).match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Load every scripts/<slug>/index.md entry. */
export function loadEntries() {
  const entries = [];
  const dir = path.join(ROOT, ENTRIES_DIR);
  if (!fs.existsSync(dir)) return entries;
  for (const slug of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, slug, 'index.md');
    if (!fs.existsSync(file)) continue;
    const { data, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
    const platform = data?.platform ?? DEFAULT_PLATFORM;
    entries.push({ platform, slug, file: path.relative(ROOT, file).replaceAll('\\', '/'), data, body });
  }
  return entries;
}

/** Returns a list of error strings for one entry (empty when valid). */
export function validateEntry(entry) {
  const errs = [];
  const d = entry.data;
  if (!d) return ['missing or malformed front matter (expected a --- YAML block at the top)'];
  if (!SLUG_RE.test(entry.slug)) errs.push(`folder name "${entry.slug}" must be lowercase letters, digits, "_", "-" or "."`);

  const reqStr = (k) => {
    if (typeof d[k] !== 'string' || !d[k].trim()) errs.push(`"${k}" is required and must be a non-empty string`);
  };
  reqStr('name');
  reqStr('repo');
  reqStr('author');
  reqStr('description');

  if (typeof d.name === 'string' && d.name !== entry.slug) {
    errs.push(`"name" (${d.name}) must match the folder name (${entry.slug}); on norns it is the folder the script installs into`);
  }
  if (!PLATFORMS[entry.platform]) errs.push(`"platform" must be one of: ${Object.keys(PLATFORMS).join(', ')}`);
  if (typeof d.repo === 'string' && !/^https:\/\/[^\s]+$/.test(d.repo)) errs.push('"repo" must be an https URL');
  if (typeof d.description === 'string' && d.description.length > 160) errs.push('"description" should be 160 characters or fewer');

  if (!Array.isArray(d.tags) || d.tags.length === 0) errs.push('"tags" must be a non-empty list');
  else for (const t of d.tags) if (!TAG_RE.test(String(t))) errs.push(`tag "${t}" must be lowercase kebab-case`);

  if (d.requires !== undefined) {
    if (!Array.isArray(d.requires)) errs.push('"requires" must be a list');
    else for (const r of d.requires) if (!KNOWN_REQUIRES.includes(r)) errs.push(`unknown "requires" value "${r}" (known: ${KNOWN_REQUIRES.join(', ')})`);
  }
  if (!AI_VALUES.includes(d.ai)) errs.push(`"ai" must be one of: ${AI_VALUES.join(', ')}`);
  if (d.source !== undefined && !SOURCE_VALUES.includes(d.source)) errs.push(`"source" must be one of: ${SOURCE_VALUES.join(', ')}`);
  if (d.source !== 'imported' && d.ai === 'unknown') errs.push('"ai: unknown" is only allowed for imported entries; submitters must disclose');
  for (const k of ['discussion', 'docs', 'cover']) {
    if (d[k] !== undefined && !/^https:\/\/[^\s]+$/.test(String(d[k]))) errs.push(`"${k}" must be an https URL`);
  }
  return errs;
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function gh(pathname, { token = process.env.GITHUB_TOKEN, accept = 'application/vnd.github+json' } = {}) {
  const headers = { Accept: accept, 'User-Agent': 'norns-catalog' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${pathname}`, { headers });
  return res;
}
