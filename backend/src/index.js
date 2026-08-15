require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const db = require('./db');
const sim = require('./simulation');
const nn = require('./neuralNet');

const PORT = process.env.PORT || 8080;
const TICK_MS = 120;
const SNAPSHOT_INTERVAL_MS = 30_000;

async function main() {
  await db.init();

  let world = await db.loadSnapshot();
  if (world) {
    console.log(`Loaded snapshot: tick ${world.tick}, ${world.creatures.length} creatures alive`);
    sim.restoreIdCounter(world.creatures);
  } else {
    console.log('No snapshot found — starting a fresh world');
    world = sim.createWorld();
  }

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'frontend')));
  app.get('/health', (_req, res) =>
    res.json({ ok: true, tick: world.tick, population: world.creatures.length })
  );

  // Static architecture/parameter info for the frontend's technical
  // panel. Fetched once on page load, not per tick — this doesn't
  // change while the process is running.
  app.get('/config', (_req, res) =>
    res.json({
      tickIntervalMs: TICK_MS,
      network: {
        inputs: nn.INPUT_SIZE,
        hidden: nn.HIDDEN_SIZE,
        outputs: nn.OUTPUT_SIZE,
        genomeSize: nn.genomeSize(),
        mutationRate: nn.MUTATION_RATE,
        mutationStrength: nn.MUTATION_STRENGTH,
      },
      ...sim.getConfig(),
    })
  );

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  function broadcast(payload) {
    const msg = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'world', ...sim.serializeWorld(world) }));
  });

  setInterval(() => {
    world = sim.tick(world);
    broadcast({ type: 'world', ...sim.serializeWorld(world) });
  }, TICK_MS);

  const snapshotTimer = setInterval(() => {
    db.saveSnapshot(world).catch((err) => console.error('Snapshot save failed:', err));
  }, SNAPSHOT_INTERVAL_MS);

  async function shutdown(signal) {
    console.log(`Received ${signal}, saving final snapshot before exit...`);
    clearInterval(snapshotTimer);
    try {
      await db.saveSnapshot(world);
      console.log('Snapshot saved.');
    } catch (err) {
      console.error('Failed to save snapshot on shutdown:', err);
    }
    process.exit(0);
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => console.log(`Glimmerlings backend listening on :${PORT}`));
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
