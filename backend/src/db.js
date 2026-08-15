// Persistence: periodic snapshots of the live population to Postgres,
// so a container restart or a ThinkCentre reboot doesn't erase evolution.

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS world_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      tick BIGINT NOT NULL DEFAULT 0,
      total_born BIGINT NOT NULL DEFAULT 0,
      total_died BIGINT NOT NULL DEFAULT 0,
      best_generation INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creatures (
      id BIGINT PRIMARY KEY,
      x REAL NOT NULL,
      y REAL NOT NULL,
      energy REAL NOT NULL,
      age INTEGER NOT NULL,
      generation INTEGER NOT NULL,
      color REAL NOT NULL,
      genome JSONB NOT NULL
    );
  `);
}

async function saveSnapshot(world) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE creatures');
    for (const c of world.creatures) {
      await client.query(
        `INSERT INTO creatures (id, x, y, energy, age, generation, color, genome)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [c.id, c.x, c.y, c.energy, c.age, c.generation, c.color, JSON.stringify(Array.from(c.genome))]
      );
    }
    await client.query(
      `INSERT INTO world_meta (id, tick, total_born, total_died, best_generation, updated_at)
       VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET
         tick = $1, total_born = $2, total_died = $3, best_generation = $4, updated_at = now()`,
      [world.tick, world.stats.totalBorn, world.stats.totalDied, world.stats.bestGeneration]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loadSnapshot() {
  const meta = await pool.query('SELECT * FROM world_meta WHERE id = 1');
  if (meta.rows.length === 0) return null;

  const creaturesRes = await pool.query('SELECT * FROM creatures');
  if (creaturesRes.rows.length === 0) return null;

  return {
    tick: Number(meta.rows[0].tick),
    stats: {
      totalBorn: Number(meta.rows[0].total_born),
      totalDied: Number(meta.rows[0].total_died),
      bestGeneration: meta.rows[0].best_generation,
    },
    food: [],
    creatures: creaturesRes.rows.map((r) => ({
      id: Number(r.id),
      x: r.x,
      y: r.y,
      energy: r.energy,
      age: r.age,
      generation: r.generation,
      color: r.color,
      genome: Float32Array.from(r.genome),
    })),
  };
}

module.exports = { pool, init, saveSnapshot, loadSnapshot };
