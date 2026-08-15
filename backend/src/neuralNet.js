// Tiny feedforward neural network used as each creature's "brain".
// The weight array IS the genome: no hand-coded behavior rules here —
// movement and reproduction decisions all come out of the network, and
// the network only gets better across generations because mutated
// genomes that survive get to reproduce (neuroevolution, not gradient RL).

const INPUT_SIZE = 8;
const HIDDEN_SIZE = 6;
const OUTPUT_SIZE = 2; // [moveX, moveY], both in [-1, 1]

function genomeSize() {
  return INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE + HIDDEN_SIZE * OUTPUT_SIZE + OUTPUT_SIZE;
}

function randomGenome() {
  const size = genomeSize();
  const genome = new Float32Array(size);
  for (let i = 0; i < size; i++) genome[i] = Math.random() * 2 - 1;
  return genome;
}

// Mutation is the only source of variation for now (asexual reproduction).
// MUTATION_RATE = probability each weight gets nudged, MUTATION_STRENGTH =
// max nudge size. Named constants (rather than bare defaults) so the
// technical panel on the frontend can report the real values via /config.
const MUTATION_RATE = 0.12;
const MUTATION_STRENGTH = 0.4;

function mutate(genome, rate = MUTATION_RATE, strength = MUTATION_STRENGTH) {
  const child = Float32Array.from(genome);
  for (let i = 0; i < child.length; i++) {
    if (Math.random() < rate) {
      child[i] += (Math.random() * 2 - 1) * strength;
    }
  }
  return child;
}

function forward(genome, inputs) {
  let idx = 0;
  const w1 = genome.subarray(idx, idx + INPUT_SIZE * HIDDEN_SIZE);
  idx += INPUT_SIZE * HIDDEN_SIZE;
  const b1 = genome.subarray(idx, idx + HIDDEN_SIZE);
  idx += HIDDEN_SIZE;
  const w2 = genome.subarray(idx, idx + HIDDEN_SIZE * OUTPUT_SIZE);
  idx += HIDDEN_SIZE * OUTPUT_SIZE;
  const b2 = genome.subarray(idx, idx + OUTPUT_SIZE);

  const hidden = new Float32Array(HIDDEN_SIZE);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    let sum = b1[h];
    for (let i = 0; i < INPUT_SIZE; i++) sum += inputs[i] * w1[h * INPUT_SIZE + i];
    hidden[h] = Math.tanh(sum);
  }

  const out = new Float32Array(OUTPUT_SIZE);
  for (let o = 0; o < OUTPUT_SIZE; o++) {
    let sum = b2[o];
    for (let h = 0; h < HIDDEN_SIZE; h++) sum += hidden[h] * w2[o * HIDDEN_SIZE + h];
    out[o] = Math.tanh(sum);
  }
  return out;
}

module.exports = {
  INPUT_SIZE,
  HIDDEN_SIZE,
  OUTPUT_SIZE,
  MUTATION_RATE,
  MUTATION_STRENGTH,
  genomeSize,
  randomGenome,
  mutate,
  forward,
};
