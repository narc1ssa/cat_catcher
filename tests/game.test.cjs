const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function game(fail = false, stored = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent:'', innerHTML:'', disabled:false, style:{}, dataset:{}, children:[], listeners:{}, attributes:{},
        appendChild(node){this.children.push(node)}, remove(){this.removed=true},
        classList:{add(name){classes.add(name)},remove(name){classes.delete(name)},toggle(name,force){if(force??!classes.has(name))classes.add(name);else classes.delete(name);return classes.has(name)},contains(name){return classes.has(name)}},
        setAttribute(name,value){this.attributes[name]=String(value)},
        addEventListener(name,callback){(this.listeners[name] ||= []).push(callback)},
        setPointerCapture(pointerId){this.capturedPointerId=pointerId},
        querySelector(){return element(id+'-span')}, getContext(){return {}}
      });
    }
    return elements.get(id);
  };
  const storage = new Map(Object.entries(stored));
  const context = vm.createContext({document:{getElementById:element,addEventListener(){},createElement(){return {style:{},dataset:{},remove(){this.removed=true}}}},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},URL, Image:class {get src(){return this._src}set src(v){this._src=v;this.complete=true;this.naturalWidth=100;queueMicrotask(()=>fail ? this.onerror() : this.onload())}},requestAnimationFrame(){},console});
  const manifest = fs.readFileSync('assets/animations/frames.js','utf8')
    .replace('export default', 'const catFrameURLs =')
    .replaceAll('import.meta.url', JSON.stringify('https://example.com/cat_catcher/assets/animations/frames.js'));
  const playerManifest = fs.readFileSync('assets/animations/player/frames.js','utf8')
    .replace('export default', 'const playerFrameURLs =')
    .replaceAll('import.meta.url', JSON.stringify('https://example.com/cat_catcher/assets/animations/player/frames.js'));
  const source = fs.readFileSync('game.js','utf8')
    .replace("import playerFrameURLs from './assets/animations/player/frames.js';", '')
    .replace("import catFrameURLs from './assets/animations/frames.js';", '')
    .replaceAll('import.meta.url', JSON.stringify('https://example.com/cat_catcher/game.js'));
  vm.runInContext(manifest + playerManifest + source, context);
  await new Promise(resolve=>setImmediate(resolve));
  return {run:code=>vm.runInContext(code,context),elements,storage};
}
test('assets load, start resets a round and arrows move the player within bounds', async()=>{
  const g=await game();assert.equal(g.run('state'),'ready');g.run('start(); keys.add("ArrowRight"); update(.2)');assert.equal(g.run('player'),338);g.run('update(20)');assert.equal(g.run('player'),435);
});
test('on-screen touch arrows hold movement and release cleanly',async()=>{
 const g=await game();
 const left=g.elements.get('left');
 const right=g.elements.get('right');
 g.run('start()');
 let prevented=false;
 const press=(button,pointerId)=>button.listeners.pointerdown[0]({pointerId,preventDefault(){prevented=true}});
 const release=(button,event,pointerId)=>button.listeners[event][0]({pointerId});
 press(left,1);press(left,2);
 assert.equal(prevented,true);
 assert.equal(left.capturedPointerId,2);
 assert.equal(left.classList.contains('is-pressed'),true);
 assert.equal(left.attributes['aria-pressed'],'true');
 assert.equal(g.run('keys.has("ArrowLeft")'),true);
 g.run('update(.1)');assert.equal(g.run('player'),236);
 release(left,'pointerup',1);
 assert.equal(g.run('keys.has("ArrowLeft")'),true);
 g.run('update(.1)');assert.equal(g.run('player'),202);
 release(left,'pointercancel',2);
 assert.equal(g.run('keys.has("ArrowLeft")'),false);
 assert.equal(left.classList.contains('is-pressed'),false);
 assert.equal(left.attributes['aria-pressed'],'false');
 press(right,3);g.run('update(.1)');assert.equal(g.run('player'),236);
 release(right,'pointerup',3);
 assert.equal(g.run('keys.has("ArrowRight")'),false);
});

