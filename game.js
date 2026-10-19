import catFrameURLs from './assets/animations/frames.js';
import playerFrameURLs from './assets/animations/player/frames.js';

// Resolve against the module, not the page URL. Vite bundles these files
// and rewrites their URLs, including deployments in a repository subdirectory.
const assetURLs = {
  garden: new URL('./assets/garden.jpg', import.meta.url).href,
};
const $ = id => document.getElementById(id);
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof location !== 'undefined' && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
let deferredInstallPrompt = null;
const installButton = $('install');
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  try { await prompt.prompt(); await prompt.userChoice; } catch {}
  installButton.hidden = true;
});
const canvas = $('canvas');
let ctx;
try { ctx = canvas.getContext('2d'); } catch {} // Optional; gameplay uses DOM sprites.
const W = 540, H = 960;
const CAT_SIZE_MULTIPLIER = 1.4;
const PLAYER_SIZE_MULTIPLIER = 1.4;
const PLAYER_WIDTH = 256 * PLAYER_SIZE_MULTIPLIER;
const PLAYER_HEIGHT = 268.8 * PLAYER_SIZE_MULTIPLIER;
const CATCH_Y = H - 144;
const images = {};
const catFrames = catFrameURLs.map(() => []);
let playerFrames = [];
let playerDirection = 0, playerAnimationAge = 0, playerCatchAge = -1;
const PLAYER_CATCH_SEQUENCE = [1, 2, 3, 4, 5, 6, 0];
function playerFrame() {
  if (playerCatchAge >= 0) return PLAYER_CATCH_SEQUENCE[Math.min(6, Math.floor(playerCatchAge * 10))];
  if (playerDirection) return [0, 1, 2, 1][Math.floor(playerAnimationAge * 8) % 4];
  return [0, 6][Math.floor(playerAnimationAge * 2) % 2];
}
function drawPlayer() {
  const image = playerFrames[playerFrame()];
  if (!image?.complete || !image.naturalWidth) return;
  ctx.save(); ctx.translate(player, H);
  if (playerDirection < 0 && playerCatchAge < 0) ctx.scale(-1, 1);
  ctx.drawImage(image, -PLAYER_WIDTH / 2, -PLAYER_HEIGHT, PLAYER_WIDTH, PLAYER_HEIGHT);
  ctx.restore();
}
// Individual frames are cut from the supplied sprite lists by prepare_animation.py.
const CAT_ANIMATIONS = [
  { frames: 7, fps: 8 }, { frames: 5, fps: 8 },
  { frames: 5, fps: 8 }, { frames: 10, fps: 8 },
  { frames: 5, fps: 8 }, { frames: 7, fps: 8 },
];
function animationFrame(type, age, phase = 0) {
  const { frames, fps } = CAT_ANIMATIONS[type];
  // Ping-pong avoids a sudden jump between the last and first pose.
  const cycle = (frames - 1) * 2;
  const step = Math.floor(age * fps + phase) % cycle;
  return step < frames ? step : cycle - step;
}
function drawCat(type, x, y, width, age, phase = 0, angle = 0) {
  const frame = animationFrame(type, age, phase);
  const image = catFrames[type]?.[frame];
  if (!image?.complete || !image.naturalWidth) return;
  const size = width * CAT_SIZE_MULTIPLIER;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}
