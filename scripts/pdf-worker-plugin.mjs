import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
// Obsidian installs three release files; embed the worker instead of requiring
// a fourth download. https://docs.obsidian.md/plugins/releasing/submit-plugin
export const pdfWorkerPlugin = {
  name: 'embedded-pdf-worker',
  setup(build) {
    build.onResolve({ filter: /^embedded-pdf-worker$/ }, () => ({
      path: 'pdf.worker.min.mjs', namespace: 'pdf-worker-source',
    }));
    // https://esbuild.github.io/plugins/#on-load-callbacks
    build.onLoad({ filter: /.*/, namespace: 'pdf-worker-source' }, async () => ({
      contents: await readFile(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8'), loader: 'text',
    }));
  },
};
