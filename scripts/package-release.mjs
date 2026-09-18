import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL('../dist/remark-my-words/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
  await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, target));
}
console.log('Release assets ready in dist/remark-my-words/');