let state = 'loading', score = 0, caught = 0, lives = 3, elapsed = 0, spawnIn = .5;
let player = W * .62, cats = [], particles = [], previous = 0, best = 0, muted = true, audio;
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
  score = caught = elapsed = 0; lives = 3; player = W / 2; cats = []; particles = []; spawnIn = .3;
  state = 'playing'; keys.clear();
  playerDirection = 0; playerAnimationAge = 0; playerCatchAge = -1;
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
  const activePointers = new Set();
  const updatePressed = () => {
    const pressed = activePointers.size > 0;
    button.classList.toggle('is-pressed', pressed);
    button.setAttribute('aria-pressed', String(pressed));
    if (pressed && state === 'playing') keys.add(key);
    else keys.delete(key);
  };
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (state !== 'playing') return;
    activePointers.add(e.pointerId);
    try { button.setPointerCapture?.(e.pointerId); } catch {}
    updatePressed();
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(event, e => {
      activePointers.delete(e.pointerId);
      updatePressed();
    });
  }
  button.addEventListener('contextmenu', e => e.preventDefault());
}
function sprite(image, x, y, width, angle = 0) {
  if (!image?.complete || !image.naturalWidth) return;
  const height = width * image.height / image.width;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore();
}
function spawn() {
  const level = Math.floor(elapsed / 20);
  const width = 76 + Math.random() * 15;
  const visualWidth = width * 1.15 * CAT_SIZE_MULTIPLIER;
  const edgeMargin = Math.max(65, visualWidth / 2);
  cats.push({x: edgeMargin + Math.random() * (W - 2 * edgeMargin), y: -65, type: Math.floor(Math.random() * 6), speed: 180 + Math.min(level * 25, 170) + Math.random() * 35, phase: Math.floor(Math.random() * 12), age: 0, width});
  spawnIn = Math.max(.52, 1.45 - level * .14) + Math.random() * .3;
}
function update(dt) {
  if (state !== 'playing') return;
  elapsed += dt; spawnIn -= dt;
  const direction = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  playerDirection = direction;
  playerAnimationAge += dt;
  if (playerCatchAge >= 0) {
    playerCatchAge += dt;
    if (playerCatchAge >= PLAYER_CATCH_SEQUENCE.length / 10) playerCatchAge = -1;
  }
  player = Math.max(105, Math.min(W - 105, player + direction * 340 * dt));
  if (spawnIn <= 0) spawn();
  for (const cat of cats) {
    const oldY = cat.y; cat.y += cat.speed * dt; cat.age = (cat.age || 0) + dt;
    // Catch at glove height; swept collision prevents misses between frames.
    if (oldY < CATCH_Y && cat.y >= CATCH_Y && Math.abs(cat.x - player) < 97) {
      cat.done = true; caught++; score += 10; playerCatchAge = 0;
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
    drawCat(0, 695 + Math.sin(time * .0007) * 12, 145 + Math.sin(time * .001) * 10, 105, time / 1000, 0, -.12);
    drawCat(4, 975 + Math.sin(time * .0009) * 10, 235 + Math.sin(time * .0013) * 9, 115, time / 1000, 3, .15);
    drawCat(5, 861, 67 + Math.sin(time * .0011) * 12, 95, time / 1000, 5, -.15);
    drawCat(1, 510, 90 + Math.sin(time * .0008) * 12, 90, time / 1000, 2, .2);
  }
  // A soft grounding shadow keeps the transparent character in the scene.
  ctx.save(); ctx.fillStyle = '#29412235'; ctx.beginPath(); ctx.ellipse(player,544,100,15,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  drawPlayer();
  for (const cat of cats) {
    ctx.strokeStyle='#ffffff35'; ctx.lineWidth=2;
    for (let i=0;i<3;i++) { ctx.beginPath();ctx.moveTo(cat.x-17+i*17,cat.y-60);ctx.lineTo(cat.x-17+i*17,cat.y-90);ctx.stroke(); }
    drawCat(cat.type, cat.x, cat.y, cat.width * 1.15, cat.age, cat.phase, Math.sin(cat.phase + cat.age * 2) * .06);
  }
  for (const p of particles) { ctx.save(); ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.shadowColor='#334b24';ctx.shadowBlur=6;ctx.fillText(p.text,p.x,p.y);ctx.restore(); }
}
// No Canvas or requestAnimationFrame dependency in the live renderer.
const sceneNodes = new Map();
function renderScene(time) {
  const scene = $('scene');
  if (!scene || typeof document.createElement !== 'function') return;
  scene.dataset.state = state;
  scene.dataset.elapsed = String(elapsed);
  scene.dataset.direction = String(playerDirection);
  const visible = new Set();
  function imageNode(id, image, x, y, width, height, angle = 0, mirror = false, frame = 0) {
    if (!image?.complete || !image.naturalWidth) return;
    visible.add(id);
    let node = sceneNodes.get(id);
    if (!node) {
      node = document.createElement('img');
      node.className = 'scene-sprite'; node.alt = ''; node.draggable = false;
      node.dataset.sprite = id;
      scene.appendChild(node); sceneNodes.set(id, node);
    }
    if (node.src !== image.src) node.src = image.src;
    node.hidden = false; node.dataset.frame = String(frame);
    node.style.left = `${(x - width / 2) / W * 100}%`;
    node.style.top = `${(y - height / 2) / H * 100}%`;
    node.style.width = `${width / W * 100}%`;
    node.style.height = `${height / H * 100}%`;
    node.style.transform = `rotate(${angle}rad) scaleX(${mirror ? -1 : 1})`;
  }
  function catNode(id, type, x, y, width, age, phase = 0, angle = 0) {
    const frame = animationFrame(type, age, phase);
    const size = width * CAT_SIZE_MULTIPLIER;
    imageNode(id, catFrames[type]?.[frame], x, y, size, size, angle, false, frame);
  }
  if (state === 'ready') {
    catNode('preview-0', 0, W * .23, H * .23 + Math.sin(time / 1000) * 10, 105, time / 1000);
    catNode('preview-1', 4, W * .81, H * .44, 115, time / 1000, 3, .15);
    catNode('preview-2', 5, W * .71, H * .14, 95, time / 1000, 5, -.15);
    catNode('preview-3', 1, W * .18, H * .64, 90, time / 1000, 2, .2);
  }
  imageNode('player', playerFrames[playerFrame()], player, H - PLAYER_HEIGHT / 2, PLAYER_WIDTH, PLAYER_HEIGHT,
    0, playerDirection < 0 && playerCatchAge < 0, playerFrame());
  cats.forEach(cat => {
    cat.domId ||= `falling-${nextCatId++}`;
    catNode(cat.domId, cat.type, cat.x, cat.y, cat.width * 1.15, cat.age, cat.phase,
      Math.sin(cat.phase + cat.age * 2) * .06);
  });
  particles.forEach(p => {
    p.domId ||= `points-${nextCatId++}`;
    visible.add(p.domId);
    let node = sceneNodes.get(p.domId);
    if (!node) {
      node = document.createElement('span'); node.className = 'scene-points';
      node.textContent = p.text; scene.appendChild(node); sceneNodes.set(p.domId, node);
    }
    node.style.left = `${p.x / W * 100}%`; node.style.top = `${p.y / H * 100}%`;
    node.style.color = p.color; node.style.opacity = p.life;
  });
  for (const [id, node] of sceneNodes) {
    if (!visible.has(id)) { node.remove(); sceneNodes.delete(id); }
  }
}
let nextCatId = 0;
function tick(time) {
  const dt = Math.min(Math.max((time - previous) / 1000, 0), .1);
  previous = time;
  update(dt);
  renderScene(time);
}
async function load() {
  state = 'loading';
  $('start').disabled = true;
  overlay('ЗАГРУЗКА ИГРЫ', 'Готовим перчатки…', 'Загружаем фон и кадры персонажей.', 'Загрузка…');
  try {
    const loadImage = (url, label) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Не удалось загрузить: ${label}`));
      image.src = url;
    });
    // Preload every pose before starting: never fall back to one static image.
    await Promise.all([
      ...Object.entries(assetURLs).map(async ([key, url]) => { images[key] = await loadImage(url, key === 'garden' ? 'фон двора' : key); }),
      (async () => { playerFrames = await Promise.all(playerFrameURLs.map((url, frame) => loadImage(url, `игрок, кадр ${frame + 1}`))); })(),
      ...catFrameURLs.map(async (urls, type) => {
        catFrames[type] = await Promise.all(urls.map((url, frame) => loadImage(url, `кот ${type + 1}, кадр ${frame + 1}`)));
      }),
    ]);
    state='ready'; $('start').disabled=false;
    $('build-status').textContent = 'v1.6.0 · 9:16 · 46/46 кадров готовы';
    overlay('ДОБРО ПОЖАЛОВАТЬ ВО ДВОР', 'Коты падают.<br>Ты — их надежда.', 'Надевай перчатки, занимай позицию.<br>Ни одного пушистого мимо!', 'Начать игру');
    renderScene(0);
  } catch (error) {
    state = 'error';
    $('build-status').textContent = 'v1.6.0 · 9:16 · Ошибка загрузки';
    overlay('ОШИБКА ЗАГРУЗКИ', 'Не удалось загрузить игру', '', 'Повторить загрузку');
    $('modal-description').textContent = `${error.message}. Нажми «Повторить загрузку».`;
    $('start').disabled = false;
  }
}
// Timer also advances in embedded previews where animation frames may be suspended.
if (typeof window.setInterval === 'function') {
  previous = performance.now();
  window.setInterval(() => tick(performance.now()), 1000 / 60);
}
load();
