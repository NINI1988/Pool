# Pool-Billard-Liga Münster

Webseite aufrufbar unter: https://nini1988.github.io/Pool/  
Admin Seite unter: https://nini1988.github.io/Pool/admin  
Um das Layout und so weiter direkt im Webbrowser zu bearbeiten Drücke die `.` Taste.

Nachdem Änderungen veröffentlicht wurden wird die Webseite neu gebaut. Der Status kann in https://github.com/NINI1988/Pool/actions angezeigt werden.

## Inhalte

- Statische Seiten liegen in `_pages`.
- News und Spielberichte liegen in `_posts`.
- Navigation, Vereinsdaten, Downloads, Termine und Sponsoren liegen in `_data`.
- Bilder und andere Uploads liegen in `assets/uploads`.
- Downloads liegen zusätzlich gesammelt in `assets/downloads`.

# Einmaliges Einrichten für offizielle Webseite
[Einrichtung](Einrichtung.md)

# Neuen Redakteur hinzufügen

Alle Redakteure benötigen:

- einen GitHub-Account,
- Schreibrechte auf das Repository,
- Zugriff auf die Decap-Auth-Lösung (Vielleicht?)

# Entwickler Infos

## Lokale Umgebung

- Install Ruby. Eg: https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-3.2.11-1/rubyinstaller-devkit-3.2.11-1-x64.exe
- Github uses not the latest Ruby version, so keep version 3.2.
- Execute: `bundle install`
- Execute: `bundle exec jekyll serve`
- Execute: `npx decap-server` to start Decap server
  - Add `local_backend: true` to `admin/config.yml`
  - Access with http://localhost:4000/Pool/admin/
