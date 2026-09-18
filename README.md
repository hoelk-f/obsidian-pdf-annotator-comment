# PDF Canvas für Obsidian

Ein PDF-Reader mit einer frei verschiebbaren Arbeitsfläche: Die aktuelle PDF-Seite
steht in der Mitte, Kommentare liegen als Karten daneben. Farbige, gestrichelte
Linien verbinden jede Karte mit ihrer markierten Textstelle.

## Funktionen

- Dunkle Canvas-Ansicht mit Punktraster, Zoom, Handwerkzeug und klickbarer Minimap.
- Sechs Kategorien: **Kritik**, **Frage**, **Positiv**, **Unklar**, **Literatur**, **Methode**.
- Einheitliche Kategorienfarben für Textmarkierung, Kommentar und Verbindung.
- Kommentare mit Titel, Text und Tags; frei platzierbare Karten mit gespeicherten Positionen.
- Kategorienfilter, Seitenvorschauen, Seitennavigation und Volltextsuche nach Fundseiten.
- Dokumentweite Notizen mit automatischer Speicherung.
- Lokale JSON-Dateien im Vault; bestehende Markierungen und Notizen werden übernommen.

## Bedienung

1. PDF im Vault öffnen und den Befehl **Open PDF in Annotator view** ausführen.
   Alternativ im Dateikontextmenü **In PDF Canvas öffnen** wählen.
2. Text im PDF auswählen. In der erscheinenden Werkzeugleiste oder per Rechtsklick
   eine Kategorie wählen und den Kommentar speichern. Ohne Kommentartext wird
   die ausgewählte Textstelle als Karte angezeigt.
3. Karten an ihrem Kopf ziehen. Doppelklick öffnet den Editor; das Menü **…**
   erlaubt Bearbeitung, Kategorienwechsel und Löschen.
4. **↗ S. …** auf einer Karte zentriert die zugehörige Textstelle.
5. Auf leerem Canvas ziehen oder das Handwerkzeug verwenden. Das Mausrad verschiebt
   die Arbeitsfläche; **Strg/⌘ + Mausrad** zoomt um den Mauszeiger.
6. **Alles einpassen** zeigt PDF und alle sichtbaren Karten. Die Minimap navigiert
   auch zu Karten außerhalb des sichtbaren Bereichs.

Jede PDF-Seite hat ihren eigenen Canvas mit ihren zugehörigen Kommentaren.
Seitenwechsel erfolgen über die Vorschaubilder, Pfeile oder das Seitenzahlfeld.
Die Suche springt mit Enter zur nächsten Fundseite, mit Umschalt+Enter zurück.
Die Kategorienfilter gelten für die aktuelle Seite.

| Taste | Aktion |
| --- | --- |
| V / H | Textauswahl / Handwerkzeug |
| + / − | Vergrößern / verkleinern |
| 0 | PDF und sichtbare Karten einpassen |
| Bild auf / Bild ab | Vorherige / nächste Seite |
| Strg/⌘ + F | Dokument durchsuchen |
| Escape | Auswahl aufheben, zum Auswahlwerkzeug wechseln |
| Pfeiltasten bei fokussierter Karte | Karte um 10 Einheiten verschieben; mit Umschalt um 40 |
| Enter bei fokussierter Karte | Kommentar bearbeiten |
| Strg/⌘ + Enter im Kommentarfeld | Kommentar speichern |

## Installation

Nach `npm install` und `npm run build` diese vier Dateien nach
`.obsidian/plugins/obsidian-pdf-annotator-comment/` im Vault kopieren:

- `manifest.json`
- `main.js`
- `styles.css`
- `pdf.worker.min.mjs`

Dann das Plugin in Obsidian unter **Community plugins** aktivieren bzw. neu laden.
Der bestehende Plugin-Identifier und der bisherige Öffnungsbefehl bleiben gleich.
Die Obsidian-PDF-Standardansicht bleibt über das Menü **…** erreichbar.

## Architektur und Repository-Kontext

