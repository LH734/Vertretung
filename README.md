# Spieleraum

Ein Spieleraum für Klassenfahrten, Ferienlager und Spieleabende: Die Spielleitung öffnet am Laptop einen Raum, alle treten mit Handy oder Tablet bei. Acht Spiele:

- **Zeichnen und Raten**: Eine Person zeichnet, alle anderen raten.
- **Stadt, Land, Fluss**: Alle schreiben gleichzeitig, ausgewertet wird gemeinsam.
- **Saboteur**: Im nächtlichen Schulhaus erledigt die Crew Aufgaben, heimliche Saboteure erwischen sie. In Konferenzen wird abgestimmt, wer rausfliegt.
- **Wer ist der Spion?**: Alle kennen dasselbe Wort (oder denselben Ort mit eigener Rolle), nur der Spion nicht. Reihum Stichworte oder Fragen, dann Abstimmung.
- **Werwolf**: Das Handy verteilt die Rollen (auch Jäger und Amor) und leitet Nacht und Tag. Die Bühne kann die Erzählung vorlesen.
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
| Spielleitung: Übersicht aller Räume | http://localhost:3000/gruppen |
| Spielleitung: Regie eines Raums (Bühne und Regie) | http://localhost:3000/lehrer |
| Mitspielende | http://localhost:3000/ |
| Zweiter Beamer, nur Anzeige | http://localhost:3000/buehne?code=ABCD |

Mit Passwort für den Bereich der Spielleitung lokal starten: `LEHRER_PASSWORT=meinPasswort npm start`. Ohne diese Variable ist er offen.

Im WLAN treten die Handys und Tablets über die IP-Adresse des Laptops bei, zum Beispiel `http://192.168.0.23:3000`. Der Port lässt sich mit `PORT=8080 npm start` ändern.

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
| `daten/orte.json` | Orte mit je sieben Rollen für den Orte-Modus von „Wer ist der Spion?“ |

Alle Dateien werden beim Serverstart gelesen. Schlüssel mit Unterstrich (`_anleitung`, `_hinweis`) sind Kommentare. Nach dem Bearbeiten neu starten (bei Render: Commit hochladen oder „Manual Deploy“). Ist die Datei fehlerhaft, zum Beispiel wegen eines fehlenden Kommas, bricht der Start mit einer deutschen Fehlermeldung ab.

Für eine einzelne Stunde geht es auch ohne Dateiänderung: In der Regieleiste gibt es Textfelder für eigene Begriffe und eigene Kategorien.

## Bereich der Spielleitung und Passwort

Auf der Startseite führt unten der Link „Für die Spielleitung: Raum öffnen“ zu `/lehrer`. Die Adressen `/lehrer` und die Variable `LEHRER_PASSWORT` heißen aus alter Gewohnheit noch so, damit bestehende Links und die Render-Einstellung weiter funktionieren. Ist `LEHRER_PASSWORT` gesetzt, fragt die Seite zuerst nach dem Passwort. Es steht nirgends im Code und landet nicht auf GitHub. Ändern kannst du es bei Render unter Environment, danach startet der Dienst neu.

- Lädst du den Lehrer-Tab neu, bleibt der Raum offen, ohne dass du das Passwort noch einmal eingeben musst.
- Nach 5 falschen Versuchen ist die Eingabe von diesem Netzwerk aus für eine Minute gesperrt. In einem gemeinsamen WLAN teilen sich oft alle Geräte eine Adresse. Probieren andere herum, kann das auch dich kurz aussperren. Ein bereits offener Raum läuft davon unberührt weiter.
- Die passive Bühne unter `/buehne?code=ABCD` braucht kein Passwort, weil sie nur anzeigt.

## Selbst mitspielen: Leitung auf dem Handy

