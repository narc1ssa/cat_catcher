const http = require('node:http');
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex < 0 ? process.env.PORT || 5173 : args[portIndex + 1]);
const dist = path.resolve(__dirname, '../dist');
const indexFile = path.join(dist, 'index.html');
if (!fs.existsSync(indexFile)) { console.error('Build missing. Run npm run build.'); process.exit(1); }

const html = fs.readFileSync(indexFile);
const staticFiles = new Map([
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icons/icon-192.png', ['icons/icon-192.png', 'image/png']],
  ['/icons/icon-512.png', ['icons/icon-512.png', 'image/png']],
].map(([suffix, [relative, type]]) => {
  const file = path.join(dist, relative);
  if (!fs.existsSync(file)) { console.error(`Build asset missing: ${file}`); process.exit(1); }
  return [suffix, {body: fs.readFileSync(file), type}];
}));

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://preview').pathname;
  if (pathname.endsWith('/favicon.ico')) { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {'Content-Type':'text/plain; charset=utf-8', Allow:'GET, HEAD'});
    res.end('Method not allowed');
    return;
  }

  let body, type, cacheControl;
  if (pathname.endsWith('/') || pathname.endsWith('/index.html')) {
    body = html;
    type = 'text/html; charset=utf-8';
    cacheControl = 'no-store, max-age=0';
  } else {
    const asset = [...staticFiles].find(([suffix]) => pathname.endsWith(suffix))?.[1];
    if (!asset) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      res.end('Not found');
      return;
    }
    body = asset.body;
    type = asset.type;
    cacheControl = pathname.endsWith('/sw.js') ? 'no-cache' : 'no-store, max-age=0';
  }

  const compressible = !type.startsWith('image/');
  const compressed = compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const payload = compressed ? zlib.gzipSync(body) : body;
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': payload.length,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    ...(compressible ? {'Vary': 'Accept-Encoding'} : {}),
    ...(compressed ? {'Content-Encoding':'gzip'} : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : payload);
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '0.0.0.0', () => console.log(`Котолов: http://0.0.0.0:${port} — standalone HTML + Android PWA shell`));
