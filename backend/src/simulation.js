// The living world: creatures, food, and the tick loop. This runs
// continuously on the server regardless of how many viewers are
// connected — the world is persistent and shared, not per-browser.

const { randomGenome, mutate, forward } = require('./neuralNet');

const WORLD_W = 1200;
const WORLD_H = 800;
const START_POPULATION = 30;
const START_ENERGY = 60;
const MAX_FOOD = 60;
// Enough of a head start that generation zero isn't starving in an
// empty world, but not so much that the population booms past what
// the ongoing food-spawn rate can sustain and then crashes correcting
// for it. ~40% of the cap approaches the steady state gently instead
// of overshooting it.
const INITIAL_FOOD = Math.round(MAX_FOOD * 0.4);
const FOOD_SPAWN_CHANCE = 0.1; // probability per tick
const ENERGY_DECAY = 0.1;
const EAT_ENERGY = 30;
const REPRODUCE_THRESHOLD = 70;
const REPRODUCE_COST = 40;
// A creature above threshold reproduces with this probability *per tick*
// rather than the instant it crosses the line. Without this, an entire
// cohort that started at the same energy crosses the threshold on the
// same tick, reproduces in lockstep, and their children do the same a
// generation later — a synchronized boom-then-bust oscillation. Spreading
// the roll out over time turns that into a smooth, continuous trickle.
const REPRODUCE_CHANCE = 0.15;
const MAX_SPEED = 2.2;
const MAX_POPULATION = 150;
const MIN_POPULATION = 12;
const EAT_RADIUS = 16;

let nextId = 1;

function randomPosition() {
  return { x: Math.random() * WORLD_W, y: Math.random() * WORLD_H };
}

function newCreature(genome, x, y, generation) {
  return {
    id: nextId++,
    x,
    y,
    // +/-15 jitter so a whole cohort doesn't hit the reproduce/starve
    // thresholds on the same tick and lurch through life in lockstep.
    energy: START_ENERGY + (Math.random() * 30 - 15),
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
  // Seed food up front. Random, un-evolved brains are little better than
  // aimless wanderers, so an empty world that only fills up gradually
  // starves most of generation zero before selection ever gets a say.
  const food = [];
  for (let i = 0; i < INITIAL_FOOD; i++) {
    const pos = randomPosition();
    food.push({ id: nextId++, x: pos.x, y: pos.y });
  }
  return {
    tick: 0,
    creatures,
    food,
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
      Math.random() < REPRODUCE_CHANCE &&
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

  // Ecological rescue effect: gen-zero brains are random, so most early
  // lineages are bad at this and a thin population is one unlucky patch
  // away from silently dying out for good — which would also end any
  // chance of a better lineage ever emerging. Real metapopulations avoid
  // this via immigration; here that means topping up with a few more
  // fresh, unrelated genomes instead of waiting for a hard zero.
  while (world.creatures.length < MIN_POPULATION) {
    const pos = randomPosition();
    world.creatures.push(newCreature(randomGenome(), pos.x, pos.y, 0));
  }

  return world;
}

function serializeWorld(world) {
  return {
    tick: world.tick,
    stats: world.stats,
    food: world.food.map((f) => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y) })),
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