Wer den Raum öffnet, muss nicht am Laptop sitzen bleiben. In der Regie auf „Selbst mitspielen (auf diesem Gerät)“ tippen und einen Spitznamen eingeben. Dann spielst du ganz normal mit und hast unten den Knopf „Leitung“. Darüber gibt es Spielwahl, Einstellungen, Start, Weiter, Pause, Beenden und den Spieleabend. Lösungen und Rollen der anderen siehst du dort bewusst nicht. „Zur großen Regie“ bringt dich zurück zu Spielerliste, Teams und Bühne.

## Spieleabend

Unter „Spieleabend“ in der Regie (oder in der Leitungs-Leiste) schaltest du eine Gesamtwertung über mehrere Spiele ein, zum Beispiel für eine Spieleolympiade.

- Nach jedem fertig gespielten Spiel gibt es Abendpunkte nach Platz: 10, 8, 6, 5, 4, 3, 2, danach 1 für alle, die mitgespielt haben. Abgebrochene Spiele zählen nicht.
- Die Spielpunkte starten bei jedem Spiel wieder bei null, die Abendpunkte bleiben stehen.
- In der Lobby sehen alle den Zwischenstand und welches Spiel als Nächstes kommt.
- „Siegerehrung“ zeigt allen das Podest. „Neu beginnen“ setzt die Abendwertung zurück.

## Regeln, Töne und Bildschirm

- **Regeln:** Oben auf dem Handy und in der Regie gibt es „Regeln“ mit einer kurzen Erklärung des gewählten Spiels. Über „Regeln an alle“ zeigt die Regie die Erklärung groß auf der Bühne.
- **Töne:** Kurze Klänge für Rundenstart, die letzten Sekunden, richtig und falsch. Sie werden im Browser erzeugt, es gibt keine Tondateien. Mit dem Lautsprecher-Knopf lassen sie sich pro Gerät abschalten.
- **Bildschirm bleibt an:** Während eines Spiels bitten Handy und Laptop den Browser, den Bildschirm nicht abzuschalten. Das klappt in aktuellen Browsern, bei älteren Geräten eventuell nicht.

## Räume: einer oder mehrere

„Raum öffnen“ auf der Startseite führt in die Übersicht (`/gruppen`). Sie startet mit einem Raum („Fuchs“). Werden es zu viele Leute, kommt mit „+ Raum dazu“ ein weiterer dazu (Eule, Dachs, Igel …, höchstens 10). Neue Räume übernehmen die Einstellungen des ersten Raums.

- **Karte eines Raums:** Code und QR-Code, Starten, Pause, Weiter, Beenden, „Regie“ (volle Regie mit Spielerliste, Teams und Bühne, zurück über „← Alle Räume“), „Bühne“ für einen Beamer, „Schließen“ (wer drin ist, wandert in einen anderen Raum).
- **Leute verschieben:** Namen auf einer Karte antippen, dann im Zielraum auf „… hierher“. Das Handy wechselt sofort mit. Auch wer gerade offline ist, landet beim Wiederkommen im neuen Raum. Nur die Spielleitung kann verschieben.
- **Alle Räume:** starten, pausieren, überspringen, beenden. Die Spieleinstellungen rechts gelten für alle Räume.
- Aus einer Einzelregie (`/lehrer`) heraus geht es auch: „+ Weiteren Raum dazu“ nimmt den Raum mit allen Leuten in eine Übersicht mit.
- Lädst du den Tab neu, bleiben alle Räume erhalten.

## Freischalten und Abstimmen

Jedes Spiel kennt seine Mindestzahl (Quiz und Stadt, Land, Fluss ab 1, Zeichnen, Stirnraten, Bluffwürfel, Vier in einer Reihe, Schiffe versenken und Waldspiel ab 2, Spion, Mäxchen und Eroberungsspiel ab 3, Saboteur und Erklären ab 4, Werwolf ab 5). Waldspiel und Eroberungsspiel gehen mit höchstens 6 und sind darüber gesperrt. In der Spielwahl der Regie tragen Spiele, für die noch Leute fehlen, ein Schraffur-Feld mit „ab 5 · noch 2“. Kommt jemand dazu, ist das Spiel sofort frei. Die Mindestzahl stammt aus derselben Prüfung wie der Start, ändert sich also mit den Einstellungen (z. B. Erklären mit 3 Teams: ab 6).

