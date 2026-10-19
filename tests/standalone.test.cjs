const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
test('standalone game embeds its runtime and keeps all app resources local',()=>{
 execFileSync(process.execPath,['scripts/build-standalone.cjs']);
 const html=fs.readFileSync('dist/index.html','utf8');
 assert(!/<script[^>]+src=/.test(html));
 assert(!/<link[^>]+stylesheet/.test(html));
 assert(!/type="module"|import\.meta/.test(html));
 for(const match of html.matchAll(/<img[^>]+src="([^"]+)"/g))assert.match(match[1],/^data:image\//);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
 assert.equal(scripts.length,1);
 for(const script of scripts)assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/rel="manifest" href="\.\/manifest\.webmanifest"/);
 assert.match(html,/navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
 assert(Buffer.byteLength(html)<1024*1024,'preview HTML should stay below 1 MiB');
});
test('Android PWA build includes install metadata, icons, and offline cache',()=>{
 execFileSync(process.execPath,['scripts/build-standalone.cjs']);
 const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.orientation,'portrait-primary');
 assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
 assert.match(manifest.icons[1].purpose,/maskable/);
 for(const [file,size] of [['icon-192.png',192],['icon-512.png',512]]) {
  const icon=fs.readFileSync(`dist/icons/${file}`);
  assert.equal(icon.readUInt32BE(16),size);
  assert.equal(icon.readUInt32BE(20),size);
 }
 const worker=fs.readFileSync('dist/sw.js','utf8');
 assert.match(worker,/cache\.addAll\(APP_SHELL\)/);
 assert.match(worker,/request\.mode === 'navigate'/);
});

test('embedded preview contains every cat and player pose as valid WebP data',()=>{
 const data=JSON.parse(fs.readFileSync('assets/embedded.json','utf8'));
 assert.deepEqual(data.cats.map(frames=>frames.length),[7,5,5,10,5,7]);
 assert.equal(data.player.length,7);
 for(const url of [data.garden,...data.cats.flat(),...data.player]){
  assert.match(url,/^data:image\/webp;base64,/);
  const buf=Buffer.from(url.split(',')[1],'base64');
  assert.equal(buf.subarray(0,4).toString(),'RIFF');
  assert.equal(buf.subarray(8,12).toString(),'WEBP');
 }
});
