# TODO nach der automatischen Migration

## Automatisch migriert

- Öffentliche WordPress-Seiten aus `https://poolbillard-ms.de/wp-json/wp/v2/pages`.
- Bilder und PDF-Dateien aus `wp-content/uploads`, soweit sie in den Seiten referenziert waren.
- News-Abschnitte und Spielberichte wurden aus den WordPress-Seiten in `_posts` aufgeteilt.
- Impressum wurde aus WordPress übernommen.
- Datenschutz wurde neu angelegt, weil keine eigene öffentliche Datenschutz-Seite in der Sitemap gefunden wurde.

Details stehen in `MIGRATION_SUMMARY.md`.

## Manuell prüfen

- Impressum fachlich und rechtlich prüfen.
- Datenschutz rechtlich prüfen und an die tatsächliche Hosting-/Analytics-/Cookie-Situation anpassen.
- Alle Tabellen/Bilder aus Spielplan, Wertungen und Pokal-Seiten optisch prüfen.
- Prüfen, ob die automatisch gesplitteten News- und Spielbericht-Beiträge sinnvoll benannt und datiert sind.
- Prüfen, ob historische WordPress-Bilder gebraucht werden, die nicht direkt in Seiten referenziert waren.
- Entscheiden, ob alte WordPress-URLs per externem Redirect erhalten werden sollen. GitHub Pages kann keine serverseitigen Redirect-Regeln wie WordPress/PHP ausführen.

## Decap CMS und GitHub OAuth/Auth einrichten

1. GitHub-Repository anlegen oder vorhandenes Repository verwenden.
2. `admin/config.yml` aktualisieren: `repo: OWNER/REPO` durch das echte Repository ersetzen.
3. GitHub OAuth App anlegen.
4. Client ID und Client Secret nur im externen OAuth-Dienst speichern, nicht im Repository.
5. OAuth-Dienst für Decap CMS bereitstellen, zum Beispiel über Cloudflare Worker, Vercel Function oder Netlify Function.
6. Decap-Konfiguration bei Bedarf um `base_url` und `auth_endpoint` des OAuth-Dienstes ergänzen.
7. `/admin/` nach Deployment öffnen und Login mit GitHub testen.

## GitHub einrichten

- Repository-Remote setzen und initiale Commits pushen.
- Unter `Settings -> Pages` die Source auf `GitHub Actions` stellen.
- Actions für das Repository erlauben.
- Branch Protection für `main` nach Bedarf aktivieren.
- Prüfen, dass die Pages-Action erfolgreich läuft.
- Custom Domain `poolbillard-ms.de` in den Pages-Einstellungen setzen.
- Nach DNS-Verifikation `Enforce HTTPS` aktivieren.

## Mehrere Redakteure

- Redakteure als Collaborators oder Team-Mitglieder mit Schreibrechten einladen.
- Jeder Redakteur meldet sich mit dem eigenen GitHub-Account im CMS an.
- Für redaktionelle Kontrolle bleibt `publish_mode: editorial_workflow` aktiv.
- Optional Branch Protection nutzen, wenn Änderungen erst geprüft werden sollen.

## Domain poolbillard-ms.de verbinden

- In GitHub Pages `poolbillard-ms.de` als Custom Domain eintragen.
- Beim DNS-Anbieter die Apex-Domain auf die GitHub-Pages-IP-Adressen zeigen lassen.
- Optional `www.poolbillard-ms.de` als CNAME auf den GitHub-Pages-Host setzen.
- DNS-Verifikation abwarten.
- HTTPS erzwingen.

