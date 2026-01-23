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

type HighlightColor = "yellow" | "red" | "green" | "blue";

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
  private pendingFile: TFile | null = null;
  private pageMeta = new Map<number, { page: any; viewport: any; rendered: boolean }>();
  private pageWraps = new Map<number, HTMLDivElement>();
  private overlays = new Map<number, HTMLDivElement>();
  private observer: IntersectionObserver | null = null;
  private sidebarMode: "comments" | "highlights" = "comments";

  private lastSelectionText = "";
  private lastSelectionQuadsByPage = new Map<number, Quad[]>();

  private contextEl: HTMLDivElement | null = null;

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.name ?? "PDF";
  }

  async setState(state: any, result: any) {
    if (state?.file) {
      const af = this.app.vault.getAbstractFileByPath(state.file);
      if (af instanceof TFile) {
        this.file = af;
        if (this.viewerEl) {
          await this.onLoadFile(af);
        } else {
          this.pendingFile = af;
        }
      }
    }
    return result;
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

    if (this.pendingFile) {
      const file = this.pendingFile;
      this.pendingFile = null;
      await this.onLoadFile(file);
    }
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
    this.pageMeta.clear();
    this.pageWraps.clear();
    this.overlays.clear();
    this.observer?.disconnect();
    this.observer = null;
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
    this.pageMeta.clear();
    this.pageWraps.clear();
    this.overlays.clear();
    this.observer?.disconnect();
    this.observer = null;

    const buf = await this.app.vault.readBinary(file);
    this.pdfDoc = await (pdfjsLib as any).getDocument({ data: buf }).promise;

    for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.scale });

      const pageWrap = this.viewerEl.createDiv({ cls: "pdfaw-page" });
      pageWrap.dataset.page = String(pageNum);
      pageWrap.style.width = `${viewport.width}px`;
      pageWrap.style.height = `${viewport.height}px`;
      this.pageMeta.set(pageNum, { page, viewport, rendered: false });
      this.pageWraps.set(pageNum, pageWrap);

      const overlay = pageWrap.createDiv({ cls: "pdfaw-layer" });
      overlay.dataset.page = String(pageNum);
      this.overlays.set(pageNum, overlay);
      this.renderHighlightsForPage(pageNum, overlay);
    }

    this.setupIntersectionObserver();
  }

  private setupIntersectionObserver() {
    if (this.observer) this.observer.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageWrap = entry.target as HTMLDivElement;
          const pageNum = Number(pageWrap.dataset.page);
          if (!Number.isFinite(pageNum)) continue;
          this.renderPage(pageNum);
          this.observer?.unobserve(pageWrap);
        }
      },
      { root: this.viewerEl, rootMargin: "300px 0px" }
    );

    for (const [, pageWrap] of this.pageWraps) {
      this.observer.observe(pageWrap);
    }
  }

  private async renderPage(pageNum: number) {
    const meta = this.pageMeta.get(pageNum);
    if (!meta || meta.rendered) return;
    const pageWrap = this.pageWraps.get(pageNum);
    if (!pageWrap) return;

    const { page, viewport } = meta;

    const canvas = pageWrap.createEl("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const textLayerDiv = pageWrap.createDiv({ cls: "pdfaw-textlayer" });
    textLayerDiv.style.position = "absolute";
    textLayerDiv.style.inset = "0";
    textLayerDiv.style.opacity = "0.02";
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

    const overlay = this.overlays.get(pageNum);
    if (overlay) {
      pageWrap.appendChild(overlay);
      this.renderHighlightsForPage(pageNum, overlay);
    }

    meta.rendered = true;
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
      .parentElement?.closest(".pdfaw-page") as HTMLElement | null;
    if (!pageEl) return;

    const pageNum = Number(pageEl.dataset.page);
    const rects = Array.from(range.getClientRects());
    const pageBox = pageEl.getBoundingClientRect();

    const quads = rects.map(r => {
      const left = Math.max(r.left, pageBox.left);
      const right = Math.min(r.right, pageBox.right);
      const top = Math.max(r.top, pageBox.top);
      const bottom = Math.min(r.bottom, pageBox.bottom);
      const w = right - left;
      const h = bottom - top;
      return {
        x: left - pageBox.left,
        y: top - pageBox.top,
        w,
        h
      };
    }).filter(q => q.w > 1 && q.h > 1);

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
    add("Highlight (Red)", () => this.createAnnotation("red"));
    add("Comment (Blue)...", () => this.addComment());

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
    this.updateHighlightsForPage(page);
    this.renderSidebar();
    window.getSelection()?.removeAllRanges();
  }

  private addComment() {
    new TextModal(this.app, "Add comment", "", async (val) => {
      await this.createAnnotation("blue", val.trim());
    }).open();
  }

  /* =========================
     Sidebar
  ========================= */

  private renderSidebar() {
    this.sidebarEl.empty();

    const tabs = this.sidebarEl.createDiv({ cls: "pdfaw-sidebar-tabs" });
    const commentsTab = tabs.createEl("button", { text: "Comments" });
    const highlightsTab = tabs.createEl("button", { text: "Highlights" });

    const setMode = (mode: "comments" | "highlights") => {
      this.sidebarMode = mode;
      commentsTab.classList.toggle("is-active", mode === "comments");
      highlightsTab.classList.toggle("is-active", mode === "highlights");
      this.renderSidebar();
    };

    commentsTab.onclick = () => setMode("comments");
    highlightsTab.onclick = () => setMode("highlights");
    commentsTab.classList.toggle("is-active", this.sidebarMode === "comments");
    highlightsTab.classList.toggle("is-active", this.sidebarMode === "highlights");

    if (this.sidebarMode === "comments") {
      this.renderCommentsList();
    } else {
      this.renderHighlightsList();
    }
  }

  private renderCommentsList() {
    this.sidebarEl.createEl("h3", { text: "Comments" });

    const annotations = [...(this.sidecar?.annotations ?? [])]
      .filter(a => a.comment?.trim())
      .sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.createdAt - b.createdAt;
      });

    for (const a of annotations) {
      const card = this.sidebarEl.createDiv({ cls: "pdfaw-comment-card" });
      card.onclick = () => this.scrollToAnnotation(a.id);

      const meta = card.createDiv({ cls: "pdfaw-comment-meta" });
      meta.createDiv({ text: `p. ${a.page}` });
      meta.createDiv({ text: "Comment" });

      const text = a.text?.trim();
      if (text) {
        card.createDiv({ cls: "pdfaw-comment-text", text });
      }

      card.createDiv({
        cls: "pdfaw-comment-body",
        text: a.comment?.trim() ? a.comment!.trim() : "No comment yet."
      });

      const actions = card.createDiv({ cls: "pdfaw-comment-actions" });
      actions.createEl("button", { text: "Edit" })
        .onclick = (e) => { e.stopPropagation(); this.editComment(a.id); };
      actions.createEl("button", { text: "Delete" })
        .onclick = (e) => { e.stopPropagation(); this.deleteAnnotation(a.id); };
    }
  }

  private renderHighlightsList() {
    this.sidebarEl.createEl("h3", { text: "Highlights" });

    const annotations = [...(this.sidecar?.annotations ?? [])]
      .filter(a => !a.comment?.trim())
      .sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.createdAt - b.createdAt;
      });

    for (const a of annotations) {
      const card = this.sidebarEl.createDiv({ cls: "pdfaw-comment-card" });
      card.onclick = () => this.scrollToAnnotation(a.id);

      const meta = card.createDiv({ cls: "pdfaw-comment-meta" });
      meta.createDiv({ text: `p. ${a.page}` });
      meta.createDiv({ text: a.color === "yellow" ? "Yellow" : "Red" });

      const text = a.text?.trim();
      if (text) {
        card.createDiv({ cls: "pdfaw-comment-text", text });
      }

      const actions = card.createDiv({ cls: "pdfaw-comment-actions" });
      actions.createEl("button", { text: "Delete" })
        .onclick = (e) => { e.stopPropagation(); this.deleteAnnotation(a.id); };
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
    const target = this.sidecar.annotations.find(a => a.id === id);
    const next = this.sidecar.annotations.filter(a => a.id !== id);
    if (next.length === this.sidecar.annotations.length) return;
    this.sidecar.annotations = next;
    await this.saveSidecar();
    if (target) this.updateHighlightsForPage(target.page);
    this.renderSidebar();
  }

  private updateHighlightsForPage(pageNum: number) {
    const overlay = this.overlays.get(pageNum);
    if (!overlay) return;
    this.renderHighlightsForPage(pageNum, overlay);
  }

  private async scrollToAnnotation(id: string) {
    if (!this.sidecar) return;
    const ann = this.sidecar.annotations.find(a => a.id === id);
    if (!ann) return;

    await this.renderPage(ann.page);

    const pageWrap = this.pageWraps.get(ann.page);
    if (!pageWrap) return;

    const firstQuad = ann.quads[0];
    const offset = firstQuad ? firstQuad.y - 40 : 0;
    const targetTop = pageWrap.offsetTop + Math.max(0, offset);
    this.viewerEl.scrollTo({ top: targetTop, behavior: "smooth" });
  }

}

/* =========================
   Plugin
========================= */

export default class PdfAnnotatorWordPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, leaf => new PdfAnnotatorView(leaf));
    this.addCommand({
      id: "open-pdf-in-annotator",
      name: "Open PDF in Annotator view",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension.toLowerCase() !== "pdf") return false;
        if (checking) return true;
        const leaf = this.app.workspace.getLeaf(false);
        leaf.setViewState({
          type: VIEW_TYPE,
          state: { file: file.path },
          active: true
        });
        return true;
      }
    });
  }

  onunload() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(l => l.detach());
  }
}
