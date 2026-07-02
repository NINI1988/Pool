# Pool-Billard-Liga Münster

Statische Jekyll-Website für `https://poolbillard-ms.de/` mit Decap CMS unter `/admin/`.

## Lokale Entwicklung

Voraussetzung ist Ruby mit Bundler.

```bash
bundle install
bundle exec jekyll serve
```

Die lokale Website läuft danach auf `http://127.0.0.1:4000/`.

## Inhalte

- Statische Seiten liegen in `_pages`.
- News und Spielberichte liegen in `_posts`.
- Navigation, Vereinsdaten, Downloads, Termine und Sponsoren liegen in `_data`.
- Bilder und andere Uploads liegen in `assets/uploads`.
- Downloads liegen zusätzlich gesammelt in `assets/downloads`.

## Decap CMS

Das CMS liegt unter `/admin/`. In `admin/config.yml` ist aktuell ein Platzhalter eingetragen:

```yaml
backend:
  name: github
  repo: NINI1988/Pool
  branch: main
```

Vor dem Livegang muss `OWNER/REPO` durch das echte GitHub-Repository ersetzt werden.

Alle Redakteure benötigen:

- einen GitHub-Account,
- Schreibrechte auf das Repository,
- Zugriff auf die Decap-Auth-Lösung.

Für GitHub Pages kann das GitHub OAuth Secret nicht direkt in der statischen Website liegen. Es wird deshalb ein kleiner externer OAuth-Dienst benötigt, zum Beispiel als Cloudflare Worker, Vercel Function oder Netlify Function. Dort wird eine GitHub OAuth App hinterlegt. Die Callback-/Redirect-URL muss zur CMS-URL passen, also zur späteren Adresse unter `https://poolbillard-ms.de/admin/`.

## Deployment mit GitHub Pages

Das Deployment läuft über `.github/workflows/pages.yml`.

Im GitHub-Repository muss unter `Settings -> Pages` als Source `GitHub Actions` ausgewählt werden. Nach jedem Push auf `main` baut die Action die Jekyll-Seite und veröffentlicht das Ergebnis.

## Domain verbinden

Die Datei `CNAME` enthält bereits:

```text
poolbillard-ms.de
```

In GitHub muss unter `Settings -> Pages -> Custom domain` ebenfalls `poolbillard-ms.de` eingetragen werden. Beim DNS-Anbieter muss die Domain auf GitHub Pages zeigen. Für die Apex-Domain werden die aktuellen GitHub-Pages-A-Records benötigt; für `www.poolbillard-ms.de` üblicherweise ein CNAME auf den GitHub-Pages-Host des Repositories. Nach erfolgreicher DNS-Prüfung sollte `Enforce HTTPS` aktiviert werden.

Solange die Seite unter `https://nini1988.github.io/Pool/` getestet wird, bleibt in `_config.yml` `baseurl: "/Pool"` gesetzt. Wenn ausschließlich die Custom Domain `https://poolbillard-ms.de/` verwendet wird, muss `baseurl` wieder auf `""` geändert werden.

## Migration erneut ausführen

Das Migrationstool liest öffentliche WordPress-Daten und Medien:

```bash
python3 tools/migrate_wordpress.py
```

Das Tool überschreibt migrierte Seiten und Beiträge. Manuelle Nacharbeit an migrierten Dateien sollte daher erst nach der letzten Migration passieren oder vorher gesichert werden.
