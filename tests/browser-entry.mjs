import { PdfAnnotatorView } from '../src/main.ts';
import { TFile } from './obsidian-mock.mjs';
const storage = new Map();
const files = new Map();
const app = { vault: {
  configDir: '.obsidian',
  getAbstractFileByPath: path => files.get(path),
  read: async file => storage.get(file.path),
  readBinary: async () => (await fetch('/fixture.pdf')).arrayBuffer(),
  create: async (path, data) => { storage.set(path, data); files.set(path, new TFile(path)); },
  modify: async (file, data) => { storage.set(file.path, data); },
} };
const leaf = { app, setViewState: () => {} };
window.view = new PdfAnnotatorView(leaf);
window.storage = storage; window.files = files; window.TFile = TFile;
await window.view.onOpen();
await window.view.onLoadFile(new TFile('Forschungspapier.pdf'));
window.ready = true;