**Abstimmung (wie Autoplay):** Unter „Nächstes Spiel“ schaltest du zwischen „Leitung wählt“ und „Alle stimmen ab“. Ist die Abstimmung an, sehen alle nach dem Ergebnis etwa 8 Sekunden die Punkte, dann erscheint auf jedem Handy und auf der Bühne die Wahl unter allen freigeschalteten Spielen. Nach 30 Sekunden, oder sobald alle gewählt haben, startet das Gewinnerspiel von selbst. Bei Gleichstand entscheidet das Los. Die Leitung kann jederzeit „Jetzt abstimmen lassen“, „Sofort auswerten“ oder „Abbrechen“. In der Übersicht gilt der Schalter für alle Räume, jeder Raum stimmt für sich ab.

## Stadt, Land, Fluss: Prüfen

Unter „Prüfen“ in den Einstellungen wählst du, wer die Antworten bewertet.

- **Alle stimmen ab (Standard):** Nach jeder Schreibrunde kommt eine Prüfrunde. Alle sehen auf dem Handy die Antworten der anderen, ohne Namen, und tippen bei unpassenden auf „stimmt nicht“. Sind mehr als die Hälfte der anderen dagegen, fliegt die Antwort raus. Bei genau der Hälfte bleibt sie stehen. Gleiche Antworten werden zusammengefasst und gemeinsam bewertet. Leere Felder und Antworten mit falschem Anfangsbuchstaben sind automatisch ungültig. Die Prüfrunde endet, wenn alle „Fertig geprüft“ getippt haben oder die Prüfzeit um ist. Danach zeigt die Rundentafel, was rausgeflogen ist, und nach 30 Sekunden startet die nächste Runde von selbst.
- **Spielleitung:** Du entscheidest an der Bühne Kategorie für Kategorie, die anderen geben nur Daumen als Empfehlung.

## Saboteur

Alle steuern eine Figur durch das Schulhaus: auf dem Handy mit dem Daumen (irgendwo auf die Karte tippen und ziehen), am Laptop mit Pfeiltasten oder WASD, Leertaste für die passende Aktion.

- **Rollen:** Zu Beginn jeder Runde zeigt das Handy 6 Sekunden lang die eigene Rolle. Danach nur noch, solange man „Rolle“ gedrückt hält. Je 3 Mitspielende gibt es höchstens einen Saboteur.
- **Crew:** Läuft zu den gold leuchtenden Stationen und löst dort kleine Aufgaben (Tafel wischen, Kabel stecken, Zahlen ordnen, Schalter umlegen, Reihenfolge merken, Knopf halten). Jede Aufgabe füllt den gemeinsamen Balken.
- **Saboteure:** Sehen etwas weiter, tun nur so, als würden sie Aufgaben lösen, und können Mitspielende in der Nähe erwischen. Danach müssen sie eine Weile warten (Abklingzeit).
- **Erwischt:** An der Stelle bleibt ein Kreideumriss. Wer erwischt wurde, spielt als Geist weiter, geht durch Wände und erledigt weiter Aufgaben, darf aber nichts verraten.
- **Sabotagen** (abschaltbar): Saboteure können „Licht aus“ auslösen, dann sieht die Crew kaum noch etwas, bis jemand am Hauptschalter im Werkraum repariert. Oder „Feueralarm“: Dann müssen innerhalb von 45 Sekunden beide Alarmknöpfe (Lehrerzimmer und Turnhalle) gedrückt werden, sonst gewinnen die Saboteure. Während einer Sabotage gibt es keine Durchsage. Nach einer Sabotage müssen die Saboteure 30 Sekunden warten.
- **Geheime Gänge** (abschaltbar): Drei Gänge verbinden Klassenzimmer und Toiletten, Bibliothek und Küche, Musikraum und Werkraum. Nur Saboteure können hindurchschlüpfen.
- **Konferenz:** Wer einen Kreideumriss findet, meldet ihn. Oder jemand geht ins Sekretariat und macht eine Durchsage. Dann wird laut diskutiert und geheim auf dem Handy abgestimmt. Die meisten Stimmen fliegen raus, bei Gleichstand oder Überspringen niemand.
- **Sieg:** Die Crew gewinnt, wenn alle Aufgaben erledigt oder alle Saboteure rausgeworfen sind. Die Saboteure gewinnen, sobald sie genauso viele sind wie die übrige Crew. Das Siegerteam bekommt je 100 Punkte.
- **Bühne:** Am Beamer steht nie die Karte, sonst sähe jeder, wo die anderen sind. Dort stehen nur Fortschritt, Konferenzen und Ergebnisse. In der Regie zeigt „Saboteure zeigen (gedrückt halten)“ der Spielleitung, wer sabotiert.
- **Mitspielende:** ab 4, am schönsten mit 5 bis 12 pro Raum. Bei mehr lieber einen zweiten Raum dazunehmen. Wer mitten in einer Runde dazukommt, schaut als Geist zu und ist ab der nächsten Runde dabei.

