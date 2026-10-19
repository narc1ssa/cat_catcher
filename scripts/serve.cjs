const http = require('node:http');
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number(portIndex < 0 ? process.env.PORT || 5173 : args[portIndex + 1]);
const file = path.resolve(__dirname, '../dist/index.html');
if (!fs.existsSync(file)) { console.error('Build missing. Run npm run build.');process.exit(1); }
const html = fs.readFileSync(file);
const gzip = zlib.gzipSync(html);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://preview').pathname;
  if (pathname.endsWith('/favicon.ico')) {res.writeHead(204);res.end();return;}
  if (!pathname.endsWith('/') && !pathname.endsWith('/index.html')) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;
  }
  const compressed = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const payload = compressed ? gzip : html;
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store, max-age=0',
    'Vary': 'Accept-Encoding',
    ...(compressed ? {'Content-Encoding':'gzip'} : {}),
  });
  res.end(req.method === 'HEAD' ? undefined : payload);
});
server.on('error', error=>{console.error(error.message);process.exit(1)});
server.listen(port,'0.0.0.0',()=>console.log(`Котолов: http://0.0.0.0:${port} — standalone HTML (${gzip.length} bytes gzip)`));
