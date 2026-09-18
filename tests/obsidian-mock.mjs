// Browser-only Obsidian surface. PDF.js, rendering, selection and plugin code are real.
function createEl(tag, options = {}) {
  if (typeof options === 'string') options = { cls: options };
  const element = this.ownerDocument.createElement(tag);
  if (options.cls) element.className = options.cls;
  if (options.text) element.textContent = options.text;
  for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
  this.appendChild(element); return element;
}
Object.assign(Element.prototype, {
  setCssProps(props) { for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value); },
  createEl, createDiv(options) { return createEl.call(this, 'div', options); },
  createSpan(options) { return createEl.call(this, 'span', options); },
  empty() { this.replaceChildren(); }, setText(text) { this.textContent = text; },
  addClass(...names) { this.classList.add(...names); }, removeClass(...names) { this.classList.remove(...names); },
  toggleClass(name, value) { this.classList.toggle(name, value); }, hasClass(name) { return this.classList.contains(name); },
});
export class TFile { constructor(path) { this.path = path; this.name = path.split('/').at(-1); this.extension = path.split('.').at(-1); } }
export class FileView {
  constructor(leaf) { this.leaf = leaf; this.app = leaf.app; this.contentEl = document.querySelector('#app'); this.cleanups = []; }
  register(fn) { this.cleanups.push(fn); }
  registerDomEvent(el, name, fn, options) { el.addEventListener(name, fn, options); this.register(() => el.removeEventListener(name, fn, options)); }
}
export class Plugin {}
export class Notice { constructor(text) { (window.notices ??= []).push(text); } }
export function setIcon(el, name) { el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6"/></svg>'; el.dataset.icon = name; }
export class Menu {
  constructor() { this.items = []; }
  addItem(fn) { const item = { setTitle(text) { this.text = text; return this; }, setIcon() { return this; }, setChecked() { return this; }, onClick(action) { this.action = action; return this; } }; fn(item); this.items.push(item); return this; }
  addSeparator() { return this; }
  showAtPosition() { window.lastMenu = this; }
  showAtMouseEvent() { window.lastMenu = this; }
}
export class Modal {
  constructor(app) { this.app = app; this.el = document.body.createDiv({ cls: 'modal' }); this.contentEl = this.el.createDiv(); }
  setTitle(text) { this.el.dataset.title = text; }
  open() { this.onOpen(); }
  close() { this.onClose?.(); this.el.remove(); }
}
export class Setting {
  constructor(parent) { this.el = parent.createDiv({ cls: 'setting-item' }); this.control = this.el.createDiv({ cls: 'setting-item-control' }); }
  setName(text) { this.el.createSpan({ text }); return this; }
  setDesc() { return this; }
  addText(fn) { const inputEl = this.control.createEl('input'); fn({ inputEl, setValue(value) { inputEl.value = value; return this; }, setPlaceholder(value) { inputEl.placeholder = value; return this; }, onChange(action) { inputEl.oninput = () => action(inputEl.value); return this; } }); return this; }
  addDropdown(fn) { const el = this.control.createEl('select'); fn({ addOption(value, text) { el.createEl('option', { text, attr: { value } }); return this; }, setValue(value) { el.value = value; return this; }, onChange(action) { el.onchange = () => action(el.value); return this; } }); return this; }
  addButton(fn) { const el = this.control.createEl('button'); fn({ setButtonText(text) { el.textContent = text; return this; }, setCta() { return this; }, onClick(action) { el.onclick = action; return this; } }); return this; }
}