Die Karte steht in `public/saboteur-karte.js`: Räume, Türen, Möbel und Stationen als Rechtecke in Kacheln. Server und Handy lesen dieselbe Datei.

## Die Partyspiele

Alle sieben werden in der Regie wie die anderen Spiele gewählt und eingestellt, auch in der Übersicht für alle Räume. „Lösung zeigen (gedrückt halten)“ in der Regie verrät der Spielleitung das geheime Wort, die Rollen oder die richtige Antwort, ohne dass es am Beamer steht.

- **Wer ist der Spion?** (ab 3): Karte gedrückt halten, um das Wort zu sehen. Der Spion sieht nur das Thema (abschaltbar). Im Modus „Ort mit Rollen“ sind alle am selben Ort (zum Beispiel Zeltlager oder Piratenschiff) und haben dort eine eigene Rolle. Reihum stellt man sich Fragen. Alle sehen die Liste der möglichen Orte, der Spion tippt beim Raten einfach einen davon an. Nach der Fragezeit wird abgestimmt. Wird der Spion enttarnt, darf er das Wort raten. Er kann sich auch vorher selbst aufdecken, wenn er glaubt, das Wort zu kennen. Den Knopf dafür sehen alle, damit niemand am Bildschirm erkennt, wer Spion ist.
- **Werwolf** (ab 5, schön ab 8): Werwölfe, Seherin, Hexe (ab 6), Jäger (ab 6) und Amor (ab 8) sind einstellbar, die Zahl der Wölfe auch automatisch. Amor verliebt in der ersten Nacht zwei Personen, die sich danach gegenseitig kennen. Stirbt eine, stirbt die andere vor Kummer. Bleiben nur die beiden übrig, gewinnt das Liebespaar. Stirbt der Jäger, darf er noch jemanden mitnehmen. Nachts sind alle Handys dunkel. Nur wer gerade dran ist, sieht Knöpfe. Ist eine Rolle nicht mehr im Spiel, dauert ihre Phase trotzdem ein paar Sekunden, damit niemand etwas merkt. Tote sehen alle Rollen und dürfen nichts verraten. Über „Erzählstimme“ auf der Bühne liest der Laptop die Erzählung vor.
- **Begriffe erklären** (ab 4): 2 bis 4 Teams, die zufällig gebildet werden. Die erklärende Person tippt „Richtig“ oder „Überspringen“. Die gegnerischen Teams sehen die Karte mit und drücken bei einem verbotenen Wort den Summer (−1). Jeder Punkt fürs Team zählt für alle Mitglieder 10 Punkte.
- **Stirnraten** (ab 2): Wer dran ist, tippt „Mit Kippen starten“ und hält das Handy quer an die Stirn. Das iPhone fragt dabei einmal nach der Erlaubnis für den Bewegungssensor. Alle anderen sehen das Wort auf ihrem Handy und können auch tippen. Die Bühne zeigt das Wort nie.
- **Quiz** (ab 1): Frage wird kurz angezeigt, dann erscheinen vier Antworten mit Farbe und Form. Bis zu 1000 Punkte je Frage, je schneller desto mehr, dazu ein Bonus für Serien. Eigene Fragen lassen sich in der Regie eintippen: `Frage | richtig | falsch | falsch | falsch`.
- **Mäxchen** (ab 3, schön mit 4 bis 10): Wer dran ist, sieht den eigenen Wurf auf dem Handy und tippt eine Ansage an, die höher sein muss als die davor. Der ehrliche Wert ist gelb markiert, alles andere ist ein Bluff. Die nächste Person tippt „Glaub ich“ (und würfelt selbst weiter) oder „Aufdecken!“. Ein angesagtes Mäxchen zu glauben kostet ein Leben, ein echtes anzuzweifeln zwei. Einstellbar: Leben (1 bis 6) und Sekunden pro Zug. Läuft die Zeit ab, wird ehrlich angesagt (oder die kleinste mögliche Lüge) bzw. geglaubt.
- **Bluffwürfel** (ab 2, schön mit 3 bis 6): Alle würfeln verdeckt mit ihren Würfeln (2 bis 6 pro Person). Reihum wird geboten, z. B. „4 × Fünfen“ für den ganzen Tisch. Wer nicht höher bieten will, ruft „Lüge!“. Dann deckt die Bühne alle Würfel auf, die passenden leuchten gelb. Wer falsch lag, gibt einen Würfel ab. Statt der Sechs zeigt jeder Würfel einen Stern. Mit „Sterne sind Joker“ zählt der Stern bei jeder Zahl mit, und man kann auch nur auf Sterne bieten: Ein Stern-Gebot zählt doppelt, wie auf dem Spielbrett mit den Sternfeldern zwischen den Zahlen. Eine Gebotsleiste zeigt, wo man gerade steht. Das Handy zeigt beim Bieten, wie viele man selbst hat und wie viele ungefähr zu erwarten sind.

