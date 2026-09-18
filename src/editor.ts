import { App, Modal, Setting } from "obsidian";
import { Annotation, CATEGORIES, Category } from "./model";

export type CommentDraft = Pick<Annotation, "title" | "comment" | "tags" | "category">;

export class CommentModal extends Modal {
  constructor(app: App, private draft: CommentDraft, private quote: string, private submit: (draft: CommentDraft) => void) {
    super(app);
  }

  onOpen() {
    this.setTitle(this.draft.title ? "Kommentar bearbeiten" : "Kommentar hinzufügen");
    this.contentEl.addClass("pdfaw-editor");
    const draft = { ...this.draft };
    this.contentEl.createEl("blockquote", { text: this.quote });
    new Setting(this.contentEl).setName("Kategorie").addDropdown(select => {
      for (const [key, category] of Object.entries(CATEGORIES)) select.addOption(key, category.label);
      select.setValue(draft.category).onChange(value => { draft.category = value as Category; });
    });
    let title!: HTMLInputElement;
    new Setting(this.contentEl).setName("Titel").addText(input => {
      title = input.inputEl;
      input.setPlaceholder("Dein Gedanke in einem Satz").setValue(draft.title ?? "").onChange(value => { draft.title = value; });
    });
    const body = this.contentEl.createEl("textarea", { cls: "pdfaw-editor-body", attr: { placeholder: "Was möchtest du zu dieser Stelle festhalten?", "aria-label": "Kommentar", rows: "7" } });
    body.value = draft.comment ?? "";
    body.oninput = () => { draft.comment = body.value; };
    new Setting(this.contentEl).setName("Tags").setDesc("Mit Komma trennen").addText(input => {
      input.setPlaceholder("Methodik, Recherche").setValue(draft.tags?.join(", ") ?? "").onChange(value => {
        draft.tags = [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];
      });
    });
    const save = () => {
      this.submit({ ...draft, title: draft.title?.trim(), comment: draft.comment?.trim() });
      this.close();
    };
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText("Abbrechen").onClick(() => this.close()))
      .addButton(button => button.setButtonText("Speichern").setCta().onClick(save));
    body.onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); save(); } };
    title.focus();
  }

  onClose() { this.contentEl.empty(); }
}
