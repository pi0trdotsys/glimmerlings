// Thin client: this file does NOT simulate anything. It only renders
// whatever world state the backend broadcasts over the WebSocket, so
// every visitor is looking at the exact same living population.

const WORLD_W = 1200;
const WORLD_H = 800;

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Ticks are broadcast every TICK_MS on the backend (see backend/src/index.js).
// Used only to render a "world age" clock — an approximation, not a
// precise wall-clock measurement.
const TICK_MS = 120;

const el = {
  status: document.getElementById('s-status'),
  tick: document.getElementById('s-tick'),
  pop: document.getElementById('s-pop'),
  food: document.getElementById('s-food'),
  bestGen: document.getElementById('s-bestgen'),
  avgGen: document.getElementById('s-avggen'),
  avgEnergy: document.getElementById('s-avgenergy'),
  avgAge: document.getElementById('s-avgage'),
  born: document.getElementById('s-born'),
  died: document.getElementById('s-died'),
  uptime: document.getElementById('s-uptime'),
};
const popChart = document.getElementById('pop-chart');
const popChartCtx = popChart.getContext('2d');

function resize() {
  const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  canvas.width = WORLD_W * scale;
  canvas.height = WORLD_H * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// --- Deterministic PRNG so the decorative meadow layout is stable
// across reloads without needing Math.random() (and without the
// server having to send static scenery over the wire). ---
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Static background: tiled meadow + scattered props, painted once
// into an offscreen canvas and blitted every frame instead of being
// redrawn pixel-by-pixel. ---
const bgCanvas = document.createElement('canvas');
bgCanvas.width = WORLD_W;
bgCanvas.height = WORLD_H;
const bg = bgCanvas.getContext('2d');

function buildBackground() {
  const rand = mulberry32(1337);
  const TILE = 20;
  for (let y = 0; y < WORLD_H; y += TILE) {
    for (let x = 0; x < WORLD_W; x += TILE) {
      const lightness = 16 + Math.floor(rand() * 4) * 2;
      bg.fillStyle = `hsl(130, 38%, ${lightness}%)`;
      bg.fillRect(x, y, TILE, TILE);
      // sparse grass-blade texture
      if (rand() < 0.25) {
        bg.fillStyle = `hsl(115, 45%, ${lightness + 12}%)`;
        bg.fillRect(x + Math.floor(rand() * TILE), y + Math.floor(rand() * TILE), 2, 5);
      }
    }
  }

  for (let i = 0; i < 26; i++) {
    const x = rand() * WORLD_W;
    const y = rand() * WORLD_H;
    const kind = rand();
    if (kind < 0.45) drawBush(x, y, rand);
    else if (kind < 0.75) drawRock(x, y, rand);
    else drawTree(x, y, rand);
  }
}

function drawBush(x, y, rand) {
  const hue = 110 + rand() * 20;
  for (let i = 0; i < 5; i++) {
    bg.fillStyle = `hsl(${hue}, 40%, ${22 + rand() * 8}%)`;
    bg.beginPath();
    bg.arc(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 8, 5 + rand() * 3, 0, Math.PI * 2);
    bg.fill();
  }
}

function drawRock(x, y, rand) {
  const w = 10 + rand() * 8;
  bg.fillStyle = `hsl(200, 8%, ${28 + rand() * 6}%)`;
  bg.fillRect(x - w / 2, y - w / 3, w, w * 0.6);
  bg.fillStyle = `hsl(200, 8%, ${36 + rand() * 6}%)`;
  bg.fillRect(x - w / 2, y - w / 3, w, 2);
}

function drawTree(x, y, rand) {
  bg.fillStyle = 'hsl(25, 30%, 20%)';
  bg.fillRect(x - 2, y - 4, 4, 16);
  const hue = 120 + rand() * 15;
  bg.fillStyle = `hsl(${hue}, 35%, 20%)`;
  bg.beginPath();
  bg.arc(x, y - 12, 12, 0, Math.PI * 2);
  bg.fill();
  bg.fillStyle = `hsl(${hue}, 35%, 26%)`;
  bg.beginPath();
  bg.arc(x - 4, y - 16, 8, 0, Math.PI * 2);
  bg.fill();
}
buildBackground();

// --- Creature sprite: a small hand-authored pixel grid. Not a copy of
// any specific character design — just a generic pixel-art critter
// with cat-like ears and big eyes, in the spirit of the little digital
// beings from Black Mirror's "Plaything" (S07E04). ---
// . = transparent, B = body, W = eye white, P = pupil
const SPRITE = [
  '..B...B..',
  '.BBB.BBB.',
  '.BBBBBBB.',
  'BBBBBBBBB',
  'BBWBBBWBB',
  'BBPBBBPBB',
  'BBBBBBBBB',
  '.BBBBBBB.',
  '..BBBBB..',
];
const PIXEL = 3;
const SPRITE_W = SPRITE[0].length * PIXEL;
const SPRITE_H = SPRITE.length * PIXEL;

function drawCreature(c, bobOffset) {
  const x = c.x - SPRITE_W / 2;
  const y = c.y - SPRITE_H / 2 + bobOffset;

  // Individual variation stays inside a warm gold-to-amber range so the
  // population still reads as one species, the way Thronglets do —
  // genetic drift shows up as hue drift, not a different creature.
  const hue = 42 + (c.color / 360) * 26;

  // soft ground shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + SPRITE_H / 2 - 1, SPRITE_W / 2.4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let row = 0; row < SPRITE.length; row++) {
    for (let col = 0; col < SPRITE[row].length; col++) {
      const cell = SPRITE[row][col];
      if (cell === '.') continue;
      if (cell === 'B') ctx.fillStyle = `hsl(${hue}, 85%, 62%)`;
      else if (cell === 'W') ctx.fillStyle = '#fdfdf6';
      else if (cell === 'P') ctx.fillStyle = '#231a10';
      ctx.fillRect(x + col * PIXEL, y + row * PIXEL, PIXEL, PIXEL);
    }
  }
}

