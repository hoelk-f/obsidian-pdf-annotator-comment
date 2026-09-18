import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temp = await mkdtemp(path.join(tmpdir(), 'rmw-build-'));
const outputs = [];
for (const [name, ending] of [['linux-like', '\n'], ['different checkout path', '\r\n']]) {
  const dir = path.join(temp, name);
  await mkdir(path.join(dir, 'scripts'), {recursive: true});
  await mkdir(path.join(dir, 'node_modules/pdfjs-dist/build'), {recursive: true});
  await cp(path.join(root, 'src'), path.join(dir, 'src'), {recursive: true});
  for (const file of ['esbuild.config.mjs', 'scripts/pdf-worker-plugin.mjs', 'LICENSE', 'node_modules/pdfjs-dist/LICENSE', 'node_modules/pdfjs-dist/package.json', 'node_modules/pdfjs-dist/build/pdf.mjs', 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs']) {
    let data = await readFile(path.join(root, file), 'utf8');
    if (file.endsWith('LICENSE')) data = data.replace(/\r?\n/g, ending);
    await writeFile(path.join(dir, file), data);
  }
  await symlink(path.join(root, 'node_modules/esbuild'), path.join(dir, 'node_modules/esbuild'), process.platform === 'win32' ? 'junction' : 'dir');
  execFileSync(process.execPath, ['esbuild.config.mjs'], {cwd: dir, env: {...process.env, NODE_ENV: 'production'}, stdio: 'pipe'});
  outputs.push(await readFile(path.join(dir, 'main.js')));
}
assert.deepEqual(outputs[0], outputs[1], 'Builds must not depend on the checkout location or license line endings');
assert.ok(!outputs[0].includes(Buffer.from(temp)), 'Build must not include the absolute checkout path');
console.log('PASS: identical builds from different checkout paths and LF/CRLF license inputs');
