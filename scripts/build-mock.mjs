// Writes sample MOCK-mode images to fixtures/mock/ for viewing. The Worker generates the
// same scenes at the requested size on the fly (worker/mock.js). Run with `npm run mock`.
import { writeFileSync } from 'node:fs';
import { mockPng } from '../worker/mock.js';

const size = 512, seed = 0;
const jobs = [
  ['truecolor', 2017, 'base'], ['truecolor', 2024, 'base'],
  ['falsecolor', 2017, 'base'], ['falsecolor', 2024, 'base'],
  ['nbr', 2024, 'base'], ['nbr', 2023, 'base'], ['nbr', 2023, 'extended'],
];
for (const [product, year, window] of jobs) {
  const file = `fixtures/mock/${product}-${year}-${window}.png`;
  writeFileSync(file, await mockPng({ product, year, window, width: size, height: size, seed }));
  console.log('wrote', file);
}
