// Thin client: this file does NOT simulate anything. It only renders
// whatever world state the backend broadcasts over the WebSocket, so
// every visitor is looking at the exact same living population.

const WORLD_W = 1200;
const WORLD_H = 800;

const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');

function resize() {
  const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  canvas.width = WORLD_W * scale;
  canvas.height = WORLD_H * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let latest = null;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocol}://${location.host}`);

  ws.onopen = () => {
    hud.textContent = 'Połączono z ekosystemem';
  };
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'world') latest = data;
  };
  ws.onclose = () => {
    hud.textContent = 'Rozłączono — próba ponownego połączenia za 2s…';
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}
connect();

function draw() {
  requestAnimationFrame(draw);
  if (!latest) return;

  ctx.fillStyle = '#173a24';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  ctx.fillStyle = '#8fd14f';
  for (const f of latest.food) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const c of latest.creatures) {
    ctx.fillStyle = `hsl(${c.color}, 70%, 60%)`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  hud.textContent =
    `Tick ${latest.tick} · Populacja ${latest.creatures.length} · ` +
    `Najlepsza generacja ${latest.stats.bestGeneration} · ` +
    `Urodzeni ${latest.stats.totalBorn} · Zmarli ${latest.stats.totalDied}`;
}
draw();