test('catching awards ten points; misses remove lives and game ends',async()=>{
 const g=await game();g.run('start(); cats=[{x:W/2,y:CATCH_Y-1,speed:100}];update(.02)');assert.equal(g.run('score'),10);assert.equal(g.run('caught'),1);
 for(let i=0;i<3;i++) g.run('cats=[{x:0,y:H+50,speed:100}]; update(.02)');
 assert.equal(g.run('state'),'over');assert.equal(g.run('lives'),0);assert.equal(g.storage.get('cat-catcher-best'),'10');
 g.run('start()');assert.equal(g.run('score'),0);assert.equal(g.run('lives'),3);
});
test('pause freezes the round and resume continues it',async()=>{
 const g=await game();g.run('start();pause();update(2)');assert.equal(g.run('state'),'paused');assert.equal(g.run('elapsed'),0);g.run('resume();update(.1)');assert.equal(g.run('state'),'playing');assert.equal(g.run('elapsed'),.1);
});

test('image URLs resolve inside the repository subdirectory',async()=>{
 const g=await game();
 assert.equal(g.run('assetURLs.garden'), 'https://example.com/cat_catcher/assets/garden.jpg');
 assert.match(g.run('playerFrameURLs[0]'), /^data:image\/png;base64,/);
});
test('image errors leave a retry button available',async()=>{
 const g=await game(true);
 assert.equal(g.run('state'),'error');
 assert.equal(g.elements.get('start').disabled,false);
 assert.match(g.elements.get('start').innerHTML,/Повторить загрузку/);
});

test('all six cats animate through their frames and loop without a jump', async()=>{
 const g=await game();
 for(let type=0;type<6;type++) {
   const count=g.run(`CAT_ANIMATIONS[${type}].frames`);
   const fps=g.run(`CAT_ANIMATIONS[${type}].fps`);
   const sequence=[];
   for(let step=0;step<=2*(count-1);step++) sequence.push(g.run(`animationFrame(${type}, ${step+.01}/${fps})`));
   assert.equal(sequence[0],0);
   assert.equal(sequence[count-1],count-1);
   assert.equal(sequence.at(-1),0);
   assert.equal(new Set(sequence).size,count);
   for(let i=1;i<sequence.length;i++) assert.equal(Math.abs(sequence[i]-sequence[i-1]),1);
 }
});
test('each spawned cat has an animation clock which freezes on pause',async()=>{
 const g=await game();g.run('start(); spawn(); update(.1)');
 assert.equal(g.run('cats[0].age'),.1);
 g.run('pause(); update(1)');assert.equal(g.run('cats[0].age'),.1);
 g.run('resume(); update(.1)');assert.equal(g.run('cats[0].age'),.2);
});
test('sprite strips match their declared frame counts and cut frames exist',()=>{
 for(const [index,count] of [7,5,5,10,5,7].entries()) {
   const file=fs.readFileSync(`assets/animations/cat${index+1}.png`);
   assert.equal(file.readUInt32BE(16),count*192);
   assert.equal(file.readUInt32BE(20),192);
   for(let frame=0;frame<count;frame++) assert.ok(fs.existsSync(`assets/animations/cat${index+1}/${String(frame).padStart(2,'0')}.png`));
 }
});

test('rendering draws a different cut image as the falling cat ages',async()=>{
 const g=await game();
 g.run(`var drawCalls=[]; Object.assign(ctx,{save(){},restore(){},translate(){},rotate(){},drawImage(...args){drawCalls.push(args)}});
   drawCat(0,100,200,96,0); drawCat(0,100,200,96,.15);`);
 assert.equal(g.run('drawCalls[0][0] === catFrames[0][0]'),true);
 assert.equal(g.run('drawCalls[1][0] === catFrames[0][1]'),true);
 assert.equal(g.run('drawCalls[0][0] !== drawCalls[1][0]'),true);
 const catDimensions=JSON.parse(g.run('JSON.stringify(drawCalls[0].slice(1))'));
 assert.ok(catDimensions.every((value,index)=>Math.abs(value-[-67.2,-67.2,134.4,134.4][index])<1e-9));
});

