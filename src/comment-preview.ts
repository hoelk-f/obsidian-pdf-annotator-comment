import { setIcon } from "obsidian";
import { Annotation, CategoryStyle } from "./model";

/** A reading preview outside the scaled PDF; highlights remain pointer-transparent. */
export class CommentPreview {
  private el: HTMLDivElement;
  private hideTimer: number | undefined;
  private key = "";
  private returnFocus: HTMLElement | null = null;
  private get win() { return this.root.ownerDocument.defaultView!; }

  constructor(private root: HTMLElement, private viewport: HTMLElement, private categoryFor: (annotation: Annotation) => CategoryStyle) {
    this.el = root.createDiv({ cls: "pdfaw-comment-preview", attr: { role: "region", "aria-label": "Comments", tabindex: "0" } });
    this.el.hidden = true;
    this.el.onpointerenter = () => this.cancelHide();
    this.el.onpointerleave = () => this.scheduleHide();
    this.el.addEventListener("focusin", () => this.cancelHide());
    this.el.addEventListener("focusout", event => { if (!this.el.contains(event.relatedTarget as Node | null)) this.scheduleHide(); });
    this.el.onkeydown = event => {
      if (event.key === "Escape") { event.stopPropagation(); this.hide(); }
    };
  }

  show(annotations: Annotation[], anchor: { left: number; bottom: number; top: number }, opener?: HTMLElement) {
    this.cancelHide();
    const key = annotations.map(a => `${a.id}:${a.updatedAt}`).join("|");
    if (!this.el.hidden && this.key === key && !opener) return;
    this.key = key; this.returnFocus = opener ?? null;
    this.el.empty(); this.el.hidden = false;
    const heading = this.el.createDiv({ cls: "pdfaw-preview-heading" });
    heading.createSpan({ text: annotations.length === 1 ? "Comment" : "Comments" });
    const close = heading.createEl("button", { cls: "pdfaw-icon-button", attr: { type: "button", title: "Close preview", "aria-label": "Close preview" } });
    setIcon(close, "x"); close.onclick = () => this.hide();
    if (!annotations.length) this.el.createDiv({ text: "No comments on this page yet." });
    for (const annotation of annotations) {
      const category = this.categoryFor(annotation);
      const item = this.el.createEl("article", { cls: "pdfaw-preview-item" });
      item.style.setProperty("--category", category.hex);
      const badge = item.createDiv({ cls: "pdfaw-preview-category" });
      setIcon(badge.createSpan(), category.icon); badge.createSpan({ text: category.label });
      if (annotation.title) item.createEl("h3", { text: annotation.title });
      item.createDiv({ cls: "pdfaw-preview-body", text: annotation.comment?.trim() || annotation.text });
      if (annotation.tags?.length) item.createDiv({ cls: "pdfaw-preview-tags", text: annotation.tags.join(" · ") });
    }
    const view = this.viewport.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    this.el.style.width = `${Math.min(360, view.width - 16)}px`;
    this.el.style.maxHeight = `${Math.max(80, view.height - 16)}px`;
    const width = this.el.offsetWidth, height = this.el.offsetHeight;
    const left = Math.max(view.left + 8, Math.min(view.right - width - 8, anchor.left));
    const below = anchor.bottom + 8;
    const top = below + height <= view.bottom - 8 ? below : Math.max(view.top + 8, anchor.top - height - 8);
    this.el.style.left = `${left - root.left}px`; this.el.style.top = `${top - root.top}px`;
    if (opener) this.el.focus();
  }

  scheduleHide() {
    if (this.el.contains(this.root.ownerDocument.activeElement)) return;
    this.cancelHide();
    this.hideTimer = this.win.setTimeout(() => this.hide(), 180);
  }
  private cancelHide() { this.win.clearTimeout(this.hideTimer); this.hideTimer = undefined; }
  hide() {
    const hadFocus = this.el.contains(this.root.ownerDocument.activeElement);
    this.cancelHide(); this.el.hidden = true; this.key = "";
    if (hadFocus) this.returnFocus?.focus();
    this.returnFocus = null;
  }
  destroy() { this.hide(); this.el.remove(); }
}