Bei beiden Würfelspielen bekommen alle, die noch dabei sind, 10 Punkte, wenn jemand ausscheidet. Wer als Letztes übrig bleibt, bekommt 30 dazu. Die Regie sieht über „Lösung zeigen“ den echten Wurf bzw. wie viele Würfel wirklich auf dem Tisch liegen.

## Turniere zu zweit

- **Vier in einer Reihe** (ab 2): Spalte antippen, der Stein fällt nach unten. Vier in einer Linie gewinnt (waagerecht, senkrecht, schräg). Einstellbar: Turnierrunden (1 bis 9) und Sekunden pro Zug.
- **Schiffe versenken** (ab 2): Die Flotte wird zufällig aufgestellt und kann neu gemischt werden, Schiffe berühren sich nie. Dann wird abwechselnd aufs fremde Meer geschossen. Ein versenktes Schiff deckt das Wasser drumherum auf. Einstellbar: Meer 8 × 8 (5 Schiffe, schnell) oder 10 × 10 (6 Schiffe), „Nach einem Treffer nochmal“, Turnierrunden und Sekunden pro Schuss.

Beide laufen als Turnier nach dem **Schweizer System**: Alle spielen gleichzeitig zu zweit auf ihren Handys. Nach jeder Runde gibt es neue Paare. Wer gleich viele Punkte hat, spielt gegeneinander, niemand zweimal gegen dieselbe Person, und niemand scheidet aus. Bei einer ungeraden Zahl bekommt jede Runde jemand anderes ein Freilos. Sieg 2 Turnierpunkte, Unentschieden 1, Freilos 2; bei Gleichstand zählt die Stärke der bisherigen Gegner (Buchholz). In der Rangliste des Raums stehen 10 Punkte pro Turnierpunkt. Wer später kommt, steigt in der nächsten Runde ein. Zwischen den Runden zeigt ein Zwischenstand die Tabelle. Die Bühne zeigt alle laufenden Partien und die Tabelle. „Weiter“ macht in jeder Partie einen Zug für die Person, die dran ist.