Das ursprüngliche Repo bestand aus einer einzelnen TypeScript-Datei mit einem
eigenen PDF.js-Reader, pixelbasierten Markierungen und einer festen Seitenleiste.
Der Umbau verwendet weiterhin PDF.js und die bestehenden Sidecar-Dateien:

- `src/main.ts`: Obsidian-Integration, PDF-/Text-Layer, Seitenvorschauen,
  Canvas-Kamera, Interaktion, SVG-Verbindungen und serialisierte Speicherung.
- `src/model.ts`: Kategorien, Datenformat, Migration und Geometriefunktionen.
- `src/editor.ts`: Kommentar-Dialog mit Titel, Kategorie, Text und Tags.
- `styles.css`: vollständig auf das Plugin begrenzte Oberfläche.
- `tests/`: Daten-/Geometrietests und Browsertest mit echter PDF.js-Darstellung.
- `main.js`: mit esbuild erzeugtes Plugin-Bundle.

Nur die aktuelle PDF-Seite wird groß gerendert; Vorschaubilder werden bei Bedarf
geladen. Seitenwechsel brechen veraltete Renderaufträge ab. PDF-Koordinaten bleiben
bei der bisherigen Skala 1,35; eine separate Canvas-Transformation übernimmt Zoom
und Verschiebung. So bleiben alte Markierungen unverändert an ihrer Textstelle.

## Speicherung

Die Datei `beispiel.pdf.obsidian-annot.json` enthält:

- `version: 2`, `pdfPath`, `notes` und `annotations`.
- Pro Annotation: `id`, `page` (ab 1), `quads`, `text`, `color`, `category`,
  optionale Felder `title`, `comment`, `tags`, `position`, sowie Zeitstempel.
- `position: { x, y }` relativ zur linken oberen Ecke der PDF-Seite.
  Negative Werte sind erlaubt. Kartenpositionen sind unabhängig vom Zoom.

Version 1 wird beim Lesen im Speicher übernommen und bei der nächsten Änderung
als Version 2 gespeichert. Rot → Kritik, Gelb → Unklar, Grün → Positiv, Blau → Methode.
Beschädigte oder unbekannte Dateien werden nicht überschrieben. Neue Sidecar-Dateien
entstehen erst bei einer Änderung. Schreibvorgänge innerhalb einer Ansicht werden
serialisiert; ausstehende Notizen werden beim Schließen und Dokumentwechsel gespeichert.

## Entwicklung und Prüfung

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run test:browser` startet einen lokalen Testserver und einen unsichtbaren
Edge-Browser mit temporärem Profil. Mit `BROWSER_PATH` lässt sich eine andere
Chromium-Browserinstallation angeben. Dafür ist keine Browser-Testbibliothek nötig.
Der Test verwendet eine erzeugte zweiseitige PDF und eine nachgebildete Obsidian-API;
er greift nicht auf einen echten Vault zu. Er prüft Textauswahl, Kommentare, Drag-and-drop
bei Zoom, erneutes Laden, Kategorienfilter, Suche, Notizen beim Dokumentwechsel
und den Schutz beschädigter Dateien. Ein Screenshot entsteht unter
`.test-artifacts/canvas.png`.

## Aktuelle Grenzen

- Seitenweiser Canvas, keine gemeinsame Fläche mit allen PDF-Seiten gleichzeitig.
- Anmerkungen liegen in der JSON-Datei; kein Export als native PDF-Annotationen.
- Textauswahl und Suche benötigen eine PDF-Textebene; keine OCR für reine Scans.
- Suche navigiert nach Fundseiten; die Hervorhebung einzelner PDF-Textspannen ist
  bei über mehrere Spannen verteilten Suchphrasen eingeschränkt.
- Gleichzeitige Bearbeitung derselben PDF in mehreren Ansichten oder Geräten
  wird nicht zusammengeführt.
- Browsertests ersetzen keinen abschließenden Test im Obsidian-Host.

MIT-Lizenz, siehe `LICENSE`.
