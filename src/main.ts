import { FileView, Menu, Notice, Plugin, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { Annotation, Bounds, CARD_WIDTH, CATEGORIES, Category, PDF_SCALE, Point, Quad, Sidecar, connection, defaultPosition, fitCamera, readSidecar, sceneBounds } from "./model";
import { CommentDraft, CommentModal } from "./editor";

const VIEW_TYPE = "pdfaw-view";
const SVG_NS = "http://www.w3.org/2000/svg";
function svg<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = parent.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  parent.appendChild(el);
  return el;
}

export class PdfAnnotatorView extends FileView {
  private root!: HTMLDivElement;
  private viewport!: HTMLDivElement;
  private stage!: HTMLDivElement;
  private pageEl!: HTMLDivElement;
  private links!: SVGSVGElement;
  private cardsEl!: HTMLDivElement;
  private thumbnails!: HTMLDivElement;
  private noteInput!: HTMLTextAreaElement;
  private status!: HTMLDivElement;
  private saveStatus!: HTMLSpanElement;
  private pageInput!: HTMLInputElement;
  private pageTotal!: HTMLSpanElement;
  private zoomLabel!: HTMLButtonElement;
  private titleEl!: HTMLSpanElement;
  private mini!: SVGSVGElement;
  private hint!: HTMLDivElement;
  private selectionBar!: HTMLDivElement;
  private filterBar!: HTMLDivElement;
  private searchInput!: HTMLInputElement;
  private searchStatus!: HTMLSpanElement;
  private toolButtons = new Map<string, HTMLButtonElement>();
  private cards = new Map<string, HTMLDivElement>();
  private thumbButtons = new Map<number, HTMLButtonElement>();
  private sidecar: Sidecar | null = null;
  private pdf: PDFDocumentProxy | null = null;
  private loading: PDFDocumentLoadingTask | null = null;
  private renderTasks = new Set<RenderTask>();
  private pageTask: RenderTask | null = null;
  private textLayer: pdfjs.TextLayer | null = null;
  private thumbObserver: IntersectionObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private saveRevision = 0;
  private notesTimer: number | undefined;
  private generation = 0;
  private pageGeneration = 0;
  private searchGeneration = 0;
  private currentPage = 1;
  private pageWidth = 804;
  private pageHeight = 1137;
  private camera = { x: 0, y: 0, zoom: 0.7 };
  private tool: "select" | "hand" = "select";
  private filter: Category | null = null;
  private selection: { page: number; text: string; quads: Quad[] } | null = null;
  private activeId: string | null = null;
  private gesture: { pointer: number; start: Point; origin: Point; card?: Annotation; element: HTMLElement } | null = null;
  private searchPages: number[] = [];
  private searchIndex = -1;
  private searchText = new Map<number, string>();
  private pageReady = false;
  private geometryFrame = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: Plugin) { super(leaf); }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.name ?? "PDF Canvas"; }
  getIcon() { return "file-pen-line"; }
  canAcceptExtension(extension: string) { return extension.toLowerCase() === "pdf"; }
  private get win() { return this.contentEl.ownerDocument.defaultView!; }

  private button(parent: HTMLElement, icon: string, label: string, action: () => void, cls = ""): HTMLButtonElement {
    const button = parent.createEl("button", { cls: `pdfaw-icon-button ${cls}`, attr: { "aria-label": label, title: label, type: "button" } });
    setIcon(button, icon); button.onclick = action;
    return button;
  }

  async onOpen() {
    this.contentEl.empty(); this.contentEl.addClass("pdfaw-content");
    this.root = this.contentEl.createDiv({ cls: "pdfaw-root", attr: { tabindex: "0", "aria-label": "PDF mit Kommentar-Canvas" } });
    const header = this.root.createDiv({ cls: "pdfaw-header" });
    const brand = header.createDiv({ cls: "pdfaw-brand" });
    setIcon(brand.createSpan({ cls: "pdfaw-brand-icon" }), "file-pen-line");
    this.titleEl = brand.createSpan({ text: "PDF Canvas" });
    brand.createSpan({ cls: "pdfaw-label", text: "CANVAS" });
    const search = header.createDiv({ cls: "pdfaw-search" });
    setIcon(search.createSpan(), "search");
    this.searchInput = search.createEl("input", { attr: { type: "search", placeholder: "Im Dokument suchen …", "aria-label": "Im Dokument suchen" } });
    this.searchInput.onkeydown = event => {
      if (event.key === "Enter") { event.preventDefault(); void this.searchDocument(event.shiftKey ? -1 : 1); }
      if (event.key === "Escape") { this.searchInput.value = ""; this.clearSearch(); this.root.focus(); }
    };
    this.searchInput.oninput = () => this.clearSearch();
    this.searchStatus = search.createSpan({ cls: "pdfaw-search-status" });
    this.button(search, "chevron-down", "Nächste Fundseite", () => void this.searchDocument(1));

    const toolbar = this.root.createDiv({ cls: "pdfaw-toolbar" });
    const tools = toolbar.createDiv({ cls: "pdfaw-tool-group" });
    this.button(tools, "panel-left", "Seitenleiste ein-/ausblenden", () => this.root.toggleClass("pdfaw-hide-pages", !this.root.hasClass("pdfaw-hide-pages")));
    for (const [key, icon, label] of [["select", "mouse-pointer-2", "Text auswählen"], ["hand", "hand", "Canvas verschieben"]]) {
      this.toolButtons.set(key, this.button(tools, icon, label, () => this.setTool(key as "select" | "hand")));
    }
    this.button(tools, "message-square-plus", "Auswahl kommentieren", () => this.editSelection("method"));
    const zoom = toolbar.createDiv({ cls: "pdfaw-tool-group pdfaw-zoom-controls" });
    this.button(zoom, "minus", "Verkleinern", () => this.zoomBy(1 / 1.15));
    this.zoomLabel = zoom.createEl("button", { cls: "pdfaw-zoom-label", text: "100 %", attr: { title: "Auf 100 % zoomen", "aria-label": "Auf 100 Prozent zoomen" } });
    this.zoomLabel.onclick = () => this.zoomBy(1 / this.camera.zoom);
    this.button(zoom, "plus", "Vergrößern", () => this.zoomBy(1.15));
    this.button(zoom, "scan", "PDF und Kommentare einpassen", () => this.fit());
    const navigation = toolbar.createDiv({ cls: "pdfaw-tool-group pdfaw-navigation" });
    this.button(navigation, "chevron-left", "Vorherige Seite", () => void this.showPage(this.currentPage - 1));
    this.pageInput = navigation.createEl("input", { attr: { type: "number", min: "1", value: "1", "aria-label": "Seitenzahl" } });
    this.pageInput.onchange = () => { void this.showPage(Number(this.pageInput.value)); this.pageInput.value = String(this.currentPage); };
    this.pageTotal = navigation.createSpan({ text: "/ 0" });
    this.button(navigation, "chevron-right", "Nächste Seite", () => void this.showPage(this.currentPage + 1));
    const right = toolbar.createDiv({ cls: "pdfaw-tool-group pdfaw-toolbar-end" });
    this.button(right, "sticky-note", "Dokumentnotizen", () => {
      this.root.toggleClass("pdfaw-show-notes", !this.root.hasClass("pdfaw-show-notes"));
      if (this.root.hasClass("pdfaw-show-notes")) this.noteInput.focus();
    });
    this.button(right, "ellipsis", "Weitere Aktionen", () => {
      new Menu().addItem(item => item.setTitle("Karten dieser Seite neu anordnen").setIcon("layout-dashboard").onClick(() => {
        this.pageAnnotations().forEach((annotation, index) => { annotation.position = defaultPosition(index, this.pageWidth); });
        this.renderAnnotations(); this.fit(); void this.save();
      })).addItem(item => item.setTitle("PDF in Obsidian öffnen").setIcon("file-text").onClick(() => {
        if (this.file) void this.leaf.setViewState({ type: "pdf", state: { file: this.file.path } });
      })).showAtPosition(this.menuPosition(right));
    });

    const body = this.root.createDiv({ cls: "pdfaw-body" });
    const sidebar = body.createDiv({ cls: "pdfaw-pages" });
    const pagesHeading = sidebar.createDiv({ cls: "pdfaw-panel-heading" });
    pagesHeading.createSpan({ text: "Seiten" }); setIcon(pagesHeading.createSpan(), "panels-top-left");
    this.thumbnails = sidebar.createDiv({ cls: "pdfaw-thumbnails" });
    this.viewport = body.createDiv({ cls: "pdfaw-viewport" });
    this.stage = this.viewport.createDiv({ cls: "pdfaw-stage" });
    this.pageEl = this.stage.createDiv({ cls: "pdfaw-page" });
    this.links = svg(this.stage, "svg", { class: "pdfaw-connections", "aria-hidden": "true" });
    this.cardsEl = this.stage.createDiv({ cls: "pdfaw-cards" });
    this.filterBar = this.viewport.createDiv({ cls: "pdfaw-filters", attr: { "aria-label": "Kommentare nach Kategorie filtern" } });
    this.renderFilters();
    this.hint = this.viewport.createDiv({ cls: "pdfaw-hint", text: "Text auswählen → Kategorie wählen → Gedanken festhalten" });
    this.selectionBar = this.viewport.createDiv({ cls: "pdfaw-selection-toolbar", attr: { "aria-label": "Auswahl kommentieren" } });
    this.selectionBar.hidden = true;
    for (const [key, category] of Object.entries(CATEGORIES)) {
      const button = this.button(this.selectionBar, category.icon, category.label, () => this.editSelection(key as Category));
      button.style.setProperty("--category", category.hex); button.onpointerdown = event => event.preventDefault();
    }
    const minimap = this.viewport.createDiv({ cls: "pdfaw-minimap" });
    this.mini = svg(minimap, "svg", { class: "pdfaw-map", role: "img", "aria-label": "Canvas-Übersicht; klicken zum Navigieren" });
    this.mini.onclick = event => {
      const transform = this.mini.getScreenCTM()?.inverse();
      if (!transform) return;
      const point = this.mini.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const world = point.matrixTransform(transform);
      this.camera.x = this.viewport.clientWidth / 2 - world.x * this.camera.zoom;
      this.camera.y = this.viewport.clientHeight / 2 - world.y * this.camera.zoom;
      this.applyCamera();
    };
    const mapTools = minimap.createDiv({ cls: "pdfaw-map-tools" });
    this.button(mapTools, "minus", "Canvas verkleinern", () => this.zoomBy(1 / 1.15));
    mapTools.createSpan({ text: "Übersicht" });
    this.button(mapTools, "plus", "Canvas vergrößern", () => this.zoomBy(1.15));
    this.button(mapTools, "maximize", "Alles einpassen", () => this.fit());
    const notesPanel = body.createDiv({ cls: "pdfaw-notes-panel" });
    const notesHeading = notesPanel.createDiv({ cls: "pdfaw-panel-heading" });
    notesHeading.createSpan({ text: "Dokumentnotizen" });
    this.button(notesHeading, "x", "Notizen schließen", () => this.root.removeClass("pdfaw-show-notes"));
    this.noteInput = notesPanel.createEl("textarea", { attr: { placeholder: "Gedanken zum gesamten Dokument …", "aria-label": "Dokumentnotizen" } });
    this.noteInput.oninput = () => {
      if (!this.sidecar) return;
      this.sidecar.notes = this.noteInput.value; this.saveStatus.setText("Ungespeichert");
      this.win.clearTimeout(this.notesTimer);
      this.notesTimer = this.win.setTimeout(() => { this.notesTimer = undefined; void this.save(); }, 400);
    };
    const footer = this.root.createDiv({ cls: "pdfaw-footer" });
    this.status = footer.createDiv(); this.saveStatus = footer.createSpan({ text: "Lokal im Vault" });
    footer.createSpan({ cls: "pdfaw-footer-help", text: "Ziehen: verschieben · Strg/⌘ + Scrollen: Zoom" });
    this.setTool("select");
    this.registerDomEvent(this.viewport, "pointerdown", event => this.startPan(event));
    this.registerDomEvent(this.viewport, "pointermove", event => this.moveGesture(event));
    this.registerDomEvent(this.viewport, "pointerup", event => { this.endGesture(event); this.captureSelection(); });
    this.registerDomEvent(this.viewport, "pointercancel", event => this.endGesture(event));
    this.registerDomEvent(this.viewport, "wheel", event => {
      if ((event.target as HTMLElement).closest(".pdfaw-comment-body")) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) this.zoomBy(Math.exp(-event.deltaY * 0.005), { x: event.clientX, y: event.clientY });
      else { this.camera.x -= event.deltaX || (event.shiftKey ? event.deltaY : 0); this.camera.y -= event.shiftKey ? 0 : event.deltaY; this.applyCamera(); }
    }, { passive: false });
    this.registerDomEvent(this.pageEl, "contextmenu", event => {
      this.captureSelection(); if (!this.selection) return;
      event.preventDefault(); const menu = new Menu();
      for (const [key, category] of Object.entries(CATEGORIES)) menu.addItem(item => item.setTitle(category.label).setIcon(category.icon).onClick(() => this.editSelection(key as Category)));
      menu.showAtMouseEvent(event);
    });
    this.registerDomEvent(this.root, "keydown", event => this.onKey(event));
    this.resizeObserver = new ResizeObserver(() => this.queueGeometry());
    this.resizeObserver.observe(this.viewport);
    this.register(() => this.resizeObserver?.disconnect());
  }

  private menuPosition(el: HTMLElement) { const box = el.getBoundingClientRect(); return { x: box.left, y: box.bottom }; }

  async onLoadFile(file: TFile) {
    if (!this.root) await this.onOpen();
    await this.flushNotes(); this.releaseDocument();
    const generation = this.generation;
    this.file = file; this.sidecar = null;
    this.noteInput.disabled = true; this.noteInput.value = ""; this.titleEl.setText(file.name);
    this.pageEl.empty(); this.cardsEl.empty(); this.links.replaceChildren(); this.thumbnails.empty();
    this.pageEl.createDiv({ cls: "pdfaw-loading", text: "PDF wird geladen …" }); this.saveStatus.setText("Wird geladen …");
    try {
      await this.saveQueue; if (generation !== this.generation) return;
      const path = `${file.path}.obsidian-annot.json`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      const data = existing instanceof TFile ? readSidecar(await this.app.vault.read(existing), file.path) : { version: 2 as const, pdfPath: file.path, annotations: [], notes: "" };
      const buffer = await this.app.vault.readBinary(file);
      if (generation !== this.generation) return;
      const pluginDir = this.plugin.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
      pdfjs.GlobalWorkerOptions.workerSrc = this.app.vault.adapter.getResourcePath(`${pluginDir}/pdf.worker.min.mjs`);
      this.loading = pdfjs.getDocument({ data: buffer });
      const pdf = await this.loading.promise;
      if (generation !== this.generation) { void pdf.destroy(); return; }
      this.pdf = pdf; this.sidecar = data;
      this.noteInput.disabled = false; this.noteInput.value = data.notes; this.saveStatus.setText("Lokal im Vault");
      this.pageTotal.setText(`/ ${pdf.numPages}`); this.pageInput.max = String(pdf.numPages);
      this.buildThumbnails(); await this.showPage(1);
    } catch (error) {
      if (generation !== this.generation) return;
      this.pageEl.empty();
      this.pageEl.createDiv({ cls: "pdfaw-loading pdfaw-error", text: `PDF konnte nicht geöffnet werden. ${error instanceof Error ? error.message : String(error)}` });
      this.saveStatus.setText("Fehler beim Laden");
      new Notice("PDF Canvas: Laden fehlgeschlagen. Vorhandene Annotationsdateien wurden nicht verändert.");
      console.error("PDF Canvas", error);
    }
  }

  async onUnloadFile() { await this.flushNotes(); this.releaseDocument(); this.sidecar = null; }
  async onClose() { await this.flushNotes(); this.releaseDocument(); this.resizeObserver?.disconnect(); this.win.cancelAnimationFrame(this.geometryFrame); }
  private releaseDocument() {
    this.generation++; this.pageGeneration++; this.searchGeneration++;
    this.thumbObserver?.disconnect();
    for (const task of this.renderTasks) task.cancel();
    this.renderTasks.clear(); this.pageTask = null;
    this.textLayer?.cancel(); this.textLayer = null;
    if (this.loading) void this.loading.destroy().catch(() => {});
    this.loading = null; this.pdf = null; this.pageReady = false;
    this.clearSelection(); this.cards.forEach(card => this.resizeObserver?.unobserve(card));
    this.cards.clear(); this.thumbButtons.clear(); this.searchText.clear();
    this.searchPages = []; this.searchIndex = -1; this.searchInput.value = ""; this.searchStatus.setText("");
    this.gesture = null; this.activeId = null;
  }
  private async flushNotes() {
    if (this.notesTimer !== undefined) { this.win.clearTimeout(this.notesTimer); this.notesTimer = undefined; await this.save(); }
    await this.saveQueue;
  }
  private save(): Promise<void> {
    if (!this.sidecar) return Promise.resolve();
    const path = `${this.sidecar.pdfPath}.obsidian-annot.json`, data = JSON.stringify(this.sidecar, null, 2);
    const generation = this.generation, revision = ++this.saveRevision;
    this.saveStatus.setText("Speichert …");
    this.saveQueue = this.saveQueue.then(async () => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await this.app.vault.modify(file, data); else await this.app.vault.create(path, data);
      if (generation === this.generation && revision === this.saveRevision) this.saveStatus.setText("Gespeichert im Vault");
    }).catch(error => {
      if (generation === this.generation) this.saveStatus.setText("Speichern fehlgeschlagen");
      new Notice("Kommentare konnten nicht gespeichert werden. Bitte Vault-Schreibrechte prüfen.");
      console.error("PDF Canvas: save", error);
    });
    return this.saveQueue;
  }

  private async renderCanvas(page: pdfjs.PDFPageProxy, canvas: HTMLCanvasElement, scale: number, density: number, main = false) {
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width * density); canvas.height = Math.ceil(viewport.height * density);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas nicht verfügbar.");
    const task = page.render({ canvasContext: context, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
    if (main) this.pageTask = task;
    this.renderTasks.add(task);
    try { await task.promise; } finally { this.renderTasks.delete(task); if (this.pageTask === task) this.pageTask = null; }
  }
  private async showPage(pageNumber: number) {
    if (!this.pdf || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pdf.numPages) return;
    this.currentPage = pageNumber; this.pageReady = false;
    const token = ++this.pageGeneration, generation = this.generation;
    this.pageTask?.cancel(); this.textLayer?.cancel(); this.clearSelection();
    this.pageInput.value = String(pageNumber);
    this.thumbButtons.forEach((button, page) => { button.toggleClass("is-active", page === pageNumber); button.setAttribute("aria-current", page === pageNumber ? "page" : "false"); });
    this.thumbButtons.get(pageNumber)?.scrollIntoView({ block: "nearest" });
    this.pageEl.empty(); this.cardsEl.empty(); this.links.replaceChildren();
    this.pageEl.createDiv({ cls: "pdfaw-loading", text: "Seite wird geladen …" });
    try {
      const page = await this.pdf.getPage(pageNumber);
      if (token !== this.pageGeneration || generation !== this.generation) return;
      const viewport = page.getViewport({ scale: PDF_SCALE });
      this.pageWidth = viewport.width; this.pageHeight = viewport.height;
      this.pageEl.empty(); this.pageEl.style.width = `${this.pageWidth}px`; this.pageEl.style.height = `${this.pageHeight}px`;
      this.pageEl.style.setProperty("--scale-factor", String(PDF_SCALE)); this.pageEl.dataset.page = String(pageNumber);
      const canvas = this.pageEl.createEl("canvas", { attr: { "aria-label": `PDF Seite ${pageNumber}` } });
      this.renderAnnotations(); this.fit();
      await this.renderCanvas(page, canvas, PDF_SCALE, Math.min(this.win.devicePixelRatio || 1, 2), true);
      if (token !== this.pageGeneration || generation !== this.generation) return;
      const layer = this.pageEl.createDiv({ cls: "pdfaw-textlayer" });
      const content = await page.getTextContent();
      if (token !== this.pageGeneration || generation !== this.generation) return;
      this.searchText.set(pageNumber, content.items.map(item => "str" in item ? item.str : "").join(" ").toLocaleLowerCase());
      this.textLayer = new pdfjs.TextLayer({ textContentSource: content, container: layer, viewport });
      await this.textLayer.render();
      if (token !== this.pageGeneration || generation !== this.generation) return;
      this.pageReady = true; this.highlightSearch(); this.renderAnnotations();
    } catch (error) {
      if (token !== this.pageGeneration || generation !== this.generation) return;
      this.pageEl.createDiv({ cls: "pdfaw-loading pdfaw-error", text: "Diese Seite konnte nicht gerendert werden." });
      console.error("PDF Canvas: page", error);
    }
  }
  private buildThumbnails() {
    this.thumbnails.empty(); const generation = this.generation;
    this.thumbObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        this.thumbObserver?.unobserve(entry.target);
        const button = entry.target as HTMLButtonElement;
        void this.renderThumbnail(Number(button.dataset.page), button, generation);
      }
    }, { root: this.thumbnails, rootMargin: "200px" });
    for (let page = 1; page <= this.pdf!.numPages; page++) {
      const button = this.thumbnails.createEl("button", { cls: "pdfaw-thumbnail", attr: { "aria-label": `Seite ${page}`, "data-page": String(page) } });
      button.createDiv({ cls: "pdfaw-thumbnail-paper" }); button.createSpan({ text: String(page) });
      button.onclick = () => void this.showPage(page);
      this.thumbButtons.set(page, button); this.thumbObserver.observe(button);
    }
  }
  private async renderThumbnail(number: number, button: HTMLButtonElement, generation: number) {
    try {
      const page = await this.pdf?.getPage(number); if (!page || generation !== this.generation) return;
      const paper = button.querySelector<HTMLElement>(".pdfaw-thumbnail-paper")!;
      const canvas = paper.createEl("canvas"), viewport = page.getViewport({ scale: 1 });
      await this.renderCanvas(page, canvas, Math.min(104 / viewport.width, 146 / viewport.height), 1.5);
    } catch (error) { if (generation === this.generation) console.warn("PDF Canvas: thumbnail", error); }
  }

  private pageAnnotations() { return (this.sidecar?.annotations ?? []).filter(annotation => annotation.page === this.currentPage); }
  private visibleAnnotations() { return this.pageAnnotations().filter(annotation => !this.filter || annotation.category === this.filter); }
  private position(annotation: Annotation): Point { return annotation.position ?? defaultPosition(this.pageAnnotations().indexOf(annotation), this.pageWidth); }

  private renderFilters() {
    this.filterBar.empty();
    const all = this.filterBar.createEl("button", { text: "Alle", cls: this.filter === null ? "is-active" : "" });
    all.setAttribute("aria-pressed", String(this.filter === null));
    all.onclick = () => { this.filter = null; this.renderFilters(); this.renderAnnotations(); };
    for (const [key, category] of Object.entries(CATEGORIES)) {
      const button = this.filterBar.createEl("button", { cls: this.filter === key ? "is-active" : "", attr: { "aria-pressed": String(this.filter === key) } });
      button.style.setProperty("--category", category.hex);
      button.createSpan({ cls: "pdfaw-category-dot" }); button.createSpan({ text: category.label });
      button.onclick = () => { this.filter = this.filter === key ? null : key as Category; this.renderFilters(); this.renderAnnotations(); };
    }
  }
  private renderAnnotations() {
    this.pageAnnotations().forEach((annotation, index) => { annotation.position ??= defaultPosition(index, this.pageWidth); });
    this.pageEl.querySelector(".pdfaw-highlights")?.remove();
    const overlay = this.pageEl.createDiv({ cls: "pdfaw-highlights" });
    this.cards.forEach(card => this.resizeObserver?.unobserve(card)); this.cards.clear(); this.cardsEl.empty();
    for (const annotation of this.visibleAnnotations()) {
      const category = CATEGORIES[annotation.category];
      for (const quad of annotation.quads) {
        const highlight = overlay.createDiv({ cls: `pdfaw-highlight${this.activeId === annotation.id ? " is-active" : ""}` });
        Object.assign(highlight.style, { left: `${quad.x}px`, top: `${quad.y}px`, width: `${quad.w}px`, height: `${quad.h}px`, backgroundColor: category.hex });
      }
      const card = this.cardsEl.createDiv({ cls: "pdfaw-comment-card", attr: { tabindex: "0", "aria-label": `${category.label}: ${annotation.title || annotation.text}`, "data-id": annotation.id } });
      card.style.setProperty("--category", category.hex);
      const position = this.position(annotation);
      card.style.left = `${position.x}px`; card.style.top = `${position.y}px`; card.toggleClass("is-active", this.activeId === annotation.id);
      const header = card.createDiv({ cls: "pdfaw-card-header", attr: { title: "Ziehen zum Verschieben · Pfeiltasten bei fokussierter Karte" } });
      const badge = header.createDiv({ cls: "pdfaw-badge" });
      setIcon(badge.createSpan(), category.icon); badge.createSpan({ text: category.label });
      this.button(header, "ellipsis", "Kommentar-Aktionen", () => this.cardMenu(annotation, header));
      header.onpointerdown = event => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        event.preventDefault(); event.stopPropagation(); card.focus(); this.activeId = annotation.id;
        this.gesture = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { ...this.position(annotation) }, card: annotation, element: header };
        header.setPointerCapture(event.pointerId); card.addClass("is-dragging");
      };
      card.createEl("h3", { text: annotation.title || (annotation.comment ? "Kommentar" : "Markierte Textstelle") });
      const body = card.createDiv({ cls: "pdfaw-comment-body" });
      if (annotation.comment) body.createDiv({ text: annotation.comment }); else body.createEl("blockquote", { text: annotation.text });
      if (annotation.tags?.length) {
        const tags = card.createDiv({ cls: "pdfaw-tags" }); annotation.tags.forEach(tag => tags.createSpan({ text: tag }));
      }
      const footer = card.createDiv({ cls: "pdfaw-card-footer" });
      const jump = footer.createEl("button", { text: `↗ S. ${annotation.page}`, attr: { title: annotation.text, "aria-label": "Zur markierten Textstelle" } });
      jump.onclick = () => this.focusAnnotation(annotation);
      footer.createEl("time", { text: new Date(annotation.updatedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" }), attr: { datetime: new Date(annotation.updatedAt).toISOString() } });
      card.ondblclick = event => { if (!(event.target as HTMLElement).closest("button")) this.editAnnotation(annotation); };
      card.onkeydown = event => {
        if (event.target !== card) return;
        if (event.key === "Enter") { event.preventDefault(); this.editAnnotation(annotation); }
        const delta: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
        if (delta[event.key]) {
          event.preventDefault(); event.stopPropagation();
          const old = this.position(annotation), step = event.shiftKey ? 40 : 10;
          annotation.position = { x: old.x + delta[event.key].x * step, y: old.y + delta[event.key].y * step };
          card.style.left = `${annotation.position.x}px`; card.style.top = `${annotation.position.y}px`;
          this.queueGeometry(); void this.save();
        }
      };
      this.cards.set(annotation.id, card); this.resizeObserver?.observe(card);
    }
    this.hint.hidden = this.pageAnnotations().length > 0;
    this.status.setText(`${this.file?.name ?? "PDF"}  /  Seite ${this.currentPage}  ·  ${this.visibleAnnotations().length} von ${this.sidecar?.annotations.length ?? 0} Annotationen`);
    this.queueGeometry();
  }
  private cardMenu(annotation: Annotation, element: HTMLElement) {
    const menu = new Menu();
    menu.addItem(item => item.setTitle("Bearbeiten").setIcon("pencil").onClick(() => this.editAnnotation(annotation)));
    menu.addItem(item => item.setTitle("Zur Textstelle").setIcon("locate").onClick(() => this.focusAnnotation(annotation)));
    menu.addSeparator();
    for (const [key, category] of Object.entries(CATEGORIES)) menu.addItem(item => item.setTitle(category.label).setIcon(category.icon).setChecked(annotation.category === key).onClick(() => {
      annotation.category = key as Category; annotation.color = category.color; annotation.updatedAt = Date.now(); this.renderAnnotations(); void this.save();
    }));
    menu.addSeparator();
    menu.addItem(item => item.setTitle("Kommentar löschen").setIcon("trash-2").onClick(() => {
      if (!this.sidecar) return;
      this.sidecar.annotations = this.sidecar.annotations.filter(item => item.id !== annotation.id); this.renderAnnotations(); void this.save();
    }));
    menu.showAtPosition(this.menuPosition(element));
  }
  private editAnnotation(annotation: Annotation) {
    const data = this.sidecar;
    new CommentModal(this.app, annotation, annotation.text, draft => {
      if (this.sidecar !== data) return;
      Object.assign(annotation, draft, { color: CATEGORIES[draft.category].color, updatedAt: Date.now() }); this.renderAnnotations(); void this.save();
    }).open();
  }
  private editSelection(category: Category) {
    if (!this.selection || !this.sidecar) { new Notice("Wähle zuerst eine Textstelle im PDF aus."); return; }
    const selection = this.selection, data = this.sidecar;
    new CommentModal(this.app, { category, title: "", comment: "", tags: [] }, selection.text, (draft: CommentDraft) => {
      if (this.sidecar !== data) return;
      const now = Date.now();
      data.annotations.push({ id: crypto.randomUUID(), ...selection, ...draft, color: CATEGORIES[draft.category].color, createdAt: now, updatedAt: now });
      if (this.filter && this.filter !== draft.category) { this.filter = null; this.renderFilters(); }
      this.clearSelection(); this.win.getSelection()?.removeAllRanges(); this.renderAnnotations(); this.fit(); void this.save();
    }).open();
  }
  private captureSelection() {
    if (this.tool !== "select" || !this.pageReady) return;
    const selection = this.win.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!this.pageEl.contains(range.startContainer) || !this.pageEl.contains(range.endContainer)) return;
    const box = this.pageEl.getBoundingClientRect(), zoom = this.camera.zoom;
    const quads: Quad[] = [];
    for (const rect of Array.from(range.getClientRects())) {
      const x = (Math.max(rect.left, box.left) - box.left) / zoom, y = (Math.max(rect.top, box.top) - box.top) / zoom;
      const w = (Math.min(rect.right, box.right) - Math.max(rect.left, box.left)) / zoom;
      const h = (Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top)) / zoom;
      if (w > 1 && h > 1 && !quads.some(q => Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1 && Math.abs(q.w - w) < 1 && Math.abs(q.h - h) < 1)) quads.push({ x, y, w, h });
    }
    if (!quads.length) return;
    this.selection = { page: this.currentPage, text: selection.toString().trim(), quads }; this.positionSelectionBar();
  }
  private clearSelection() { this.selection = null; if (this.selectionBar) this.selectionBar.hidden = true; }
  private positionSelectionBar() {
    if (!this.selection) return;
    const q = this.selection.quads[this.selection.quads.length - 1]; this.selectionBar.hidden = false;
    this.selectionBar.style.left = `${Math.max(8, Math.min(this.viewport.clientWidth - 260, this.camera.x + q.x * this.camera.zoom))}px`;
    this.selectionBar.style.top = `${Math.max(50, Math.min(this.viewport.clientHeight - 55, this.camera.y + (q.y + q.h) * this.camera.zoom + 10))}px`;
  }
  private focusAnnotation(annotation: Annotation) {
    const q = annotation.quads[0]; this.activeId = annotation.id;
    this.camera.x = this.viewport.clientWidth / 2 - (q.x + q.w / 2) * this.camera.zoom;
    this.camera.y = this.viewport.clientHeight / 2 - q.y * this.camera.zoom; this.renderAnnotations(); this.applyCamera();
  }
  private setTool(tool: "select" | "hand") {
    this.tool = tool; this.root.toggleClass("pdfaw-hand", tool === "hand");
    this.toolButtons.forEach((button, key) => { button.toggleClass("is-active", key === tool); button.setAttribute("aria-pressed", String(key === tool)); });
    if (tool === "hand") { this.clearSelection(); this.win.getSelection()?.removeAllRanges(); }
  }
  private startPan(event: PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, .pdfaw-comment-card, .pdfaw-filters, .pdfaw-minimap, .pdfaw-selection-toolbar")) return;
    if (event.button !== 1 && (event.button !== 0 || (this.tool !== "hand" && target.closest(".pdfaw-page")))) {
      if (event.button === 0) this.clearSelection(); return;
    }
    event.preventDefault(); this.clearSelection(); this.root.focus();
    this.gesture = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: this.camera.x, y: this.camera.y }, element: this.viewport };
    this.viewport.setPointerCapture(event.pointerId); this.viewport.addClass("is-panning");
  }
  private moveGesture(event: PointerEvent) {
    const gesture = this.gesture; if (!gesture || gesture.pointer !== event.pointerId) return;
    const dx = event.clientX - gesture.start.x, dy = event.clientY - gesture.start.y;
    if (gesture.card) {
      gesture.card.position = { x: gesture.origin.x + dx / this.camera.zoom, y: gesture.origin.y + dy / this.camera.zoom };
      const card = this.cards.get(gesture.card.id)!;
      card.style.left = `${gesture.card.position.x}px`; card.style.top = `${gesture.card.position.y}px`; this.queueGeometry();
    } else { this.camera.x = gesture.origin.x + dx; this.camera.y = gesture.origin.y + dy; this.applyCamera(); }
  }
  private endGesture(event: PointerEvent) {
    const gesture = this.gesture; if (!gesture || gesture.pointer !== event.pointerId) return;
    if (gesture.element.hasPointerCapture(event.pointerId)) gesture.element.releasePointerCapture(event.pointerId);
    if (gesture.card) { this.cards.get(gesture.card.id)?.removeClass("is-dragging"); void this.save(); }
    this.viewport.removeClass("is-panning"); this.gesture = null;
  }
  private cardBounds(): Bounds[] { return this.visibleAnnotations().map(annotation => ({ ...this.position(annotation), width: CARD_WIDTH, height: this.cards.get(annotation.id)?.offsetHeight || 220 })); }
  private bounds() { return sceneBounds(this.pageWidth, this.pageHeight, this.cardBounds()); }
  private fit() {
    if (!this.pdf) return;
    this.camera = fitCamera(this.bounds(), this.viewport.clientWidth, Math.max(100, this.viewport.clientHeight - 65));
    this.camera.y += 45; this.applyCamera();
  }
  private zoomBy(factor: number, client?: Point) {
    const rect = this.viewport.getBoundingClientRect();
    const x = client ? client.x - rect.left : rect.width / 2, y = client ? client.y - rect.top : rect.height / 2;
    const zoom = Math.max(0.1, Math.min(3, this.camera.zoom * factor)), ratio = zoom / this.camera.zoom;
    this.camera = { x: x - (x - this.camera.x) * ratio, y: y - (y - this.camera.y) * ratio, zoom }; this.applyCamera();
  }
  private applyCamera() {
    const { x, y, zoom } = this.camera;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    this.viewport.style.backgroundPosition = `${x}px ${y}px`; this.viewport.style.backgroundSize = `${22 * zoom}px ${22 * zoom}px`;
    this.zoomLabel.setText(`${Math.round(zoom * 100)} %`); this.positionSelectionBar(); this.queueGeometry();
  }
  private queueGeometry() {
    if (this.geometryFrame) return;
    this.geometryFrame = this.win.requestAnimationFrame(() => { this.geometryFrame = 0; this.drawConnections(); this.drawMinimap(); });
  }
  private drawConnections() {
    this.links.replaceChildren();
    for (const annotation of this.visibleAnnotations()) {
      const card = this.cards.get(annotation.id); if (!card) continue;
      const color = CATEGORIES[annotation.category].hex;
      const { path, anchor } = connection({ ...this.position(annotation), width: CARD_WIDTH, height: card.offsetHeight }, annotation.quads[0]);
      svg(this.links, "path", { d: path, stroke: color, "stroke-width": 2, "stroke-dasharray": "8 7", "stroke-linecap": "round", fill: "none", "vector-effect": "non-scaling-stroke" });
      svg(this.links, "circle", { cx: anchor.x, cy: anchor.y, r: 3, fill: color });
    }
  }
  private drawMinimap() {
    this.mini.replaceChildren(); const bounds = this.bounds(), camera = this.camera;
    this.mini.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    svg(this.mini, "rect", { x: 0, y: 0, width: this.pageWidth, height: this.pageHeight, rx: 8, fill: "#687184", opacity: 0.6 });
    this.visibleAnnotations().forEach(annotation => {
      const p = this.position(annotation);
      svg(this.mini, "rect", { x: p.x, y: p.y, width: CARD_WIDTH, height: this.cards.get(annotation.id)?.offsetHeight || 220, rx: 12, fill: CATEGORIES[annotation.category].hex, opacity: 0.8 });
    });
    svg(this.mini, "rect", { x: -camera.x / camera.zoom, y: -camera.y / camera.zoom, width: this.viewport.clientWidth / camera.zoom, height: this.viewport.clientHeight / camera.zoom, fill: "#b8afff", "fill-opacity": 0.08, stroke: "#b8afff", "stroke-width": 1, "vector-effect": "non-scaling-stroke" });
  }
  private clearSearch() { this.searchGeneration++; this.searchPages = []; this.searchIndex = -1; this.searchStatus.setText(""); this.pageEl.querySelectorAll(".pdfaw-search-hit").forEach(el => el.removeClass("pdfaw-search-hit")); }
  private async searchDocument(direction: number) {
    const query = this.searchInput.value.trim().toLocaleLowerCase(); if (!query || !this.pdf) return;
    if (this.searchIndex >= 0 && this.searchPages.length) this.searchIndex = (this.searchIndex + direction + this.searchPages.length) % this.searchPages.length;
    else {
      const token = ++this.searchGeneration, pdf = this.pdf; this.searchStatus.setText("Sucht …"); const pages: number[] = [];
      try {
        for (let number = 1; number <= pdf.numPages; number++) {
          if (token !== this.searchGeneration) return;
          let text = this.searchText.get(number);
          if (text === undefined) {
            const content = await (await pdf.getPage(number)).getTextContent(); if (token !== this.searchGeneration) return;
            text = content.items.map(item => "str" in item ? item.str : "").join(" ").toLocaleLowerCase(); this.searchText.set(number, text);
          }
          if (text.includes(query)) pages.push(number);
        }
        if (token !== this.searchGeneration) return;
        this.searchPages = pages; this.searchIndex = pages.length ? 0 : -1;
      } catch { if (token === this.searchGeneration) this.searchStatus.setText("Suchfehler"); return; }
    }
    this.searchStatus.setText(this.searchPages.length ? `${this.searchIndex + 1}/${this.searchPages.length} Seiten` : "Keine Treffer");
    if (this.searchIndex >= 0) await this.showPage(this.searchPages[this.searchIndex]);
  }
  private highlightSearch() {
    const query = this.searchInput.value.trim().toLocaleLowerCase(); if (!query) return;
    this.pageEl.querySelectorAll<HTMLElement>(".pdfaw-textlayer span").forEach(span => span.toggleClass("pdfaw-search-hit", !!span.textContent?.toLocaleLowerCase().includes(query)));
  }
  private onKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement).closest("input, textarea, [contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "f") { event.preventDefault(); this.searchInput.focus(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") { this.clearSelection(); this.setTool("select"); }
    if (event.key.toLowerCase() === "h") this.setTool("hand");
    if (event.key.toLowerCase() === "v") this.setTool("select");
    if (event.key === "0") this.fit();
    if (event.key === "+" || event.key === "=") this.zoomBy(1.15);
    if (event.key === "-") this.zoomBy(1 / 1.15);
    if (event.key === "PageDown") { event.preventDefault(); void this.showPage(this.currentPage + 1); }
    if (event.key === "PageUp") { event.preventDefault(); void this.showPage(this.currentPage - 1); }
  }
}

export default class PdfCanvasPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new PdfAnnotatorView(leaf, this));
    this.addCommand({ id: "open-pdf-in-annotator", name: "Open PDF in Annotator view", checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || file.extension.toLowerCase() !== "pdf") return false;
      if (!checking) void this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
      return true;
    } });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFile && file.extension.toLowerCase() === "pdf") menu.addItem(item => item.setTitle("In PDF Canvas öffnen").setIcon("file-pen-line").onClick(() => {
        void this.app.workspace.getLeaf(false).setViewState({ type: VIEW_TYPE, state: { file: file.path }, active: true });
      }));
    }));
  }
}
