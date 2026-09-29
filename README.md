# Spieleraum

Ein Spieleraum für Klassenfahrten, Ferienlager und Spieleabende: Die Spielleitung öffnet am Laptop einen Raum, alle treten mit Handy oder Tablet bei. Acht Spiele:

- **Zeichnen und Raten**: Ein Kind zeichnet, alle anderen raten.
- **Stadt, Land, Fluss**: Alle schreiben gleichzeitig, ausgewertet wird gemeinsam.
- **Saboteur**: Im nächtlichen Schulhaus erledigt die Crew Aufgaben, heimliche Saboteure erwischen sie. In Konferenzen wird abgestimmt, wer rausfliegt.
- **Wer ist der Spion?**: Alle kennen dasselbe Wort, nur der Spion nicht. Reihum ein Stichwort, dann Abstimmung.
- **Werwolf**: Das Handy verteilt die Rollen und leitet Nacht und Tag. Die Bühne kann die Erzählung vorlesen.
- **Begriffe erklären**: Teams erklären Begriffe, ohne die verbotenen Wörter zu sagen. Die anderen Teams summen dazwischen.
- **Stirnraten**: Handy an die Stirn, die anderen erklären. Nach vorn kippen heißt richtig, nach hinten weiter.
- **Quiz**: Alle antworten gleichzeitig, schnelle richtige Antworten bringen mehr Punkte.

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
| Gruppenmodus (mehrere Räume) | http://localhost:3000/gruppen |
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
| `daten/woerter.json` | 16 Begriffslisten (etwa 1400 Begriffe) für Zeichnen und Raten, Spion und Stirnraten, dazu der Wortfilter für den Chat |
| `daten/erklaeren.json` | Karten für „Begriffe erklären“: Wort und vier verbotene Wörter, in sechs Gruppen |
| `daten/quiz.json` | Quizfragen in sechs Kategorien. Die erste Antwort ist immer die richtige, gemischt wird im Spiel |
| `daten/kategorien.json` | Kategorien für Stadt, Land, Fluss und die Vorauswahl beim Öffnen eines Raums |

Alle Dateien werden beim Serverstart gelesen. Schlüssel mit Unterstrich (`_anleitung`, `_hinweis`) sind Kommentare. Nach dem Bearbeiten neu starten (bei Render: Commit hochladen oder „Manual Deploy“). Ist die Datei fehlerhaft, zum Beispiel wegen eines fehlenden Kommas, bricht der Start mit einer deutschen Fehlermeldung ab.

Für eine einzelne Stunde geht es auch ohne Dateiänderung: In der Regieleiste gibt es Textfelder für eigene Begriffe und eigene Kategorien.

## Lehrerbereich und Passwort

Auf der Startseite führt unten der Link „Für Lehrkräfte: Raum öffnen“ zu `/lehrer`. Ist `LEHRER_PASSWORT` gesetzt, fragt die Seite zuerst nach dem Passwort. Es steht nirgends im Code und landet nicht auf GitHub. Ändern kannst du es bei Render unter Environment, danach startet der Dienst neu.

- Lädst du den Lehrer-Tab neu, bleibt der Raum offen, ohne dass du das Passwort noch einmal eingeben musst.
- Nach 5 falschen Versuchen ist die Eingabe von diesem Netzwerk aus für eine Minute gesperrt. Im Schulnetz teilen sich oft alle Geräte eine Adresse. Probieren Kinder herum, kann das auch dich kurz aussperren. Ein bereits offener Raum läuft davon unberührt weiter.
- Die passive Bühne unter `/buehne?code=ABCD` braucht kein Passwort, weil sie nur anzeigt.

## Gruppenmodus

Über „Gruppen öffnen“ auf der Startseite (oder `/gruppen`) öffnest du 2 bis 10 Räume auf einmal. Jede Gruppe hat ihren eigenen Code, die Karten am Beamer zeigen Code und QR-Code.

- **Alle Gruppen:** starten, pausieren, überspringen, beenden, Gruppe hinzufügen. Die Spieleinstellungen rechts gelten für alle Gruppen.
- **Einzelne Gruppe:** Die Knöpfe auf ihrer Karte wirken nur dort. „Regie“ öffnet in einem neuen Tab die volle Einzelregie mit Spielerliste (umbenennen, stummschalten, entfernen). „Bühne“ öffnet die Anzeige für ein zusätzliches Gerät der Gruppe.
- Gruppen ohne Kinder starten nicht. Du bekommst dazu einen Hinweis, die anderen Gruppen laufen trotzdem.
- Lädst du den Tab neu, bleiben alle Gruppen erhalten.
- Im Gruppenmodus gibt es keine Teamwertung, jede Gruppe spielt für sich.

