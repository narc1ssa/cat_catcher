// Resolve against the module, not the page URL. Vite bundles these files
// and rewrites their URLs, including deployments in a repository subdirectory.
const assetURLs = {
  garden: new URL('./assets/garden.jpg', import.meta.url).href,
  player: new URL('./assets/player.png', import.meta.url).href,
  cat0: new URL('./assets/cat0.png', import.meta.url).href,
  cat1: new URL('./assets/cat1.png', import.meta.url).href,
  cat2: new URL('./assets/cat2.png', import.meta.url).href,
  cat3: new URL('./assets/cat3.png', import.meta.url).href,
  cat4: new URL('./assets/cat4.png', import.meta.url).href,
  cat5: new URL('./assets/cat5.png', import.meta.url).href,
};
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const W = 1160, H = 550;
const images = {};
let state = 'loading', score = 0, caught = 0, lives = 3, elapsed = 0, spawnIn = .5;
let player = 720, cats = [], particles = [], previous = 0, best = 0, muted = true, audio;
const keys = new Set();
try { best = Number(localStorage.getItem('cat-catcher-best')) || 0; } catch {}
function updateRecord() { $('record').innerHTML = `${best} <small>очков</small>`; }
updateRecord();
function sound(frequency, duration = .12) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, audio.currentTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.5, audio.currentTime + duration);
    gain.gain.setValueAtTime(.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  } catch {}
}
$('sound').onclick = () => {
  muted = !muted;
  $('sound').querySelector('span').textContent = muted ? 'выкл.' : 'вкл.';
  $('sound').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  sound(520);
};
function hud() {
  $('caught').textContent = caught;
  $('score').textContent = score;
  $('lives').innerHTML = Array.from({length: 3}, (_, i) => `<span style="opacity:${i < lives ? 1 : .22}">♥</span>`).join(' ');
  $('lives').setAttribute('aria-label', `${lives} жизни`);
  $('level').textContent = `${elapsed < 20 ? 'Тихий двор' : 'Настоящий котопад'} · Уровень ${1 + Math.floor(elapsed / 20)}`;
}
function overlay(label, title, description, button) {
  $('modal-label').textContent = label;
  $('modal-title').innerHTML = title;
  $('modal-description').innerHTML = description;
  $('start').innerHTML = `${button} <span>→</span>`;
  $('overlay').classList.remove('hidden');
}
function start() {
  if (state === 'loading') return;
  if (state === 'error') { load(); return; }
  if (state === 'paused') { resume(); return; }
  score = caught = elapsed = 0; lives = 3; player = 580; cats = []; particles = []; spawnIn = .3;
  state = 'playing'; keys.clear();
  $('overlay').classList.add('hidden'); $('pause').disabled = false; $('pause').textContent = 'Ⅱ';
  $('pause').setAttribute('aria-label', 'Пауза'); $('floating-note').textContent = 'Каждому коту — мягкую посадку.';
  hud(); sound(440);
}
function resume() {
  state = 'playing'; keys.clear(); $('overlay').classList.add('hidden');
  $('pause').textContent = 'Ⅱ'; $('pause').setAttribute('aria-label', 'Пауза');
}
function pause() {
  if (state === 'playing') {
    state = 'paused'; keys.clear();
    overlay('МОЖНО ВЫДОХНУТЬ', 'Котопад<br>подождёт.', 'Коты зависли в воздухе.<br>Возвращайся, когда будешь готов.', 'Продолжить');
    $('pause').textContent = '▷'; $('pause').setAttribute('aria-label', 'Продолжить');
  } else if (state === 'paused') resume();
}
function finish() {
  state = 'over'; keys.clear(); $('pause').disabled = true;
  const record = score > best;
  if (record) { best = score; try { localStorage.setItem('cat-catcher-best', String(best)); } catch {} updateRecord(); }
  overlay(record ? 'НОВЫЙ ЛИЧНЫЙ РЕКОРД!' : 'СПАСИБО, ГЕРОЙ ДВОРА', `Спасено котов: ${caught}`, `Твой счёт — <b>${score}</b> очков.<br>Пушистые верят в тебя. Попробуем ещё?`, 'Играть ещё');
  sound(180, .3);
}
$('start').onclick = start;
$('pause').onclick = pause;
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && !e.repeat) { if (state === 'ready' || state === 'over') start(); else pause(); }
  if (e.code === 'Escape' && !e.repeat) pause();
  if (e.code === 'Enter' && !e.repeat && (state === 'ready' || state === 'over')) { e.preventDefault(); start(); }
  if (state === 'playing') keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
