# Einmalige Einrichtung
- Die Webseite (Repository) bei Github anlegen
  - Im GitHub-Repository muss unter `Settings -> Pages` als Source `GitHub Actions` ausgewählt werden. Nach jedem Push auf `main` baut die Action die Jekyll-Seite und veröffentlicht das Ergebnis.
  - Der aktuelle Inhalt https://github.com/NINI1988/Pool in dieses neue Repository pushen
- Gehe auf https://github.com/settings/developers und registriere eine neue Oauth app
  - Wichtig Authorization callback URL muss `https://api.netlify.com/auth/done` sein
  - Nach hinzufügen `Generate new client secret` ausführen und token kopieren da man ihn nie wieder bekommt.
- Registriere dich bei https://app.netlify.com
  - Dies wird benutzt damit wir uns bei Github authentifizieren können, da es direkt über github leider nicht funktioniert.
  - Lege ein neues Projekt an, aber der Inhalt ist egal
  - Im folgenden muss `%projektname%` durch den neuen namen ersetzt werden wie zb `astounding-sunburst-46c82a`
  - Dort unsere Domain eintragen: https://app.netlify.com/projects/%projektname%/domain-management
  - Ignoriere Fehler die angezeigt werden
  - Dann unter https://app.netlify.com/projects/%projektname%/configuration/access#oauth die Information von github eintragen.
- In diesem Repository muss `admin/config.yml` angepasst werden
  - `repo: NINI1988/Pool` # TODO: durch das echte GitHub-Repository ersetzen
  - `site_domain: %projektname%.netlify.app`

## Migration erneut ausführen

Das Migrationstool liest öffentliche WordPress-Daten und Medien:

```bash
python3 tools/migrate_wordpress.py
```

Das Tool überschreibt migrierte Seiten und Beiträge. Manuelle Nacharbeit an migrierten Dateien sollte daher erst nach der letzten Migration passieren oder vorher gesichert werden.
Details stehen in `MIGRATION_SUMMARY.md`.


## Domain verbinden

Die Datei `CNAME` enthält bereits:

```text
poolbillard-ms.de
```

In GitHub muss unter `Settings -> Pages -> Custom domain` ebenfalls `poolbillard-ms.de` eingetragen werden. Beim DNS-Anbieter muss die Domain auf GitHub Pages zeigen. Für die Apex-Domain werden die aktuellen GitHub-Pages-A-Records benötigt; für `www.poolbillard-ms.de` üblicherweise ein CNAME auf den GitHub-Pages-Host des Repositories. Nach erfolgreicher DNS-Prüfung sollte `Enforce HTTPS` aktiviert werden.

Solange die Seite unter `https://nini1988.github.io/Pool/` getestet wird, bleibt in `_config.yml` `baseurl: "/Pool"` gesetzt. Wenn ausschließlich die Custom Domain `https://poolbillard-ms.de/` verwendet wird, muss `baseurl` wieder auf `""` geändert werden.
