import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const json = async file => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
const [manifest, pkg, lock, versions] = await Promise.all(['manifest.json', 'package.json', 'package-lock.json', 'versions.json'].map(json));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert.ok(!manifest.id.includes('obsidian') && !manifest.id.endsWith('plugin'));
assert.equal(manifest.id, 'remark-my-words');
assert.equal(manifest.name, 'Remark My Words');
assert.match(manifest.version, semver);
assert.match(manifest.minAppVersion, semver);
assert.equal(pkg.version, manifest.version, 'Package and manifest versions must match');
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.equal(pkg.name, manifest.id);
assert.equal(lock.name, pkg.name);
assert.equal(versions[manifest.version], manifest.minAppVersion, 'Update versions.json for this release');
assert.ok(manifest.author && manifest.author !== 'You');
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith('.'));
assert.equal(typeof manifest.isDesktopOnly, 'boolean');
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, manifest.version, 'Release tag must match manifest.version exactly (no v prefix)');
for (const file of ['main.js', 'manifest.json', 'styles.css', 'README.md', 'LICENSE']) {
  assert.ok((await stat(new URL(`../${file}`, import.meta.url))).size > 0, `Missing or empty ${file}`);
}
const bundle = await readFile(new URL('../main.js', import.meta.url), 'utf8');
assert.ok(bundle.includes('WorkerMessageHandler'), 'PDF worker must be included in main.js');
assert.ok(bundle.includes('Apache License'), 'Bundled PDF.js license must be retained');
assert.ok(!bundle.includes('require("embedded-pdf-worker")'), 'Worker import must be bundled');
console.log(`PASS: ${manifest.name} ${manifest.version}; three-file release with embedded PDF worker`);
