import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const artifacts = path.join(root, '.test-artifacts');
await mkdir(artifacts, { recursive: true });
const bundle = await build({ absWorkingDir: root, entryPoints: ['tests/browser-entry.mjs'], bundle: true, write: false, format: 'esm', alias: { obsidian: path.join(root, 'tests/obsidian-mock.mjs') } });

function fixturePdf() {
  const line = (text, x, y, size = 12, font = 'F1') => `BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm <${Buffer.from(text, 'latin1').toString('hex')}> Tj ET\n`;
  let stream = line('Universität Musterstadt', 48, 795, 10) + line('Müller et al. (2023)', 432, 795, 10);
  stream += line('Der Einfluss von Gewohnheiten', 48, 737, 23, 'F2') + line('auf produktives Arbeiten', 48, 710, 23, 'F2');
  const sections = [
    ['1.  Einleitung', ['Gewohnheiten spielen eine zentrale Rolle in unserem alltäglichen Handeln.', 'Sie ermöglichen es, kognitive Ressourcen zu sparen und wiederkehrende', 'Aufgaben effizient zu bewältigen. In den letzten Jahren ist das Interesse', 'an der Formierung und Veränderung von Gewohnheiten deutlich gestiegen.', '', 'Trotz dieser Fortschritte bleibt jedoch unklar, in welchem Ausmaß', 'Gewohnheiten langfristig wirken und welche Faktoren entscheidend sind.', 'Nicht alle Gewohnheiten sind per se positiv zu bewerten, sondern der', 'Kontext spielt eine entscheidende Rolle.']],
    ['2.  Theoretischer Hintergrund', ['Der Begriff der Gewohnheit wird in der Forschung unterschiedlich definiert.', 'Einige Autoren verstehen Gewohnheiten als automatisierte Verhaltensweisen.', 'Andere betonen die Bedeutung bewusster kognitiver Prozesse.', 'Dazu finden sich Hinweise bei Lally et al. (2010).']],
    ['3.  Methodik', ['In der vorliegenden Studie wurde ein Mixed-Methods-Ansatz gewählt.', 'Quantitative Umfragedaten wurden mit qualitativen Interviews kombiniert.', 'Die Stichprobe umfasste N = 120 Teilnehmende über acht Wochen.', 'Die Daten wurden mittels standardisierter Fragebögen erhoben.']],
    ['4.  Ergebnisse', ['Die Ergebnisse zeigen einen Zusammenhang mit höherer Produktivität.', 'Gleichzeitig zeigen sich individuelle Unterschiede und situative Faktoren.', 'Der Kontext spielt eine wichtige moderierende Rolle.']],
  ];
  let y = 660;
  for (const [heading, lines] of sections) {
    stream += line(heading, 48, y, 16, 'F2'); y -= 26;
    for (const text of lines) { if (text) stream += line(text, 48, y); y -= text ? 17 : 9; }
    y -= 25;
  }
  stream += line('1', 292, 30, 10);
  const second = line('Diskussion und Ausblick', 48, 750, 23, 'F2') + line('Weitere Forschung untersucht langfristige Effekte.', 48, 690) + line('2', 292, 30, 10);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Length ${second.length} >>\nstream\n${second}endstream`,
  ];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 9\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
const html = `<!DOCTYPE html><html><meta charset="UTF-8"><style>html,body,#app{height:100%;margin:0}body{--font-interface:Arial,sans-serif;font-family:Arial,sans-serif}button,input,textarea,select{font:inherit}button{border:1px solid #424855;border-radius:5px} .modal{position:fixed;inset:15% 28%;z-index:100;background:#242832;color:white;padding:25px;border:1px solid #777;border-radius:12px;overflow:auto}.setting-item{display:flex;justify-content:space-between;padding:12px 0}.setting-item-control{order:1;display:flex;gap:8px}</style><link rel="stylesheet" href="/styles.css"><div id="app"></div><script type="module" src="/bundle.js"></script></html>`;
const routes = new Map([
  ['/', ['text/html', html]], ['/bundle.js', ['text/javascript', bundle.outputFiles[0].contents]],
  ['/styles.css', ['text/css', await readFile(path.join(root, 'styles.css'))]],
  ['/pdf.worker.min.mjs', ['text/javascript', await readFile(path.join(root, 'pdf.worker.min.mjs'))]],
  ['/fixture.pdf', ['application/pdf', fixturePdf()]],
]);
const server = createServer((req, res) => { const route = routes.get(req.url); res.writeHead(route ? 200 : 404, { 'Content-Type': route?.[0] ?? 'text/plain' }); res.end(route?.[1] ?? 'Not found'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executable = process.env.BROWSER_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'pdf-canvas-browser-'));
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
let socket;
const errors = [];
try {
  const debugPort = await new Promise((resolve, reject) => {
    let output = ''; const timer = setTimeout(() => reject(new Error('Browser did not start')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on ws:\/\/127.0.0.1:(\d+)/); if (match) { clearTimeout(timer); resolve(Number(match[1])); } });
  });
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.id) { const promise = pending.get(message.id); pending.delete(message.id); if (message.error) promise.reject(new Error(message.error.message)); else promise.resolve(message.result); }
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const request = ++id; pending.set(request, { resolve, reject }); socket.send(JSON.stringify({ id: request, method, params })); });
  const evaluate = async expression => { const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description); return result.result.value; };
  const until = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`Timeout: ${expression}`); };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1672, height: 941, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await until('window.ready === true');
  assert.equal(await evaluate('view.pageReady'), true, 'Real PDF must render with a text layer');
  assert.ok(await evaluate('document.querySelectorAll(".pdfaw-textlayer span").length') > 20);
  // Obsidian disables selection on its UI; the PDF layer must explicitly opt in.
  await evaluate('document.body.style.userSelect = "none"');
  const textBox = await evaluate(`(() => {const span=[...document.querySelectorAll('.pdfaw-textlayer span')].find(s=>s.textContent.includes('Gewohnheiten spielen'));const r=span.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: textBox.x + 1, y: textBox.y + textBox.h / 2, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: textBox.x + textBox.w - 2, y: textBox.y + textBox.h / 2, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: textBox.x + textBox.w - 2, y: textBox.y + textBox.h / 2, button: 'left', clickCount: 1 });
  assert.ok(await evaluate('view.selection?.text.includes("Gewohnheiten")'), 'Native mouse text selection must work inside Obsidian UI');
  await evaluate('view.clearSelection();getSelection().removeAllRanges()');
  await evaluate(`(() => {
    const items = [
      ['criticism','Methodischer Einwand','Ist die Annahme, dass kognitive Ressourcen durch Gewohnheiten gespart werden, ausreichend belegt? Hier fehlen neuere Quellen.','kognitive Ressourcen',['Methodik','Belege']],
      ['question','Gegenbeispiel?','Gibt es Studien, die zeigen, dass Gewohnheiten keinen dauerhaften Einfluss auf die Produktivität haben?\\n\\nEvtl. nach konträren Befunden suchen.','in welchem Ausmaß',['Recherche','Diskussion']],
      ['positive','Starke Argumentation','Guter Überblick über den aktuellen Forschungsstand. Die Einordnung des Kontexts ist überzeugend und gut belegt.','automatisierte',['Argumentation','Struktur']],
      ['unclear','Begriff unklar','Was genau ist hier mit „Kontext“ gemeint? Individuelle, soziale oder organisationale Faktoren?','Kontext spielt',['Begriff','Definition']],
      ['literature','Quelle prüfen','Lally et al. (2010) genauer lesen. Relevante Aussagen für den Theorieteil. Gibt es neuere Studien, die das widersprechen?','Lally',['Lesen','Wichtig']],
      ['method','Methodischer Hinweis','Spannender Mixed-Methods-Ansatz. Wäre es sinnvoll, die qualitative Stichprobe genauer zu beschreiben?','Mixed-Methods',['Methodik','Verbesserung']],
    ];
    const box = view.pageEl.getBoundingClientRect(), z = view.camera.zoom;
    view.sidecar.annotations = items.map(([category,title,comment,match,tags], index) => {
      const span = [...document.querySelectorAll('.pdfaw-textlayer span')].find(s => s.textContent.includes(match));
      const start = span.textContent.indexOf(match), range = document.createRange();
      range.setStart(span.firstChild, start); range.setEnd(span.firstChild, start + match.length);
      const r = range.getBoundingClientRect();
      return { id:'sample-'+index, page:1, category, color:category, title, comment, tags, text:span.textContent, quads:[{x:(r.x-box.x)/z,y:(r.y-box.y)/z,w:r.width/z,h:r.height/z}], createdAt:Date.now(),updatedAt:Date.now() };
    });
    view.renderAnnotations(); view.fit(); return view.save();
  })()`);
  await until('document.querySelectorAll(".pdfaw-connections path").length === 6');
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(artifacts, 'canvas.png'), Buffer.from(screenshot.data, 'base64'));
  const drag = await evaluate(`(() => { const el=document.querySelector('.pdfaw-card-header'), r=el.getBoundingClientRect(); return {x:r.x+50,y:r.y+10,oldX:view.sidecar.annotations[0].position.x,oldY:view.sidecar.annotations[0].position.y,zoom:view.camera.zoom}; })()`);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x + 60, y: drag.y + 40, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x + 60, y: drag.y + 40, button: 'left', clickCount: 1 });
  await evaluate('view.saveQueue');
  const moved = await evaluate('view.sidecar.annotations[0].position');
  assert.ok(Math.abs(moved.x - drag.oldX - 60 / drag.zoom) < 1, 'Drag must account for zoom');
  await evaluate('view.onLoadFile(new TFile("Forschungspapier.pdf"))');
  assert.deepEqual(await evaluate('view.sidecar.annotations[0].position'), moved, 'Position survives reload');
  await evaluate(`document.querySelector('.pdfaw-filters button:nth-child(2)').click()`);
  assert.equal(await evaluate('document.querySelectorAll(".pdfaw-comment-card").length'), 1);
  await evaluate(`document.querySelector('.pdfaw-filters button').click(); view.zoomBy(1.3);`);
  await evaluate(`(() => { const span=[...document.querySelectorAll('.pdfaw-textlayer span')].find(s=>s.textContent.includes('Gewohnheiten spielen')); const r=document.createRange();r.selectNodeContents(span);getSelection().removeAllRanges();getSelection().addRange(r);span.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));document.querySelector('.pdfaw-selection-toolbar button[title="Frage"]').click(); })()`);
  assert.equal(await evaluate('document.querySelectorAll(".modal").length'), 1);
  await evaluate(`(() => {const body=document.querySelector('.pdfaw-editor-body');body.value='Neuer Kommentar';body.dispatchEvent(new Event('input'));[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='Speichern').click();return view.saveQueue;})()`);
  assert.equal(await evaluate('view.sidecar.annotations.length'), 7);
  assert.equal(await evaluate('view.sidecar.annotations.at(-1).category'), 'question');
  await evaluate(`document.querySelector('.pdfaw-card-header button').click();lastMenu.items.find(item=>item.text==='Literatur').action();view.saveQueue`);
  assert.equal(await evaluate('view.sidecar.annotations[0].category'), 'literature');
  await evaluate(`document.querySelector('.pdfaw-card-header button').click();lastMenu.items.find(item=>item.text==='Kommentar löschen').action();view.saveQueue`);
  assert.equal(await evaluate('view.sidecar.annotations.length'), 6);
  await evaluate(`document.querySelector('.pdfaw-comment-card').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));view.saveQueue`);
  await evaluate('view.showPage(2)');
  assert.equal(await evaluate('document.querySelectorAll(".pdfaw-comment-card").length'), 0);
  await evaluate(`view.searchInput.value='kognitive'; view.clearSearch(); view.searchDocument(1)`);
  assert.equal(await evaluate('view.currentPage'), 1);
  assert.ok(await evaluate('document.querySelectorAll(".pdfaw-search-hit").length') > 0);
  await evaluate(`view.noteInput.value='Notiz vor Dokumentwechsel';view.noteInput.dispatchEvent(new Event('input'));view.onLoadFile(new TFile('Andere.pdf'))`);
  assert.equal(await evaluate('JSON.parse(storage.get("Forschungspapier.pdf.obsidian-annot.json")).notes'), 'Notiz vor Dokumentwechsel');
  assert.equal(await evaluate('view.sidecar.notes'), '');
  await evaluate(`storage.set('Kaputt.pdf.obsidian-annot.json','{broken');files.set('Kaputt.pdf.obsidian-annot.json',new TFile('Kaputt.pdf.obsidian-annot.json'));view.onLoadFile(new TFile('Kaputt.pdf'))`);
  assert.equal(await evaluate('view.sidecar'), null);
  assert.equal(await evaluate('storage.get("Kaputt.pdf.obsidian-annot.json")'), '{broken');
  await evaluate('view.onClose()');
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log('PASS: real PDF rendering, six categories and links, drag at zoom, reload persistence, filters, selection/editor, page switch, search, notes flush, invalid-sidecar protection');
  console.log(`Screenshot: ${path.join(artifacts, 'canvas.png')}`);
} finally {
  socket?.close(); browser.kill(); server.closeAllConnections(); server.close();
}
