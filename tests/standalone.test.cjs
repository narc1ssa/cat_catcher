const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
test('standalone build has no external scripts, styles, images or module imports',()=>{
 execFileSync(process.execPath,['scripts/build-standalone.cjs']);
 const html=fs.readFileSync('dist/index.html','utf8');
 assert(!/<script[^>]+src=/.test(html));
 assert(!/<link[^>]+stylesheet/.test(html));
 assert(!/type="module"|import\.meta/.test(html));
 for(const match of html.matchAll(/<img[^>]+src="([^"]+)"/g))assert.match(match[1],/^data:image\//);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 assert.doesNotThrow(()=>new vm.Script(script));
 assert(Buffer.byteLength(html)<1024*1024,'preview HTML should stay below 1 MiB');
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
