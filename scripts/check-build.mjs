import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const committed = execFileSync('git', ['show', 'HEAD:main.js'], {maxBuffer: 10 * 1024 * 1024});
assert.deepEqual(await readFile(new URL('../main.js', import.meta.url)), committed,
  'The build must exactly match committed main.js. Run npm run build and commit the result before publishing.');
console.log('PASS: built main.js is byte-for-byte identical to the committed artifact');
