const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function game(fail = false) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent:'', innerHTML:'', disabled:false, classList:{add(){},remove(){}}, setAttribute(){}, addEventListener(){}, querySelector(){return element(id+'-span')}, getContext(){return {}} });
    return elements.get(id);
  };
  const storage = new Map();
  const context = vm.createContext({document:{getElementById:element,addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URL, Image:class {set src(v){this.complete=true;this.naturalWidth=100;queueMicrotask(()=>fail ? this.onerror() : this.onload())}},requestAnimationFrame(){},console});
  vm.runInContext(fs.readFileSync('game.js','utf8').replaceAll('import.meta.url', JSON.stringify('https://example.com/cat_catcher/game.js')),context);
  await new Promise(resolve=>setImmediate(resolve));
  return {run:code=>vm.runInContext(code,context),elements,storage};
}
test('assets load, start resets a round and arrows move the player within bounds', async()=>{
  const g=await game();assert.equal(g.run('state'),'ready');g.run('start(); keys.add("ArrowRight"); update(.2)');assert.equal(g.run('player'),684);g.run('update(20)');assert.equal(g.run('player'),1055);
});
test('catching awards ten points; misses remove lives and game ends',async()=>{
 const g=await game();g.run('start(); cats=[{x:580,y:405,speed:100}];update(.02)');assert.equal(g.run('score'),10);assert.equal(g.run('caught'),1);
 for(let i=0;i<3;i++) g.run('cats=[{x:0,y:600,speed:100}]; update(.02)');
 assert.equal(g.run('state'),'over');assert.equal(g.run('lives'),0);assert.equal(g.storage.get('cat-catcher-best'),'10');
 g.run('start()');assert.equal(g.run('score'),0);assert.equal(g.run('lives'),3);
});
test('pause freezes the round and resume continues it',async()=>{
 const g=await game();g.run('start();pause();update(2)');assert.equal(g.run('state'),'paused');assert.equal(g.run('elapsed'),0);g.run('resume();update(.1)');assert.equal(g.run('state'),'playing');assert.equal(g.run('elapsed'),.1);
});

test('image URLs resolve inside the repository subdirectory',async()=>{
 const g=await game();
 assert.equal(g.run('assetURLs.garden'), 'https://example.com/cat_catcher/assets/garden.jpg');
 assert.equal(g.run('assetURLs.player'), 'https://example.com/cat_catcher/assets/player.png');
});
test('image errors leave a retry button available',async()=>{
 const g=await game(true);
 assert.equal(g.run('state'),'error');
 assert.equal(g.elements.get('start').disabled,false);
 assert.match(g.elements.get('start').innerHTML,/Повторить загрузку/);
});
