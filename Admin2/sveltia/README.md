# Lokaler Sveltia-Build für den Tabelleneditor

Die offizielle Sveltia-CMS-Version `0.170.8` bleibt unverändert in
`Admin2/sveltia-cms-original-0.170.8.js` erhalten. Der Tabelleneditor selbst
liegt getrennt in `table-editor-core.js`, `table-editor.js` und
`table-editor.css`.

Sveltia unterstützt Editor-Komponenten, aber in Version `0.170.8` keine eigene
interaktive Bedienoberfläche innerhalb einer solchen Komponente. Deshalb fügt
`editor-component-control.patch` nur einen generischen optionalen
`control`-Hook hinzu. Tabellenlogik oder projektspezifische Styles sind nicht im
Sveltia-Patch enthalten.

Das in Sveltia verwendete `@sveltia/ui` bietet bei alleinstehenden Code-Blöcken
und atomaren Editor-Komponenten keine anklickbare Position vor oder nach dem
Block. `sveltia-ui-cursor-boundaries.patch` ergänzt dafür kleine Klickbereiche.
Erst ein Klick erzeugt an der gewählten Stelle einen Absatz und setzt den Cursor
hinein; automatische Leerzeilen gibt es nicht. Reine Code-Editor-Felder sind
davon ausgenommen. Das Verhalten wird durch `cursor-boundaries.test.js`
abgesichert.

## Reproduzierbarer Build

Vom Repository-Wurzelverzeichnis aus:

```sh
./Admin2/sveltia/build.sh
```

Das Skript lädt die fest gepinnten Quell- und npm-Archive, prüft deren
SHA-256-Prüfsummen, wendet beide Patches an, führt die relevanten Tests,
Format- und Lint-Prüfungen sowie `svelte-check` aus und erstellt anschließend
`Admin2/sveltia-cms-table-0.170.8.js`. Abhängigkeiten werden nur in einem
temporären Verzeichnis installiert.

Wenn Sveltia aktualisiert wird, müssen Version und Prüfsummen bewusst angepasst
und der Patch erneut gegen die neue Version geprüft werden. Das Original-Bundle
darf nicht manuell verändert werden.
