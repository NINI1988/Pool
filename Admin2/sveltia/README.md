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

## Reproduzierbarer Build

Vom Repository-Wurzelverzeichnis aus:

```sh
./Admin2/sveltia/build.sh
```

Das Skript lädt die fest gepinnten Quell- und npm-Archive, prüft deren
SHA-256-Prüfsummen, wendet den Patch an, führt den relevanten Sveltia-Test,
Format- und Lint-Prüfungen sowie `svelte-check` aus und erstellt anschließend
`Admin2/sveltia-cms-table-0.170.8.js`. Abhängigkeiten werden nur in einem
temporären Verzeichnis installiert.

Wenn Sveltia aktualisiert wird, müssen Version und Prüfsummen bewusst angepasst
und der Patch erneut gegen die neue Version geprüft werden. Das Original-Bundle
darf nicht manuell verändert werden.
