import { readFile, writeFile } from 'node:fs/promises';
const read = async name => JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));
const [pkg, manifest, versions] = await Promise.all(['package.json', 'manifest.json', 'versions.json'].map(read));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Obsidian releases require an x.y.z version without a prerelease suffix.');
manifest.version = pkg.version;
versions[pkg.version] = manifest.minAppVersion;
await writeFile(new URL('../manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('../versions.json', import.meta.url), JSON.stringify(versions, null, 2) + '\n');
console.log(`Updated manifest.json and versions.json to ${pkg.version}`);