## Die großen Spiele

- **Waldspiel** (2 bis 6): Alle bauen einen eigenen Wald. Wer dran ist, nimmt zwei Karten (vom Stapel oder offen aus der Lichtung) oder spielt eine aus. Jede Karte kostet 0 bis 3 andere Handkarten, die offen in die Lichtung wandern. Bei 10 Karten wird die Lichtung geräumt. Bäume (Birke, Buche, Fichte, Linde, Eiche, Ahorn) kommen neu in den Wald. Tiere brauchen einen freien Platz an einem eigenen Baum: Vögel und Fledermäuse in die Krone, Pilz, Igel, Hase und Fuchs an den Boden, Hirsch, Wildschwein, Schmetterling und Wolf an den Stamm. Jede Karte zählt nach ihrer eigenen Regel, die Punkte werden laufend angezeigt. Einstellbar: Züge pro Person (6 bis 30) und Sekunden pro Zug. Läuft die Zeit ab, nimmt das Spiel zwei Karten vom Stapel.
- **Eroberungsspiel** (3 bis 6): Eine Insel aus 24 Ländern in sechs Gegenden, gezeichnet als Sechsecke, mit drei Seewegen. Die Länder werden verteilt. Wer dran ist, verstärkt (mindestens 3, mehr bei vielen Ländern und für ganze Gegenden), greift Nachbarländer an (Angriff bis 3, Abwehr bis 2 Würfel; einmal würfeln oder „Bis zum Ende“) und darf am Ende einmal zwischen verbundenen eigenen Ländern verschieben. Wer in einem Zug erobert, bekommt einen Stern, drei Sterne bringen 5 Extra-Truppen. Nach den eingestellten Runden (3 bis 20) gewinnt, wer die meisten Länder hat. Punkte: 5 pro Land, 10 extra für den Sieg (bei gleich vielen Ländern entscheiden die Truppen), dazu 10 für alle Übrigen, wenn jemand ausscheidet. Läuft die Zeit ab, werden restliche Truppen an die Grenze gesetzt und der Zug endet. Wer offline ist, wird nach 8 Sekunden übersprungen.

Beide großen Spiele gehen mit höchstens 6 Personen. Bei mehr Leuten in der Übersicht einen zweiten Raum dazunehmen.

Neue Spiele kommen als zwei Dateien dazu: die Logik in `spiele/<name>.js` (in `server.js` unter `PARTY` eintragen) und die Anzeige in `public/party/<name>.js`.

## Bedienung in Kürze

- **Regieleiste:** Spiel wählen, Runden und Sekunden einstellen, starten, Runde überspringen, beenden. Pause (auch mit Taste `P`), Bild löschen, Chat leeren. „Wort zeigen“ zeigt das aktuelle Wort nur, solange der Knopf gedrückt ist, damit es nicht am Beamer steht.
- **Zeichnen und Raten:** Eine Runde bedeutet, dass eine Person zeichnet. Bei 25 Mitspielenden und 80 Sekunden dauern 10 Runden etwa 15 Minuten.
- **Stadt, Land, Fluss:** Standardmäßig prüfen sich alle gegenseitig (siehe oben). Im Modus „Spielleitung“ klickst du in der Auswertung an der Bühne auf „gültig“ oder „ungültig“.
- **Spieler:** umbenennen (Stift), stummschalten (Lautsprecher; Stummgeschaltete können weiter raten, ihre Nachrichten sieht aber niemand), entfernen (Kreuz).
- **Teams:** Unter „Wertung“ auf Teams umschalten. Wer kein Team hat, wird beim Start gleichmäßig verteilt.
- **Wiederverbindung:** Schläft ein Tablet ein oder wird die Seite neu geladen, kommt man automatisch auf seinen Platz zurück, mit Punkten und dem bisherigen Bild. Auch die Spielleitung kann ihren Tab neu laden.