## Stadt, Land, Fluss: Prüfen

Unter „Prüfen“ in den Einstellungen wählst du, wer die Antworten bewertet.

- **Kinder stimmen ab (Standard):** Nach jeder Schreibrunde kommt eine Prüfrunde. Jedes Kind sieht auf dem Tablet alle Antworten der anderen, ohne Namen, und tippt bei unpassenden auf „stimmt nicht“. Sind mehr als die Hälfte der anderen Kinder dagegen, fliegt die Antwort raus. Bei genau der Hälfte bleibt sie stehen. Gleiche Antworten werden zusammengefasst und gemeinsam bewertet. Leere Felder und Antworten mit falschem Anfangsbuchstaben sind automatisch ungültig. Die Prüfrunde endet, wenn alle „Fertig geprüft“ getippt haben oder die Prüfzeit um ist. Danach zeigt die Rundentafel, was rausgeflogen ist, und nach 30 Sekunden startet die nächste Runde von selbst.
- **Lehrkraft:** Du entscheidest wie bisher an der Bühne Kategorie für Kategorie, die Kinder geben nur Daumen als Empfehlung.

## Saboteur

Alle steuern eine Figur durch das Schulhaus: auf dem Handy mit dem Daumen (irgendwo auf die Karte tippen und ziehen), am Laptop mit Pfeiltasten oder WASD, Leertaste für die passende Aktion.

- **Rollen:** Zu Beginn jeder Runde zeigt das Handy 6 Sekunden lang die eigene Rolle. Danach nur noch, solange man „Rolle“ gedrückt hält. Je 3 Mitspielende gibt es höchstens einen Saboteur.
- **Crew:** Läuft zu den gold leuchtenden Stationen und löst dort kleine Aufgaben (Tafel wischen, Kabel stecken, Zahlen ordnen, Schalter umlegen, Reihenfolge merken, Knopf halten). Jede Aufgabe füllt den gemeinsamen Balken.
- **Saboteure:** Sehen etwas weiter, tun nur so, als würden sie Aufgaben lösen, und können Mitspielende in der Nähe erwischen. Danach müssen sie eine Weile warten (Abklingzeit).
- **Erwischt:** An der Stelle bleibt ein Kreideumriss. Wer erwischt wurde, spielt als Geist weiter, geht durch Wände und erledigt weiter Aufgaben, darf aber nichts verraten.
- **Konferenz:** Wer einen Kreideumriss findet, meldet ihn. Oder jemand geht ins Sekretariat und macht eine Durchsage. Dann wird laut diskutiert und geheim auf dem Handy abgestimmt. Die meisten Stimmen fliegen raus, bei Gleichstand oder Überspringen niemand.
- **Sieg:** Die Crew gewinnt, wenn alle Aufgaben erledigt oder alle Saboteure rausgeworfen sind. Die Saboteure gewinnen, sobald sie genauso viele sind wie die übrige Crew. Das Siegerteam bekommt je 100 Punkte.
- **Bühne:** Am Beamer steht nie die Karte, sonst sähe jeder, wo die anderen sind. Dort stehen nur Fortschritt, Konferenzen und Ergebnisse. In der Regie zeigt „Saboteure zeigen (gedrückt halten)“ der Spielleitung, wer sabotiert.
- **Mitspielende:** ab 4, am schönsten mit 5 bis 12 pro Raum. Bei mehr lieber den Gruppenmodus nutzen. Wer mitten in einer Runde dazukommt, schaut als Geist zu und ist ab der nächsten Runde dabei.

Die Karte steht in `public/saboteur-karte.js`: Räume, Türen, Möbel und Stationen als Rechtecke in Kacheln. Server und Handy lesen dieselbe Datei.

## Die Partyspiele

Alle fünf werden in der Regie wie die anderen Spiele gewählt und eingestellt, auch im Gruppenmodus. „Lösung zeigen (gedrückt halten)“ in der Regie verrät der Spielleitung das geheime Wort, die Rollen oder die richtige Antwort, ohne dass es am Beamer steht.

