// Build the standalone game document and copy the Android PWA shell alongside it.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const data = JSON.parse(fs.readFileSync(path.join(root, 'assets/embedded.json'), 'utf8'));
let code = fs.readFileSync(path.join(root, 'game.js'), 'utf8')
  .replace(/^import .+;\r?\n/gm, '')
  .replace("new URL('./assets/garden.jpg', import.meta.url).href", JSON.stringify(data.garden));
code = `const catFrameURLs = ${JSON.stringify(data.cats)};\nconst playerFrameURLs = ${JSON.stringify(data.player)};\n` + code;
if (/import\.meta|^import /m.test(code)) throw Error('Unresolved ES module in standalone build');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', `<style>${fs.readFileSync(path.join(root, 'style.css'),'utf8')}</style>`)
  .replace('src="./assets/garden.jpg"', `src="${data.garden}"`)
  .replace('<script type="module" src="game.js"></script>', () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.mkdirSync(distDir, {recursive:true});
fs.writeFileSync(path.join(distDir, 'index.html'), html);
fs.cpSync(path.join(root, 'public'), distDir, {recursive:true});
console.log(`Standalone game: ${Buffer.byteLength(html)} bytes + Android PWA shell`);