function drawFood(f) {
  const isBerry = f.id % 2 === 0;
  if (isBerry) {
    ctx.fillStyle = '#c23b3b';
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      ctx.fillRect(f.x + dx - 1, f.y + dy - 1, 3, 3);
    }
    ctx.fillStyle = '#3f8a3f';
    ctx.fillRect(f.x - 1, f.y - 5, 2, 3);
  } else {
    ctx.fillStyle = '#e3d2a3';
    ctx.fillRect(f.x - 1, f.y - 1, 2, 5);
    ctx.fillStyle = '#b5473f';
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 3, 4, 3, 0, Math.PI, 0);
    ctx.fill();
  }
}

// --- Ephemeral mood bubbles, derived purely client-side from state
// deltas between frames: newborn sparkle, just-ate heart, hungry flag.
const previousEnergy = new Map();
const previousIds = new Set();
const moodFx = new Map(); // id -> { emoji, until }

function updateMoods(creatures) {
  const now = performance.now();
  const currentIds = new Set();

  for (const c of creatures) {
    currentIds.add(c.id);
    const prev = previousEnergy.get(c.id);

    if (prev === undefined) {
      moodFx.set(c.id, { emoji: '✨', until: now + 1400 });
    } else if (c.energy - prev >= 15) {
      moodFx.set(c.id, { emoji: '❤️', until: now + 1100 });
    }
    previousEnergy.set(c.id, c.energy);
  }

  // Forget creatures that are no longer alive, so these maps never
  // grow unbounded across a 24/7 runtime.
  for (const id of previousIds) {
    if (!currentIds.has(id)) {
      previousEnergy.delete(id);
      moodFx.delete(id);
    }
  }
  previousIds.clear();
  for (const id of currentIds) previousIds.add(id);
}

function drawMood(c) {
  const now = performance.now();
  const fx = moodFx.get(c.id);
  let emoji = null;
  if (fx && fx.until > now) emoji = fx.emoji;
  else if (c.energy < 25) emoji = '🍎';

  if (!emoji) return;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(emoji, c.x, c.y - SPRITE_H / 2 - 4);
}

let latest = null;

// Rolling population history, sampled once per incoming tick (not per
// animation frame) so the sparkline's time axis tracks simulated time
// rather than the viewer's frame rate. ~1500 samples at 120ms/tick is
// roughly a 3-minute window.
const POP_HISTORY_MAX = 1500;
const popHistory = [];

function formatWorldAge(tick) {
  const totalSeconds = Math.floor((tick * TICK_MS) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}`);

  ws.onopen = () => {
    el.status.textContent = 'connected';
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'world') {
      updateMoods(data.creatures);
      latest = data;

      popHistory.push(data.creatures.length);
      if (popHistory.length > POP_HISTORY_MAX) popHistory.shift();
    }
  };
  ws.onclose = () => {
    el.status.textContent = 'disconnected — retrying in 2s…';
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}
connect();

function drawPopChart() {
  const w = popChart.width;
  const h = popChart.height;
  popChartCtx.clearRect(0, 0, w, h);
  if (popHistory.length < 2) return;

  const max = Math.max(...popHistory, 1);
  const min = Math.min(...popHistory, 0);
  const range = Math.max(max - min, 1);
  const step = w / (POP_HISTORY_MAX - 1);
  const offset = POP_HISTORY_MAX - popHistory.length;

  popChartCtx.beginPath();
  popHistory.forEach((v, i) => {
    const x = (offset + i) * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    if (i === 0) popChartCtx.moveTo(x, y);
    else popChartCtx.lineTo(x, y);
  });
  popChartCtx.strokeStyle = '#3ddc84';
  popChartCtx.lineWidth = 1.5;
  popChartCtx.stroke();

  popChartCtx.lineTo((offset + popHistory.length - 1) * step, h);
  popChartCtx.lineTo(offset * step, h);
  popChartCtx.closePath();
  popChartCtx.fillStyle = 'rgba(61, 220, 132, 0.12)';
  popChartCtx.fill();
}

function updateStats() {
  const creatures = latest.creatures;
  const n = creatures.length || 1;
  const avgEnergy = creatures.reduce((sum, c) => sum + c.energy, 0) / n;
  const avgAge = creatures.reduce((sum, c) => sum + c.age, 0) / n;
  const avgGen = creatures.reduce((sum, c) => sum + c.generation, 0) / n;

  el.status.textContent = 'connected';
  el.tick.textContent = latest.tick;
  el.pop.textContent = latest.creatures.length;
  el.food.textContent = latest.food.length;
  el.bestGen.textContent = latest.stats.bestGeneration;
  el.avgGen.textContent = avgGen.toFixed(1);
  el.avgEnergy.textContent = Math.round(avgEnergy);
  el.avgAge.textContent = Math.round(avgAge);
  el.born.textContent = latest.stats.totalBorn;
  el.died.textContent = latest.stats.totalDied;
  el.uptime.textContent = formatWorldAge(latest.tick);
}

function draw(timestamp) {
  requestAnimationFrame(draw);
  if (!latest) return;

  ctx.drawImage(bgCanvas, 0, 0);

  for (const f of latest.food) drawFood(f);

  for (const c of latest.creatures) {
    const bob = Math.sin(timestamp / 400 + c.id) * 1.4;
    drawCreature(c, bob);
    drawMood(c);
  }

  updateStats();
  drawPopChart();
}
requestAnimationFrame(draw);
