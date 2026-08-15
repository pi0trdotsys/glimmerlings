// The living world: creatures, food, and the tick loop. This runs
// continuously on the server regardless of how many viewers are
// connected — the world is persistent and shared, not per-browser.

const { randomGenome, mutate, forward } = require('./neuralNet');

const WORLD_W = 1200;
const WORLD_H = 800;
const START_POPULATION = 30;
const MAX_FOOD = 60;
const FOOD_SPAWN_CHANCE = 0.08; // probability per tick
const ENERGY_DECAY = 0.15;
const EAT_ENERGY = 30;
const REPRODUCE_THRESHOLD = 80;
const REPRODUCE_COST = 50;
const MAX_SPEED = 2.2;
const MAX_POPULATION = 150;
const EAT_RADIUS = 12;

let nextId = 1;

function randomPosition() {
  return { x: Math.random() * WORLD_W, y: Math.random() * WORLD_H };
}

function newCreature(genome, x, y, generation) {
  return {
    id: nextId++,
    x,
    y,
    energy: 50,
    age: 0,
    generation,
    genome,
    color: Math.floor(Math.random() * 360),
  };
}

function createWorld() {
  const creatures = [];
  for (let i = 0; i < START_POPULATION; i++) {
    const pos = randomPosition();
    creatures.push(newCreature(randomGenome(), pos.x, pos.y, 0));
  }
  return {
    tick: 0,
    creatures,
    food: [],
    stats: { totalBorn: creatures.length, totalDied: 0, bestGeneration: 0 },
  };
}

// After loading a snapshot, make sure new ids don't collide with old ones.
function restoreIdCounter(creatures) {
  let maxId = 0;
  for (const c of creatures) maxId = Math.max(maxId, c.id);
  nextId = maxId + 1;
}

function nearestFood(creature, food) {
  let best = null;
  let bestDist = Infinity;
  for (const f of food) {
    const d = Math.hypot(f.x - creature.x, f.y - creature.y);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

function nearestCreature(creature, creatures) {
  let best = null;
  let bestDist = Infinity;
  for (const c of creatures) {
    if (c.id === creature.id) continue;
    const d = Math.hypot(c.x - creature.x, c.y - creature.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function stepCreature(creature, world) {
  const food = nearestFood(creature, world.food);
  const nearC = nearestCreature(creature, world.creatures);

  const inputs = new Float32Array(8);
  if (food) {
    inputs[0] = (food.x - creature.x) / WORLD_W;
    inputs[1] = (food.y - creature.y) / WORLD_H;
    inputs[2] = Math.hypot(food.x - creature.x, food.y - creature.y) / WORLD_W;
  }
  inputs[3] = creature.energy / 100;
  if (nearC) {
    inputs[4] = (nearC.x - creature.x) / WORLD_W;
    inputs[5] = (nearC.y - creature.y) / WORLD_H;
    inputs[6] = Math.hypot(nearC.x - creature.x, nearC.y - creature.y) / WORLD_W;
  }
  inputs[7] = 1; // bias input

  const out = forward(creature.genome, inputs);
  creature.x = Math.max(0, Math.min(WORLD_W, creature.x + out[0] * MAX_SPEED));
  creature.y = Math.max(0, Math.min(WORLD_H, creature.y + out[1] * MAX_SPEED));

  creature.energy -= ENERGY_DECAY;
  creature.age += 1;

  for (let i = world.food.length - 1; i >= 0; i--) {
    const f = world.food[i];
    if (Math.hypot(f.x - creature.x, f.y - creature.y) < EAT_RADIUS) {
      creature.energy = Math.min(120, creature.energy + EAT_ENERGY);
      world.food.splice(i, 1);
    }
  }
}

function tick(world) {
  world.tick += 1;

  if (world.food.length < MAX_FOOD && Math.random() < FOOD_SPAWN_CHANCE) {
    const pos = randomPosition();
    world.food.push({ id: nextId++, x: pos.x, y: pos.y });
  }

  const children = [];
  for (const creature of world.creatures) {
    stepCreature(creature, world);

    if (
      creature.energy >= REPRODUCE_THRESHOLD &&
      world.creatures.length + children.length < MAX_POPULATION
    ) {
      creature.energy -= REPRODUCE_COST;
      const childGenome = mutate(creature.genome);
      children.push(newCreature(childGenome, creature.x, creature.y, creature.generation + 1));
      world.stats.totalBorn += 1;
      world.stats.bestGeneration = Math.max(world.stats.bestGeneration, creature.generation + 1);
    }
  }

  const survivors = world.creatures.filter((c) => c.energy > 0);
  world.stats.totalDied += world.creatures.length - survivors.length;
  world.creatures = survivors.concat(children);

  // Never let the population go fully extinct — reseed if it does.
  if (world.creatures.length === 0) {
    for (let i = 0; i < 10; i++) {
      const pos = randomPosition();
      world.creatures.push(newCreature(randomGenome(), pos.x, pos.y, 0));
    }
  }

  return world;
}

function serializeWorld(world) {
  return {
    tick: world.tick,
    stats: world.stats,
    food: world.food.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y) })),
    creatures: world.creatures.map((c) => ({
      id: c.id,
      x: Math.round(c.x),
      y: Math.round(c.y),
      energy: Math.round(c.energy),
      age: c.age,
      generation: c.generation,
      color: c.color,
    })),
  };
}

module.exports = {
  createWorld,
  restoreIdCounter,
  tick,
  serializeWorld,
  WORLD_W,
  WORLD_H,
};