test('cats and the player render 30% smaller in Canvas and DOM',async()=>{
 const g=await game();
 assert.equal(g.run('CAT_SIZE_MULTIPLIER'),1.4);
 assert.equal(g.run('PLAYER_SIZE_MULTIPLIER'),1.4);
 assert.equal(g.run('PLAYER_WIDTH'),358.4);
 assert.equal(g.run('PLAYER_HEIGHT'),376.32);
 g.run(`var sizeCalls=[];Object.assign(ctx,{save(){},restore(){},translate(){},rotate(){},scale(){},drawImage(...a){sizeCalls.push(a)}});
   drawCat(0,100,200,100,0);drawPlayer();`);
 assert.deepEqual(JSON.parse(g.run('JSON.stringify(sizeCalls[0].slice(1))')),[-70,-70,140,140]);
 assert.deepEqual(JSON.parse(g.run('JSON.stringify(sizeCalls[1].slice(1))')),[-179.2,-376.32,358.4,376.32]);
 const playerWidth=parseFloat(g.run("sceneNodes.get('player').style.width"));
 const previewCatWidth=parseFloat(g.run("sceneNodes.get('preview-0').style.width"));
 assert.ok(Math.abs(playerWidth-g.run('PLAYER_WIDTH')/540*100)<.001);
 assert.ok(Math.abs(previewCatWidth-105*g.run('CAT_SIZE_MULTIPLIER')/540*100)<.001);
});

test('actual update/draw loop changes the pose of every falling cat, and freezes on pause',async()=>{
 const g=await game();
 g.run(`var poses=[]; Object.assign(ctx,{
   save(){},restore(){},translate(){},rotate(){},clearRect(){},fillRect(){},beginPath(){},ellipse(){},fill(){},moveTo(){},lineTo(){},stroke(){},
   createLinearGradient(){return {addColorStop(){}}},
   drawImage(image){ for(let t=0;t<6;t++){ const f=catFrames[t].indexOf(image);if(f>=0)poses.push([t,f]); } }
 });
 start(); spawnIn=100;
 cats=Array.from({length:6},(_,type)=>({x:100+type*150,y:0,type,speed:100,phase:0,age:0,width:90}));
 draw(0); update(.15); draw(150);`);
 const poses=JSON.parse(g.run('JSON.stringify(poses)'));
 for(let type=0;type<6;type++) {
   assert.deepEqual(poses[type],[type,0]);
   assert.deepEqual(poses[type+6],[type,1]);
 }
 assert.equal(g.run('cats[0].y'),15);
 g.run('pause(); poses=[]; update(1); draw(1150)');
 assert.equal(g.run('cats[0].y'),15);
 assert.deepEqual(JSON.parse(g.run('JSON.stringify(poses)')),poses.slice(6));
});

test('each animation contains distinct PNG images and preloads every frame', async()=>{
 const { createHash }=require('node:crypto');
 const g=await game();
 for(const [type,count] of [7,5,5,10,5,7].entries()) {
   const hashes=[];
   for(let frame=0;frame<count;frame++) {
     const png=fs.readFileSync(`assets/animations/cat${type+1}/${String(frame).padStart(2,'0')}.png`);
     assert.equal(png.readUInt32BE(16),192);
     assert.equal(png.readUInt32BE(20),192);
     hashes.push(createHash('sha256').update(png).digest('hex'));
   }
   assert.equal(new Set(hashes).size,count);
   assert.equal(g.run(`catFrames[${type}].length`),count);
 }
});

