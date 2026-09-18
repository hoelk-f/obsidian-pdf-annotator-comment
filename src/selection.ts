import type { Quad } from "./model";

/** Read text-node rectangles only: element rectangles duplicate whole spans. */
export function selectionQuads(range: Range, layer: HTMLElement, page: DOMRect, zoom: number): Quad[] {
  const walker = layer.ownerDocument.createTreeWalker(layer, 4 /* SHOW_TEXT */);
  const quads: Quad[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const part = layer.ownerDocument.createRange();
    part.selectNodeContents(node);
    if (node === range.startContainer) part.setStart(node, range.startOffset);
    if (node === range.endContainer) part.setEnd(node, range.endOffset);
    for (const rect of Array.from(part.getClientRects())) {
      const left = Math.max(rect.left, page.left), top = Math.max(rect.top, page.top);
      const right = Math.min(rect.right, page.right), bottom = Math.min(rect.bottom, page.bottom);
      if (right - left > 0.1 && bottom - top > 0.1) quads.push({ x: (left - page.left) / zoom, y: (top - page.top) / zoom, w: (right - left) / zoom, h: (bottom - top) / zoom });
    }
  }
  // Small caps and font changes can overlap. Paint each line once, including
  // differently sized glyphs, without joining separate columns or lines.
  const merged: Quad[] = [];
  for (const quad of quads.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = merged.find(q => Math.min(q.y + q.h, quad.y + quad.h) - Math.max(q.y, quad.y) > Math.min(q.h, quad.h) * 0.6 && quad.x <= q.x + q.w + 2 && quad.x + quad.w >= q.x - 2);
    if (!line) { merged.push({ ...quad }); continue; }
    const right = Math.max(line.x + line.w, quad.x + quad.w), bottom = Math.max(line.y + line.h, quad.y + quad.h);
    line.x = Math.min(line.x, quad.x); line.y = Math.min(line.y, quad.y);
    line.w = right - line.x; line.h = bottom - line.y;
  }
  return merged.sort((a, b) => a.y - b.y || a.x - b.x);
}
