# Spieleraum

Ein Spieleraum für Vertretungsstunden: Die Lehrkraft öffnet am Laptop mit Beamer einen Raum, die Klasse tritt mit Tablets bei. Zwei Spiele:

- **Zeichnen und Raten**: Ein Kind zeichnet, alle anderen raten.
- **Stadt, Land, Fluss**: Alle schreiben gleichzeitig, ausgewertet wird gemeinsam an der Bühne.

Ein Node.js-Prozess (Express und socket.io), kein Build-Schritt, keine Datenbank. Räume leben nur im Arbeitsspeicher und verfallen zwei Stunden nach der letzten Aktivität.

## Lokal starten

Voraussetzung: Node.js 24 (LTS).

```bash
npm install
npm start
```

Danach:

| Wer | Adresse |
| --- | --- |
| Lehrkraft (Bühne und Regie) | http://localhost:3000/lehrer |
| Kinder | http://localhost:3000/ |
| Zweiter Beamer, nur Anzeige | http://localhost:3000/buehne?code=ABCD |

Mit Passwort für den Lehrerbereich lokal starten: `LEHRER_PASSWORT=meinPasswort npm start`. Ohne diese Variable ist der Lehrerbereich offen.

Im Schul-WLAN treten die Tablets über die IP-Adresse des Laptops bei, zum Beispiel `http://192.168.0.23:3000`. Der Port lässt sich mit `PORT=8080 npm start` ändern.

## Auf Render veröffentlichen

1. Den Ordner in ein GitHub-Repository hochladen (ohne `node_modules`, das regelt die `.gitignore`).
2. Bei Render einen neuen **Web Service** anlegen und das Repository verbinden.
3. Einstellungen:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   - **Health Check Path:** `/healthz`
4. Unter **Environment** eine Umgebungsvariable anlegen: Key `LEHRER_PASSWORT`, Value dein Passwort. Render setzt `PORT` selbst, der Server hört darauf.

Der kostenlose Tarif schläft nach etwa 15 Minuten ohne Anfragen ein. Das erste Aufrufen dauert dann bis zu einer Minute. Tipp: `/lehrer` ein paar Minuten vor der Stunde öffnen. Solange dieser Tab offen ist, fragt die Seite alle 10 Minuten `/healthz` ab und hält den Dienst wach.

Wichtig: Ein Neustart oder neuer Deploy löscht alle offenen Räume. Also nicht während der Stunde deployen.

## Selbst bearbeiten

| Datei | Inhalt |
| --- | --- |
| `daten/woerter.json` | Begriffslisten für Zeichnen und Raten (drei Themen mit je etwa 120 Begriffen) und der Wortfilter für den Chat |
| `daten/kategorien.json` | Kategorien für Stadt, Land, Fluss und die Vorauswahl beim Öffnen eines Raums |

Beide Dateien werden beim Serverstart gelesen. Schlüssel mit Unterstrich (`_anleitung`, `_hinweis`) sind Kommentare. Nach dem Bearbeiten neu starten (bei Render: Commit hochladen oder „Manual Deploy“). Ist die Datei fehlerhaft, zum Beispiel wegen eines fehlenden Kommas, bricht der Start mit einer deutschen Fehlermeldung ab.

Für eine einzelne Stunde geht es auch ohne Dateiänderung: In der Regieleiste gibt es Textfelder für eigene Begriffe und eigene Kategorien.

## Lehrerbereich und Passwort

Auf der Startseite führt unten der Link „Für Lehrkräfte: Raum öffnen“ zu `/lehrer`. Ist `LEHRER_PASSWORT` gesetzt, fragt die Seite zuerst nach dem Passwort. Es steht nirgends im Code und landet nicht auf GitHub. Ändern kannst du es bei Render unter Environment, danach startet der Dienst neu.

- Lädst du den Lehrer-Tab neu, bleibt der Raum offen, ohne dass du das Passwort noch einmal eingeben musst.
- Nach 5 falschen Versuchen ist die Eingabe von diesem Netzwerk aus für eine Minute gesperrt. Im Schulnetz teilen sich oft alle Geräte eine Adresse. Probieren Kinder herum, kann das auch dich kurz aussperren. Ein bereits offener Raum läuft davon unberührt weiter.
- Die passive Bühne unter `/buehne?code=ABCD` braucht kein Passwort, weil sie nur anzeigt.

## Bedienung in Kürze

- **Regieleiste:** Spiel wählen, Runden und Sekunden einstellen, starten, Runde überspringen, beenden. Pause (auch mit Taste `P`), Bild löschen, Chat leeren. „Wort zeigen“ zeigt das aktuelle Wort nur, solange der Knopf gedrückt ist, damit es nicht am Beamer steht.
- **Zeichnen und Raten:** Eine Runde bedeutet, dass ein Kind zeichnet. Bei 25 Kindern und 80 Sekunden dauern 10 Runden etwa 15 Minuten.
- **Stadt, Land, Fluss:** In der Auswertung klickst du an der Bühne auf „gültig“ oder „ungültig“, um das Urteil umzuschalten. Die Kinder stimmen per Daumen ab, entschieden wird am Pult.
- **Spieler:** umbenennen (Stift), stummschalten (Lautsprecher; stumme Kinder können weiter raten, ihre Nachrichten sieht aber niemand), entfernen (Kreuz).
- **Teams:** Unter „Wertung“ auf Teams umschalten. Kinder ohne Team werden beim Start gleichmäßig verteilt.
- **Wiederverbindung:** Schläft ein Tablet ein oder wird die Seite neu geladen, kommt das Kind automatisch auf seinen Platz zurück, mit Punkten und dem bisherigen Bild. Auch die Lehrkraft kann ihren Tab neu laden.

## Datenschutz

Es wird nichts gespeichert und nichts protokolliert. Kinder geben nur einen Spitznamen ein. Cookies setzt die Anwendung nicht. Die Wiederverbindung nutzt `sessionStorage` im jeweiligen Browser-Tab, das beim Schließen des Tabs verschwindet.

Hinweis: Die Schriften werden von Google Fonts geladen. Dabei sieht Google die IP-Adresse der Geräte. Sollte das an deiner Schule nicht gewünscht sein, können die beiden Schriftdateien auch im Ordner `public` abgelegt und dort eingebunden werden.

## Aufbau

```
server.js              Express, socket.io, Räume, Rollen, Regie
spiele/zeichnen.js     Logik Zeichnen und Raten
spiele/slf.js          Logik Stadt, Land, Fluss
spiele/werkzeuge.js    Vergleichsform für Wörter, Drosselung, Säubern von Eingaben
daten/woerter.json     Begriffslisten und Wortfilter
daten/kategorien.json  Kategorien
public/index.html      Beitritt und Spielansicht der Kinder (public/app.js)
public/lehrer.html     Bühne und Regie, unter /buehne rein passiv (public/lehrer.js)
public/gemeinsam.js    Zeichenfläche, Timer-Kreisbogen, Verbindung
public/qr.js           QR-Code-Erzeuger ohne fremde Bibliothek
public/stil.css        Gestaltung „Skizzenbuch“
```