test('player preloads seven distinct aligned poses from man_sprites',async()=>{
 const g=await game();
 assert.equal(g.run('playerFrames.length'),7);
 const {createHash}=require('node:crypto');
 const hashes=[];
 for(let i=0;i<7;i++) {
   const png=fs.readFileSync(`assets/animations/player/${String(i).padStart(2,'0')}.png`);
   assert.equal(png.readUInt32BE(16),320);
   assert.equal(png.readUInt32BE(20),336);
   hashes.push(createHash('sha256').update(png).digest('hex'));
 }
 assert.equal(new Set(hashes).size,7);
});
test('player cycles poses when moving and freezes on pause',async()=>{
 const g=await game();g.run('start(); keys.add("ArrowRight"); update(.02)');
 const first=g.run('playerFrame()');g.run('update(.15)');
 assert.notEqual(g.run('playerFrame()'),first);
 const pose=g.run('playerFrame()');g.run('pause();update(1)');
 assert.equal(g.run('playerFrame()'),pose);
 g.run('resume();keys.add("ArrowLeft");update(.1)');
 assert.equal(g.run('playerDirection'),-1);
});
test('catching triggers all seven glove poses then returns to idle',async()=>{
 const g=await game();g.run('start();spawnIn=100;cats=[{x:W/2,y:CATCH_Y-1,speed:100}];update(.02)');
 assert.equal(g.run('playerCatchAge'),0);
 const poses=[g.run('playerFrame()')];
 for(let i=0;i<6;i++){g.run('update(.101)');poses.push(g.run('playerFrame()'));}
 assert.deepEqual(poses,[1,2,3,4,5,6,0]);
 g.run('update(.11)');assert.equal(g.run('playerCatchAge'),-1);
});
test('player draw uses loaded animation frames and mirrors leftward movement',async()=>{
 const g=await game();
 g.run(`var playerDraws=[],mirrors=[];Object.assign(ctx,{save(){},restore(){},translate(){},scale(...a){mirrors.push(a)},drawImage(...a){playerDraws.push(a)}});
 start();keys.add('ArrowLeft');update(.16);drawPlayer();`);
 assert.equal(g.run('playerDraws[0][0] === playerFrames[playerFrame()]'),true);
 assert.equal(g.run('mirrors[0][0]'),-1);
});

test('all 46 sprite poses are embedded PNGs matching the cut files',async()=>{
 const g=await game();
 const cats=JSON.parse(g.run('JSON.stringify(catFrameURLs)'));
 const player=JSON.parse(g.run('JSON.stringify(playerFrameURLs)'));
 let count=0;
 for(const [type,urls] of cats.entries()) {
  for(const [frame,url] of urls.entries()) {
   assert.match(url,/^data:image\/png;base64,/);
   assert.deepEqual(Buffer.from(url.split(',')[1],'base64'),fs.readFileSync(`assets/animations/cat${type+1}/${String(frame).padStart(2,'0')}.png`));
   count++;
  }
 }
 for(const [frame,url] of player.entries()) {
  assert.match(url,/^data:image\/png;base64,/);
  assert.deepEqual(Buffer.from(url.split(',')[1],'base64'),fs.readFileSync(`assets/animations/player/${String(frame).padStart(2,'0')}.png`));
  count++;
 }
 assert.equal(count,46);
});
test('loading failure identifies the failing resource',async()=>{
 const g=await game(true);
 assert.match(g.elements.get('modal-description').textContent,/Не удалось загрузить: фон двора/);
 assert.equal(g.elements.get('start').disabled,false);
});

