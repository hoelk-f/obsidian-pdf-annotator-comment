import RemarkMyWordsPlugin, { PdfAnnotatorView } from '../src/main.ts';
import { TFile } from './obsidian-mock.mjs';
const storage = new Map();
const files = new Map();
const app = { vault: {
  configDir: '.obsidian',
  getFiles: () => [new TFile('Forschungspapier.pdf'), new TFile('note.md')],
  getAbstractFileByPath: path => files.get(path),
  read: async file => storage.get(file.path),
  readBinary: async () => (await fetch('/fixture.pdf')).arrayBuffer(),
  create: async (path, data) => { storage.set(path, data); files.set(path, new TFile(path)); },
  modify: async (file, data) => { storage.set(file.path, data); },
}, workspace: { getActiveFile: () => window.activeFile ?? null, getLeaf: () => ({setViewState: async state => { window.openedState = state; }}), on: () => ({}) } };
const leaf = { app, setViewState: () => {} };
window.plugin = new RemarkMyWordsPlugin(app);
await window.plugin.onload();
window.view = window.plugin.viewFactory(leaf);
window.categories = window.plugin.categories;
window.reloadCategories = async () => { const plugin = new RemarkMyWordsPlugin(app); await plugin.onload(); return plugin.categories.all(); };
window.storage = storage; window.files = files; window.TFile = TFile;
await window.view.onOpen();
await window.view.onLoadFile(new TFile('Forschungspapier.pdf'));
window.ready = true;