for (const [id, key] of [['left', 'ArrowLeft'], ['right', 'ArrowRight']]) {
  const button = $(id);
  button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); if (state === 'playing') keys.add(key); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => keys.delete(key));
}
function sprite(image, x, y, width, angle = 0) {
  if (!image?.complete || !image.naturalWidth) return;
  const height = width * image.height / image.width;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore();
}
function spawn() {
  const level = Math.floor(elapsed / 20);
  cats.push({x: 65 + Math.random() * (W - 130), y: -65, type: Math.floor(Math.random() * 6), speed: 94 + Math.min(level * 19, 125) + Math.random() * 25, phase: Math.random() * 6, width: 76 + Math.random() * 15});
  spawnIn = Math.max(.52, 1.45 - level * .14) + Math.random() * .3;
}
function update(dt) {
  if (state !== 'playing') return;
  elapsed += dt; spawnIn -= dt;
  const direction = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  player = Math.max(105, Math.min(W - 105, player + direction * 520 * dt));
  if (spawnIn <= 0) spawn();
  for (const cat of cats) {
    const oldY = cat.y; cat.y += cat.speed * dt;
    // Catch at glove height; swept collision prevents misses between frames.
    if (oldY < 406 && cat.y >= 406 && Math.abs(cat.x - player) < 97) {
      cat.done = true; caught++; score += 10;
      particles.push({x:cat.x,y:cat.y,text:'+10',life:1,color:'#fff8ce'});
      $('floating-note').textContent = ['Отличная работа!','Ещё один кот в безопасности.','Мягкая посадка!'][caught % 3];
      sound(540 + (caught % 5) * 90);
    } else if (cat.y > H + 45) {
      cat.done = true; lives--;
      particles.push({x:cat.x,y:H-60,text:'−1 ♥',life:1,color:'#ffdbc3'}); sound(150,.2);
      if (lives <= 0) { finish(); break; }
    }
  }
  cats = cats.filter(c => !c.done);
  for (const p of particles) { p.life -= dt; p.y -= dt * 45; }
  particles = particles.filter(p => p.life > 0);
  hud();
}
function draw(time) {
  ctx.clearRect(0,0,W,H);
  if (images.garden?.complete && images.garden.naturalWidth) ctx.drawImage(images.garden,0,0,W,H);
  const wash = ctx.createLinearGradient(0,0,0,H); wash.addColorStop(0,'rgba(186,218,204,.15)'); wash.addColorStop(1,'rgba(61,77,32,.09)'); ctx.fillStyle = wash; ctx.fillRect(0,0,W,H);
  if (state === 'ready' || state === 'loading') {
    sprite(images.cat0, 695 + Math.sin(time * .0007) * 12, 145 + Math.sin(time * .001) * 10, 91, -.12);
    sprite(images.cat2, 975 + Math.sin(time * .0009) * 10, 235 + Math.sin(time * .0013) * 9, 103, .15);
    sprite(images.cat3, 861, 67 + Math.sin(time * .0011) * 12, 80, -.15);
    sprite(images.cat1, 510, 90 + Math.sin(time * .0008) * 12, 73, .2);
  }
  // A soft grounding shadow keeps the transparent character in the scene.
  ctx.save(); ctx.fillStyle = '#29412235'; ctx.beginPath(); ctx.ellipse(player,544,100,15,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  sprite(images.player, player, 469, 221);
  for (const cat of cats) {
    ctx.strokeStyle='#ffffff35'; ctx.lineWidth=2;
    for (let i=0;i<3;i++) { ctx.beginPath();ctx.moveTo(cat.x-17+i*17,cat.y-60);ctx.lineTo(cat.x-17+i*17,cat.y-90);ctx.stroke(); }
    sprite(images[`cat${cat.type}`],cat.x,cat.y,cat.width,Math.sin(cat.phase + elapsed * 2)*.08);
  }
  for (const p of particles) { ctx.save(); ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.shadowColor='#334b24';ctx.shadowBlur=6;ctx.fillText(p.text,p.x,p.y);ctx.restore(); }
}
function frame(time) {
  const dt = Math.min((time - previous)/1000 || 0, .04); previous = time;
  update(dt); draw(time); requestAnimationFrame(frame);
}
async function load() {
  $('start').disabled = true;
  try {
    await Promise.all(Object.entries(assetURLs).map(([key,url]) => new Promise((resolve,reject) => {
      const image = new Image(); images[key] = image; image.onload=resolve;image.onerror=reject;image.src=url;
    })));
    state='ready'; $('start').disabled=false;
    overlay('ДОБРО ПОЖАЛОВАТЬ ВО ДВОР', 'Коты падают.<br>Ты — их надежда.', 'Надевай перчатки, занимай позицию.<br>Ни одного пушистого мимо!', 'Начать игру');
  } catch {
    state = 'error';
    overlay('ОШИБКА ЗАГРУЗКИ', 'Не удалось загрузить котов', 'Проверь подключение и попробуй ещё раз.', 'Повторить загрузку');
    $('start').disabled = false;
  }
}
requestAnimationFrame(frame);
load();
