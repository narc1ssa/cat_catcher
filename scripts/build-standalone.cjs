// Build one HTML document: no modules, network fonts, external CSS or images.
const fs = require('node:fs');
const data = JSON.parse(fs.readFileSync('assets/embedded.json', 'utf8'));
let code = fs.readFileSync('game.js', 'utf8')
  .replace(/^import .+;\r?\n/gm, '')
  .replace("new URL('./assets/garden.jpg', import.meta.url).href", JSON.stringify(data.garden));
code = `const catFrameURLs = ${JSON.stringify(data.cats)};\nconst playerFrameURLs = ${JSON.stringify(data.player)};\n` + code;
if (/import\.meta|^import /m.test(code)) throw Error('Unresolved ES module in standalone build');
let html = fs.readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="style.css">', `<style>${fs.readFileSync('style.css','utf8')}</style>`)
  .replace('src="./assets/garden.jpg"', `src="${data.garden}"`)
  .replace('<script type="module" src="game.js"></script>', () => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
fs.mkdirSync('dist', {recursive:true});
fs.writeFileSync('dist/index.html', html);
console.log(`Standalone game: ${Buffer.byteLength(html)} bytes, no external dependencies`);