- **Wer ist der Spion?** (ab 3): Karte gedrückt halten, um das Wort zu sehen. Der Spion sieht nur das Thema (abschaltbar). Nach der Fragezeit wird abgestimmt. Wird der Spion enttarnt, darf er das Wort raten. Er kann sich auch vorher selbst aufdecken, wenn er glaubt, das Wort zu kennen. Den Knopf dafür sehen alle, damit niemand am Bildschirm erkennt, wer Spion ist.
- **Werwolf** (ab 5, schön ab 8): Werwölfe, Seherin und Hexe (ab 6) sind einstellbar, die Zahl der Wölfe auch automatisch. Nachts sind alle Handys dunkel. Nur wer gerade dran ist, sieht Knöpfe. Ist eine Rolle nicht mehr im Spiel, dauert ihre Phase trotzdem ein paar Sekunden, damit niemand etwas merkt. Tote sehen alle Rollen und dürfen nichts verraten. Über „Erzählstimme“ auf der Bühne liest der Laptop die Erzählung vor.
- **Begriffe erklären** (ab 4): 2 bis 4 Teams, die zufällig gebildet werden. Die erklärende Person tippt „Richtig“ oder „Überspringen“. Die gegnerischen Teams sehen die Karte mit und drücken bei einem verbotenen Wort den Summer (−1). Jeder Punkt fürs Team zählt für alle Mitglieder 10 Punkte.
- **Stirnraten** (ab 2): Wer dran ist, tippt „Mit Kippen starten“ und hält das Handy quer an die Stirn. Das iPhone fragt dabei einmal nach der Erlaubnis für den Bewegungssensor. Alle anderen sehen das Wort auf ihrem Handy und können auch tippen. Die Bühne zeigt das Wort nie.
- **Quiz** (ab 1): Frage wird kurz angezeigt, dann erscheinen vier Antworten mit Farbe und Form. Bis zu 1000 Punkte je Frage, je schneller desto mehr, dazu ein Bonus für Serien. Eigene Fragen lassen sich in der Regie eintippen: `Frage | richtig | falsch | falsch | falsch`.

Neue Spiele kommen als zwei Dateien dazu: die Logik in `spiele/<name>.js` (in `server.js` unter `PARTY` eintragen) und die Anzeige in `public/party/<name>.js`.

## Bedienung in Kürze

- **Regieleiste:** Spiel wählen, Runden und Sekunden einstellen, starten, Runde überspringen, beenden. Pause (auch mit Taste `P`), Bild löschen, Chat leeren. „Wort zeigen“ zeigt das aktuelle Wort nur, solange der Knopf gedrückt ist, damit es nicht am Beamer steht.
- **Zeichnen und Raten:** Eine Runde bedeutet, dass ein Kind zeichnet. Bei 25 Kindern und 80 Sekunden dauern 10 Runden etwa 15 Minuten.
- **Stadt, Land, Fluss:** Standardmäßig prüfen die Kinder gegenseitig (siehe oben). Im Modus „Lehrkraft“ klickst du in der Auswertung an der Bühne auf „gültig“ oder „ungültig“.
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
spiele/saboteur.js     Logik Saboteur (Rollen, Bewegung, Sicht, Konferenzen)
spiele/werkzeuge.js    Vergleichsform für Wörter, Drosselung, Säubern von Eingaben
daten/woerter.json     Begriffslisten und Wortfilter
daten/kategorien.json  Kategorien
public/index.html      Beitritt und Spielansicht der Kinder (public/app.js)
public/lehrer.html     Bühne und Regie, unter /buehne rein passiv (public/lehrer.js)
public/gruppen.html    Gruppenregie für mehrere Räume (public/gruppen.js)
public/einstellungen.js  Spieleinstellungen, gemeinsam für Einzel- und Gruppenregie
public/gemeinsam.js    Zeichenfläche, Timer-Kreisbogen, Verbindung
public/qr.js           QR-Code-Erzeuger ohne fremde Bibliothek
public/saboteur.js     Saboteur auf dem Handy: Karte, Dunkelheit, Steuerung, Minispiele
public/saboteur-karte.js  Karte des Schulhauses, gemeinsam für Server und Browser
public/party.js        Rahmen für die Partyspiele (Handy, Bühne, Einstellungen)
public/party/*.js      Anzeige von Spion, Werwolf, Erklären, Stirnraten, Quiz
spiele/basis.js        Gemeinsame Grundlage der Partyspiele
spiele/spion.js, werwolf.js, erklaeren.js, stirnraten.js, quiz.js   Logik der Partyspiele
daten/erklaeren.json, daten/quiz.json   Karten und Fragen
public/stil.css        Gestaltung „Skizzenbuch“
```
