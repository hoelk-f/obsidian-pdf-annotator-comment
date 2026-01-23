import {
  App,
  Plugin,
  TFile,
  FileView,
  Notice,
  Modal,
  Setting,
} from "obsidian";

import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

const VIEW_TYPE = "pdfaw-view";

/* =========================
   Types
========================= */

type HighlightColor = "yellow" | "green";

type Quad = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Annotation = {
  id: string;
  page: number; // 1-based
  color: HighlightColor;
  quads: Quad[];
  text: string;
  comment?: string;
  createdAt: number;
  updatedAt: number;
};

type Sidecar = {
  pdfPath: string;
  version: 1;
  annotations: Annotation[];
};

/* =========================
   Utils
========================= */

function uuid(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function sidecarPathFor(pdfPath: string): string {
  return `${pdfPath}.obsidian-annot.json`;
}

/* =========================
   Comment Modal
========================= */

class TextModal extends Modal {
  private initial: string;
  private onSubmit: (val: string) => void;

  constructor(app: App, title: string, initial: string, onSubmit: (val: string) => void) {
    super(app);
    this.initial = initial;
    this.onSubmit = onSubmit;
    this.setTitle(title);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    let textarea!: HTMLTextAreaElement;

    new Setting(contentEl)
      .setName("Comment")
      .addTextArea(t => {
        textarea = t.inputEl;
        textarea.value = this.initial;
        textarea.rows = 6;
        textarea.style.width = "100%";
      });

    new Setting(contentEl).addButton(b =>
      b.setButtonText("Save").setCta().onClick(() => {
        this.onSubmit(textarea.value ?? "");
        this.close();
      })
    );
  }
}

/* =========================
   PDF View
========================= */

class PdfAnnotatorView extends FileView {
  private root!: HTMLDivElement;
  private viewerEl!: HTMLDivElement;
  private sidebarEl!: HTMLDivElement;

  private pdfDoc: any = null;
  private pdfPath = "";
  private scale = 1.35;

  private sidecar: Sidecar | null = null;

  private lastSelectionText = "";
  private lastSelectionQuadsByPage = new Map<number, Quad[]>();

  private contextEl: HTMLDivElement | null = null;

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.name ?? "PDF";
  }

  async onOpen() {
    this.root = this.contentEl.createDiv({ cls: "pdfaw-root" });
    this.viewerEl = this.root.createDiv({ cls: "pdfaw-viewer" });
    this.sidebarEl = this.root.createDiv({ cls: "pdfaw-sidebar" });

    this.registerDomEvent(this.viewerEl, "mouseup", () => this.captureSelection());
    this.registerDomEvent(this.viewerEl, "contextmenu", (e) =>
      this.onContextMenu(e as MouseEvent)
    );
    this.registerDomEvent(window, "click", () => this.hideContext());
  }

  async onLoadFile(file: TFile) {
    if (file.extension.toLowerCase() !== "pdf") return;

    this.pdfPath = file.path;

    const workerVaultPath =
      `${this.app.vault.configDir}/plugins/obsidian-pdf-annotator-comment/pdf.worker.min.mjs`;
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc =
      this.app.vault.adapter.getResourcePath(workerVaultPath);

    await this.loadSidecar();
    await this.renderPdf(file);
    this.renderSidebar();
  }

  async onClose() {
    this.hideContext();
    this.viewerEl?.empty();
    this.sidebarEl?.empty();
    this.sidecar = null;
    this.pdfDoc = null;
  }

  /* =========================
     Sidecar
  ========================= */

  private async loadSidecar() {
    const path = sidecarPathFor(this.pdfPath);
    const af = this.app.vault.getAbstractFileByPath(path);

    if (af instanceof TFile) {
      this.sidecar = JSON.parse(await this.app.vault.read(af));
    } else {
      this.sidecar = { pdfPath: this.pdfPath, version: 1, annotations: [] };
      await this.app.vault.create(path, JSON.stringify(this.sidecar, null, 2));
    }
  }

  private async saveSidecar() {
    if (!this.sidecar) return;
    const path = sidecarPathFor(this.pdfPath);
    const af = this.app.vault.getAbstractFileByPath(path);
    const data = JSON.stringify(this.sidecar, null, 2);

    if (af instanceof TFile) await this.app.vault.modify(af, data);
    else await this.app.vault.create(path, data);
  }

  /* =========================
     Rendering
  ========================= */

  private async renderPdf(file: TFile) {
    this.viewerEl.empty();
    this.lastSelectionText = "";
    this.lastSelectionQuadsByPage.clear();

    const buf = await this.app.vault.readBinary(file);
    this.pdfDoc = await (pdfjsLib as any).getDocument({ data: buf }).promise;

    for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });

      const pageWrap = this.viewerEl.createDiv({ cls: "pdfaw-page" });
      pageWrap.style.width = `${viewport.width}px`;
      pageWrap.style.height = `${viewport.height}px`;

      const canvas = pageWrap.createEl("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      const textLayerDiv = pageWrap.createDiv();
      textLayerDiv.style.position = "absolute";
      textLayerDiv.style.inset = "0";
      textLayerDiv.style.opacity = "0";
      textLayerDiv.style.userSelect = "text";
      textLayerDiv.style.pointerEvents = "auto";
      textLayerDiv.dataset.page = String(pageNum);

      const textContent = await page.getTextContent();
      const textLayer = new (pdfjsLib as any).TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });
      await textLayer.render();

      const overlay = pageWrap.createDiv({ cls: "pdfaw-layer" });
      overlay.dataset.page = String(pageNum);
      this.renderHighlightsForPage(pageNum, overlay);
    }
  }

  private renderHighlightsForPage(pageNum: number, overlay: HTMLDivElement) {
    overlay.empty();
    for (const a of this.sidecar?.annotations ?? []) {
      if (a.page !== pageNum) continue;
      for (const q of a.quads) {
        const hl = overlay.createDiv({ cls: `pdfaw-highlight ${a.color}` });
        hl.style.left = `${q.x}px`;
        hl.style.top = `${q.y}px`;
        hl.style.width = `${q.w}px`;
        hl.style.height = `${q.h}px`;
      }
    }
  }

  /* =========================
     Selection + Context
  ========================= */

  private captureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const pageEl = (range.commonAncestorContainer as HTMLElement)
      .parentElement?.closest("[data-page]") as HTMLElement | null;
    if (!pageEl) return;

    const pageNum = Number(pageEl.dataset.page);
    const rects = Array.from(range.getClientRects());
    const pageBox = pageEl.getBoundingClientRect();

    const quads = rects.map(r => ({
      x: r.left - pageBox.left,
      y: r.top - pageBox.top,
      w: r.width,
      h: r.height
    })).filter(q => q.w > 1 && q.h > 1);

    if (quads.length === 0) return;

    this.lastSelectionText = sel.toString().trim();
    this.lastSelectionQuadsByPage.clear();
    this.lastSelectionQuadsByPage.set(pageNum, quads);
  }

  private onContextMenu(ev: MouseEvent) {
    this.hideContext();

    if (!this.lastSelectionText) return;
    ev.preventDefault();

    const ctx = document.body.createDiv({ cls: "pdfaw-context" });
    ctx.style.left = `${ev.clientX}px`;
    ctx.style.top = `${ev.clientY}px`;

    const add = (label: string, fn: () => void) => {
      const b = ctx.createEl("button", { text: label });
      b.onclick = () => { fn(); this.hideContext(); };
    };

    add("Highlight (Yellow)", () => this.createAnnotation("yellow"));
    add("Highlight (Green)", () => this.createAnnotation("green"));
    add("Comment...", () => this.addComment());

    this.contextEl = ctx;
  }

  private hideContext() {
    this.contextEl?.remove();
    this.contextEl = null;
  }

  /* =========================
     Annotations
  ========================= */

  private async createAnnotation(color: HighlightColor, comment?: string) {
    if (!this.sidecar) return;

    const page = [...this.lastSelectionQuadsByPage.keys()][0];
    const quads = this.lastSelectionQuadsByPage.get(page)!;

    const now = Date.now();
    this.sidecar.annotations.push({
      id: uuid(),
      page,
      color,
      quads,
      text: this.lastSelectionText,
      comment,
      createdAt: now,
      updatedAt: now
    });

    await this.saveSidecar();
    await this.renderPdf(this.file!);
    this.renderSidebar();
    window.getSelection()?.removeAllRanges();
  }

  private addComment() {
    new TextModal(this.app, "Add comment", "", async (val) => {
      await this.createAnnotation("yellow", val.trim());
    }).open();
  }

  /* =========================
     Sidebar
  ========================= */

  private renderSidebar() {
    this.sidebarEl.empty();
    this.sidebarEl.createEl("h3", { text: "Annotations" });

    const annotations = [...(this.sidecar?.annotations ?? [])].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.createdAt - b.createdAt;
    });

    for (const a of annotations) {
      const card = this.sidebarEl.createDiv({ cls: "pdfaw-comment-card" });

      const meta = card.createDiv({ cls: "pdfaw-comment-meta" });
      meta.createDiv({ text: `p. ${a.page}` });
      meta.createDiv({ text: a.color === "yellow" ? "Highlight: Yellow" : "Highlight: Green" });

      const text = a.text?.trim();
      if (text) {
        card.createDiv({ cls: "pdfaw-comment-text", text });
      }

      card.createDiv({
        cls: "pdfaw-comment-body",
        text: a.comment?.trim() ? a.comment!.trim() : "No comment yet."
      });

      const actions = card.createDiv({ cls: "pdfaw-comment-actions" });
      actions.createEl("button", { text: a.comment ? "Edit comment" : "Add comment" })
        .onclick = () => this.editComment(a.id);
      actions.createEl("button", { text: "Delete" })
        .onclick = () => this.deleteAnnotation(a.id);
    }
  }

  private editComment(id: string) {
    if (!this.sidecar) return;
    const ann = this.sidecar.annotations.find(a => a.id === id);
    if (!ann) return;

    new TextModal(this.app, "Edit comment", ann.comment ?? "", async (val) => {
      ann.comment = val.trim() || undefined;
      ann.updatedAt = Date.now();
      await this.saveSidecar();
      this.renderSidebar();
    }).open();
  }

  private async deleteAnnotation(id: string) {
    if (!this.sidecar) return;
    const next = this.sidecar.annotations.filter(a => a.id !== id);
    if (next.length === this.sidecar.annotations.length) return;
    this.sidecar.annotations = next;
    await this.saveSidecar();
    await this.renderPdf(this.file!);
    this.renderSidebar();
  }
}

/* =========================
   Plugin
========================= */

export default class PdfAnnotatorWordPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new PdfAnnotatorView(leaf));
    this.registerExtensions(["pdf"], VIEW_TYPE);
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(l => l.detach());
  }
}