test('DOM rendering shows the player and falling cats without Canvas',async()=>{
 const g=await game();
 assert.ok(g.run("sceneNodes.has('player')"));
 g.run('start();spawnIn=100;cats=[{type:0,x:200,y:100,width:90,speed:100,age:0,phase:0}];renderScene(0)');
 const id=g.run('cats[0].domId');
 const before=g.run(`sceneNodes.get('${id}').style.top`);
 assert.equal(g.run(`sceneNodes.get('${id}').dataset.frame`),'0');
 g.run('update(.15);renderScene(150)');
 assert.notEqual(g.run(`sceneNodes.get('${id}').style.top`),before);
 assert.equal(g.run(`sceneNodes.get('${id}').dataset.frame`),'1');
 assert.match(g.run(`sceneNodes.get('${id}').src`),/^data:image\/png;base64,/);
 const pausedTop=g.run(`sceneNodes.get('${id}').style.top`);
 g.run('pause();update(.5);renderScene(650)');
 assert.equal(g.run(`sceneNodes.get('${id}').style.top`),pausedTop);
});

test('portrait world is 9:16 and catches cats above the player',async()=>{
 const g=await game();
 assert.equal(g.run('W / H'),9/16);
 assert.equal(g.run('CATCH_Y'),816);
 g.run('start()');assert.equal(g.run('player'),270);
 for(let i=0;i<30;i++)g.run('spawn()');
 assert.equal(g.run('cats.every(cat=>cat.x>=65 && cat.x<=W-65)'),true);
});

test('sound is on by default, so the mute button does not need a first tap',async()=>{
 const g=await game();
 g.run('window.setInterval=()=>1; window.clearInterval=()=>{};');
 assert.equal(g.run('muted'),false);
 assert.equal(g.elements.get('sound').attributes['aria-label'],'Выключить звук');
 assert.equal(g.elements.get('sound').attributes['aria-pressed'],'true');
 // SFX actually reach an AudioContext instead of being skipped as muted.
 g.run(`var played=0;
   window.AudioContext=class{
     constructor(){this.state='running';this.currentTime=0;this.destination={}}
     resume(){this.state='running';return Promise.resolve()}
     suspend(){this.state='suspended';return Promise.resolve()}
     createOscillator(){return {type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},value:0},connect(){},start(){played++},stop(){}}}
     createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){},value:0},connect(){}}}
     createBiquadFilter(){return {type:'',frequency:{value:0},Q:{value:1},connect(){}}}
   };
   start(); sound(720); playMeow(500);`);
 assert.ok(g.run('played')>=2);
 assert.ok(g.run('musicTimer')!==null);
 g.run('stopMusic()');
});

test('the sound button mutes the game and remembers the choice',async()=>{
 const g=await game();
 g.elements.get('sound').listeners.click[0]();
 assert.equal(g.run('muted'),true);
 assert.equal(g.elements.get('sound').attributes['aria-label'],'Включить звук');
 assert.equal(g.elements.get('sound').attributes['aria-pressed'],'false');
 assert.equal(g.storage.get('cat-catcher-muted'),'1');
 assert.equal(g.run('ensureAudio()'),null);
 g.elements.get('sound').listeners.click[0]();
 assert.equal(g.run('muted'),false);
 assert.equal(g.storage.get('cat-catcher-muted'),'0');
 assert.equal(g.elements.get('sound-game').attributes['aria-pressed'],'true');
});

test('a muted preference from a previous visit is restored',async()=>{
 const g=await game(false, {'cat-catcher-muted':'1'});
 assert.equal(g.run('muted'),true);
 assert.equal(g.elements.get('sound').attributes['aria-label'],'Включить звук');
 assert.equal(g.run('ensureAudio()'),null);
});

test('installed Android build keeps a sound switch inside the game HUD',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const css=fs.readFileSync('style.css','utf8');
 assert.match(html,/id="sound-game"[^>]*class="[^"]*sound-toggle/);
 assert.match(html,/id="sound"[^>]*class="[^"]*sound-toggle/);
 // Header is hidden in standalone mode, so the HUD button is the only control left.
 assert.match(css,/html\.is-standalone \.header,[\s\S]*?display:none/);
 assert.match(css,/#sound-game\{[^}]*pointer-events:auto/);
});
