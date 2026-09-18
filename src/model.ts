/** PDF geometry stays at the original reader's scale; camera zoom never changes it. */
export const PDF_SCALE = 1.35;
export const CARD_WIDTH = 370;
export const CATEGORIES = {
  claim: { label: "Claim", color: "orange", hex: "#ff9656", icon: "quote" },
  evidence: { label: "Evidence", color: "green", hex: "#54df94", icon: "check-check" },
  method: { label: "Method", color: "blue", hex: "#54b5ff", icon: "settings-2" },
  concept: { label: "Concept", color: "purple", hex: "#bd83f5", icon: "book-open" },
  limitation: { label: "Limitation", color: "red", hex: "#ff657e", icon: "circle-alert" },
  note: { label: "Note", color: "yellow", hex: "#f4d653", icon: "sticky-note" },
} as const;
export type Category = keyof typeof CATEGORIES;
export type Point = { x: number; y: number };
export type Quad = Point & { w: number; h: number };
export type Annotation = {
  id: string;
  page: number;
  category: Category;
  color: string;
  quads: Quad[];
  text: string;
  title?: string;
  comment?: string;
  tags?: string[];
  position?: Point;
  createdAt: number;
  updatedAt: number;
};
export type Sidecar = {
  pdfPath: string;
  version: 2;
  annotations: Annotation[];
  notes: string;
};
export type Bounds = { x: number; y: number; width: number; height: number };
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const point = (p: any): p is Point => p && finite(p.x) && finite(p.y);

/** Reject invalid files rather than silently discarding annotations on the next save. */
export function readSidecar(raw: string, pdfPath: string): Sidecar {
  const data = JSON.parse(raw);
  if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.annotations) ||
      (data.notes !== undefined && typeof data.notes !== "string")) {
    throw new Error("Unknown or damaged annotation format.");
  }
  const legacy: Record<string, Category> = { red: "limitation", yellow: "note", green: "evidence", blue: "method", orange: "note", purple: "evidence" };
  const oldCategories: Record<string, Category> = { criticism: "limitation", question: "note", positive: "evidence", unclear: "note", literature: "evidence" };
  const ids = new Set<string>();
  const annotations = data.annotations.map((a: any): Annotation => {
    if (!a || typeof a.id !== "string" || ids.has(a.id) || !Number.isInteger(a.page) || a.page < 1 ||
        !Array.isArray(a.quads) || !a.quads.length || !a.quads.every((q: any) => finite(q?.x) && finite(q?.y) && finite(q.w) && finite(q.h) && q.w > 0 && q.h > 0) ||
        typeof a.text !== "string" || !finite(a.createdAt) || !finite(a.updatedAt) ||
        (a.position !== undefined && !point(a.position)) ||
        (a.title !== undefined && typeof a.title !== "string") ||
        (a.comment !== undefined && typeof a.comment !== "string") ||
        (a.tags !== undefined && (!Array.isArray(a.tags) || !a.tags.every((t: unknown) => typeof t === "string")))) {
      throw new Error("An annotation contains invalid data.");
    }
    ids.add(a.id);
    if (a.category !== undefined && !Object.prototype.hasOwnProperty.call(CATEGORIES, a.category) && !Object.prototype.hasOwnProperty.call(oldCategories, a.category)) throw new Error("Unknown category.");
    const category: Category = Object.prototype.hasOwnProperty.call(oldCategories, a.category) ? oldCategories[a.category] : a.category ?? (Object.prototype.hasOwnProperty.call(legacy, a.color) ? legacy[a.color] : "note");
    return { ...a, category, color: CATEGORIES[category].color };
  });
  return { ...data, pdfPath, version: 2, annotations, notes: data.notes ?? "" };
}

export function defaultPosition(index: number, pageWidth: number): Point {
  return { x: index % 2 === 0 ? -CARD_WIDTH - 90 : pageWidth + 90, y: 28 + Math.floor(index / 2) * 380 };
}

/** Attach to the nearest horizontal edge of the card and the selected text. */
export function connection(card: Bounds, quad: Quad): { path: string; anchor: Point } {
  const onLeft = card.x + card.width / 2 < quad.x + quad.w / 2;
  const start = { x: onLeft ? card.x + card.width : card.x, y: card.y + Math.min(card.height / 2, 100) };
  const anchor = { x: onLeft ? quad.x : quad.x + quad.w, y: quad.y + quad.h / 2 };
  const bend = Math.max(60, Math.abs(anchor.x - start.x) * 0.48);
  const direction = onLeft ? 1 : -1;
  return { path: `M ${start.x} ${start.y} C ${start.x + bend * direction} ${start.y}, ${anchor.x - bend * direction} ${anchor.y}, ${anchor.x} ${anchor.y}`, anchor };
}

export function sceneBounds(pageWidth: number, pageHeight: number, cards: Bounds[]): Bounds {
  const left = Math.min(0, ...cards.map(c => c.x));
  const top = Math.min(0, ...cards.map(c => c.y));
  const right = Math.max(pageWidth, ...cards.map(c => c.x + c.width));
  const bottom = Math.max(pageHeight, ...cards.map(c => c.y + c.height));
  return { x: left - 45, y: top - 45, width: right - left + 90, height: bottom - top + 90 };
}

export function fitCamera(bounds: Bounds, width: number, height: number) {
  const zoom = Math.max(0.1, Math.min(1.5, width / bounds.width, height / bounds.height));
  return { zoom, x: (width - bounds.width * zoom) / 2 - bounds.x * zoom, y: (height - bounds.height * zoom) / 2 - bounds.y * zoom };
}
