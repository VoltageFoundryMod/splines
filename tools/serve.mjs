// Tiny static server for previewing dist/ locally, honoring basePath from site.config.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from './lib.mjs';

const DIST = path.join(ROOT, 'dist');
const base = (loadConfig().basePath || '').replace(/\/+$/, '');
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.xml': 'application/xml' };

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (base && p === '/') return res.writeHead(302, { Location: `${base}/` }).end();
    if (base && p.startsWith(base)) p = p.slice(base.length) || '/';
    let file = path.join(DIST, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
    if (!file.startsWith(DIST) || !fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': types['.html'] });
      return res.end(fs.existsSync(path.join(DIST, '404.html')) ? fs.readFileSync(path.join(DIST, '404.html')) : 'not found');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`→ http://localhost:${port}${base}/`));