## Datenschutz

Es wird nichts gespeichert und nichts protokolliert. Mitspielende geben nur einen Spitznamen ein. Cookies setzt die Anwendung nicht. Die Wiederverbindung nutzt `sessionStorage` im jeweiligen Browser-Tab, das beim Schließen des Tabs verschwindet. Nur die Einstellungen „Töne aus“ und „Erzählstimme“ merkt sich der Browser dauerhaft (`localStorage`).

Hinweis: Die Schriften werden von Google Fonts geladen. Dabei sieht Google die IP-Adresse der Geräte. Sollte das nicht gewünscht sein, können die beiden Schriftdateien auch im Ordner `public` abgelegt und dort eingebunden werden.

## Tests

Die Tests starten den Server auf einem freien Port und spielen alle Spiele mit simulierten Handys durch (etwa 280 Prüfungen, gut drei Minuten):

```bash
npm install
npm test
```

Einzeln geht es mit `node test/lauf.js party` (oder `grundspiele`, `saboteur`, `abend`, `alle`, `arena`, `wuerfel`, `brett`). Mit `LAUT=1` davor wird jede Prüfung angezeigt. Für die Tests wird `socket.io-client` gebraucht, der als Entwicklungsabhängigkeit eingetragen ist. Render installiert ihn mit, genutzt wird er dort nicht.

## Aufbau

```
server.js              Express, socket.io, Räume, Rollen, Regie
spiele/zeichnen.js     Logik Zeichnen und Raten
spiele/slf.js          Logik Stadt, Land, Fluss
spiele/saboteur.js     Logik Saboteur (Rollen, Bewegung, Sicht, Konferenzen)
spiele/werkzeuge.js    Vergleichsform für Wörter, Drosselung, Säubern von Eingaben
daten/woerter.json     Begriffslisten und Wortfilter
daten/kategorien.json  Kategorien
public/index.html      Beitritt und Spielansicht der Mitspielenden (public/app.js)
public/lehrer.html     Bühne und Regie, unter /buehne rein passiv (public/lehrer.js)
public/gruppen.html    Übersicht: ein oder mehrere Räume (public/gruppen.js)
public/einstellungen.js  Spieleinstellungen, gemeinsam für Einzel- und Gruppenregie
public/gemeinsam.js    Zeichenfläche, Timer-Kreisbogen, Verbindung
public/qr.js           QR-Code-Erzeuger ohne fremde Bibliothek
public/saboteur.js     Saboteur auf dem Handy: Karte, Dunkelheit, Steuerung, Minispiele
public/saboteur-karte.js  Karte des Schulhauses, gemeinsam für Server und Browser
public/party.js        Rahmen für die Partyspiele (Handy, Bühne, Einstellungen)
public/party/*.js      Anzeige von Spion, Werwolf, Erklären, Stirnraten, Quiz, Mäxchen, Bluffwürfel,
                       Vier in einer Reihe, Schiffe versenken, Waldspiel, Eroberungsspiel
public/party/turnier.js  Tabelle, Freilos und Partienliste für die Turniere
spiele/basis.js        Gemeinsame Grundlage der Partyspiele
spiele/spion.js, werwolf.js, erklaeren.js, stirnraten.js, quiz.js, maexchen.js, bluff.js   Logik der Partyspiele
spiele/turnier.js      Turnier nach dem Schweizer System für Zwei-Personen-Spiele
spiele/vier.js, schiffe.js   Vier in einer Reihe, Schiffe versenken (als Turnier)
spiele/wald.js, eroberung.js   Waldspiel, Eroberungsspiel
daten/erklaeren.json, daten/quiz.json   Karten und Fragen
public/regeln.js       Kurze Spielregeln für Handy und Bühne
public/toene.js        Klänge, im Browser erzeugt
public/leitung.js      Leitungs-Leiste auf dem Handy
daten/orte.json        Orte und Rollen für den Spion
test/                  Automatische Tests (npm test)
public/stil.css        Gestaltung „Skizzenbuch“
```
