/* Kurze Spielregeln für alle Spiele. Erscheinen auf dem Handy („Regeln“) und auf Wunsch auf der Bühne. */
(function () {
  'use strict';

  const REGELN = {
    zeichnen: {
      titel: 'Zeichnen und Raten',
      ziel: 'Eine Person zeichnet, alle anderen raten den Begriff.',
      schritte: [
        'Wer dran ist, wählt einen von drei Begriffen und zeichnet ihn. Buchstaben und Zahlen sind verboten.',
        'Alle anderen tippen ihre Tipps ins Ratefeld. Falsche Tipps sehen alle, ein richtiger bleibt geheim.',
        'Nach der Hälfte der Zeit wird ein Buchstabe verraten, nach drei Vierteln noch einer.',
      ],
      punkte: 'Wer schnell richtig rät, bekommt mehr Punkte. Die zeichnende Person bekommt Punkte für jede Person, die es errät.',
    },
    slf: {
      titel: 'Stadt, Land, Fluss',
      ziel: 'Zu jeder Kategorie ein Wort mit dem gezogenen Anfangsbuchstaben finden.',
      schritte: [
        'Ein Buchstabe wird gezogen, alle schreiben gleichzeitig.',
        'Je nach Einstellung endet die Runde nach Zeit oder wenn jemand „Stopp“ ruft. Dann bleiben noch 10 Sekunden.',
        'Danach prüfen alle die Antworten der anderen, oder die Spielleitung entscheidet.',
      ],
      punkte: '20 Punkte, wenn nur du eine gültige Antwort hast. 10 für eine eigene Antwort, 5 wenn jemand dasselbe hat.',
    },
    saboteur: {
      titel: 'Saboteur',
      ziel: 'Die Crew erledigt Aufgaben im nächtlichen Schulhaus. Heimliche Saboteure versuchen, alle zu erwischen.',
      schritte: [
        'Steuern: auf die Karte tippen und mit dem Daumen ziehen. Gold leuchtende Stationen sind deine Aufgaben.',
        'Saboteure erwischen Mitspielende, lösen Sabotagen aus und schleichen durch geheime Gänge.',
        'Wer einen Kreideumriss findet, meldet ihn. Oder jemand macht im Sekretariat eine Durchsage. Dann wird diskutiert und abgestimmt.',
        'Wer erwischt wurde, spielt als Geist weiter und erledigt Aufgaben, darf aber nichts verraten.',
      ],
      punkte: 'Die Crew gewinnt, wenn alle Aufgaben erledigt oder alle Saboteure rausgeworfen sind. Die Saboteure gewinnen, wenn sie genauso viele sind wie die Crew oder ein Alarm nicht rechtzeitig gelöst wird.',
    },
    spion: {
      titel: 'Wer ist der Spion?',
      ziel: 'Alle kennen dasselbe Geheimnis, nur der Spion nicht. Findet ihn!',
      schritte: [
        'Karte gedrückt halten: Dort steht das Wort oder der Ort. Der Spion sieht nur „Du bist der Spion“.',
        'Reihum sagt jede Person ein Stichwort oder stellt eine Frage. Nicht zu deutlich, sonst errät der Spion alles.',
        'Danach stimmen alle ab, wer der Spion ist.',
        'Wird der Spion enttarnt, darf er noch raten. Er kann sich auch vorher selbst verraten, wenn er glaubt, das Geheimnis zu kennen.',
      ],
      punkte: 'Entkommt der Spion, bekommt er 200 Punkte. Errät er das Geheimnis, 150. Sonst bekommen alle anderen je 100.',
    },
    werwolf: {
      titel: 'Werwolf',
      ziel: 'Das Dorf muss die Werwölfe finden, bevor sie alle erwischen.',
      schritte: [
        'Jede Person bekommt geheim eine Rolle: Werwolf, Dorfbewohner oder eine Sonderrolle.',
        'Nachts schließen alle die Augen. Nur wer gerade dran ist, handelt leise auf dem Handy: Werwölfe wählen ein Opfer, die Seherin schaut nach, die Hexe hat zwei Tränke.',
        'Tagsüber wird diskutiert und abgestimmt, wer das Dorf verlassen muss.',
        'Der Jäger nimmt beim Sterben jemanden mit. Amor verliebt zwei Personen: Stirbt eine, stirbt die andere vor Kummer.',
        'Wer tot ist, schweigt und schaut zu.',
      ],
      punkte: 'Das Dorf gewinnt, wenn alle Werwölfe tot sind. Die Werwölfe gewinnen, wenn sie genauso viele sind wie die anderen.',
    },
    erklaeren: {
      titel: 'Begriffe erklären',
      ziel: 'Deinem Team möglichst viele Begriffe erklären, ohne die verbotenen Wörter zu sagen.',
      schritte: [
        'Die Teams sind abwechselnd dran. Eine Person erklärt, der Rest des Teams rät laut.',
        'Keine Gesten, kein Buchstabieren, kein Teil des Wortes.',
        'Die anderen Teams sehen die Karte mit. Fällt ein verbotenes Wort, drücken sie den Summer.',
      ],
      punkte: 'Jeder erratene Begriff bringt dem Team einen Punkt, jedes verbotene Wort kostet einen.',
    },
    stirnraten: {
      titel: 'Stirnraten',
      ziel: 'Errate möglichst viele Begriffe, die auf deiner Stirn stehen.',
      schritte: [
        'Wer dran ist, hält das Handy quer an die Stirn, der Bildschirm zeigt nach außen.',
        'Die anderen erklären, machen vor oder summen. Das Wort sehen sie auch auf ihrem eigenen Handy.',
        'Handy nach vorn kippen heißt „richtig“, nach hinten „weiter“. Die anderen können auch tippen.',
      ],
      punkte: 'Jeder erratene Begriff bringt 10 Punkte.',
    },
    quiz: {
      titel: 'Quiz',
      ziel: 'Fragen möglichst schnell richtig beantworten.',
      schritte: [
        'Erst erscheint die Frage, kurz danach die vier Antworten mit Farbe und Form.',
        'Tippe auf deinem Handy die richtige Antwort an. Du kannst nur einmal antworten.',
      ],
      punkte: 'Bis zu 1000 Punkte pro Frage, je schneller, desto mehr. Mehrere richtige Antworten hintereinander geben einen Bonus.',
    },
    maexchen: {
      titel: 'Mäxchen',
      ziel: 'Würfeln, ansagen, bluffen. Wer beim Lügen erwischt wird oder falsch zweifelt, verliert ein Leben.',
      schritte: [
        'Wer dran ist, würfelt mit zwei Würfeln. Den Wurf sieht nur diese Person auf dem Handy.',
        'Die größere Zahl kommt nach vorn: 5 und 3 sind 53. Darüber stehen die Pasche (11 bis 66), ganz oben das Mäxchen (2 und 1).',
        'Du sagst einen Wert an, der höher sein muss als die Ansage davor. Ob er stimmt, ist deine Sache.',
        'Die nächste Person glaubt dir und würfelt selbst weiter, oder sie deckt auf.',
        'Beim Aufdecken verliert, wer gelogen hat. Hat die Ansage gestimmt, verliert, wer gezweifelt hat.',
        'Ein angesagtes Mäxchen zu glauben kostet sofort ein Leben. Ein echtes Mäxchen anzuzweifeln kostet zwei.',
      ],
      punkte: 'Scheidet jemand aus, bekommen alle, die noch dabei sind, 10 Punkte. Wer als Letztes übrig bleibt, bekommt 30 dazu.',
    },
    bluff: {
      titel: 'Bluffwürfel',
      ziel: 'Schätzen und bluffen: Wie viele Würfel einer Augenzahl liegen insgesamt auf dem Tisch?',
      schritte: [
        'Alle würfeln gleichzeitig. Die eigenen Würfel sieht man nur auf dem eigenen Handy.',
        'Reihum wird geboten, zum Beispiel „vier Fünfen“: Auf dem ganzen Tisch liegen mindestens vier Fünfen.',
        'Jedes Gebot muss höher sein: mehr Würfel, oder gleich viele mit höherer Zahl.',
        'Statt der Sechs hat jeder Würfel einen Stern. Mit Jokern zählt der Stern bei jeder Zahl mit.',
        'Man darf auch nur auf Sterne bieten. Ein Stern-Gebot zählt doppelt: Nach „fünf Vieren“ reichen drei Sterne. Zurück zu Zahlen braucht es mehr als doppelt so viele, nach drei Sternen also sieben.',
        'Wer dem Gebot nicht traut, ruft „Lüge!“. Alle Würfel werden aufgedeckt. Wer falsch lag, gibt einen Würfel ab.',
        'Ohne Würfel ist man raus. Wer als Letztes noch Würfel hat, gewinnt.',
      ],
      punkte: 'Scheidet jemand aus, bekommen alle, die noch dabei sind, 10 Punkte. Wer als Letztes übrig bleibt, bekommt 30 dazu.',
    },
    vier: {
      titel: 'Vier in einer Reihe',
      ziel: 'Als Erstes vier eigene Steine in eine Linie bringen: waagerecht, senkrecht oder schräg.',
      schritte: [
        'Gespielt wird als Turnier: Alle spielen gleichzeitig zu zweit auf ihren Handys.',
        'Wer dran ist, tippt eine Spalte an. Der Stein fällt bis ganz nach unten.',
        'Ist das Brett voll und niemand hat vier, ist es unentschieden.',
        'Nach jeder Runde gibt es neue Paare: Wer gleich viele Punkte hat, spielt gegeneinander, niemand zweimal gegen dieselbe Person. Niemand scheidet aus.',
        'Bei einer ungeraden Zahl hat jede Runde jemand ein Freilos.',
      ],
      punkte: 'Sieg 2 Turnierpunkte, Unentschieden 1, Freilos 2. Bei Gleichstand zählt, wie stark die bisherigen Gegner waren.',
    },
    schiffe: {
      titel: 'Schiffe versenken',
      ziel: 'Alle Schiffe der anderen Seite finden und versenken, bevor es mit den eigenen passiert.',
      schritte: [
        'Gespielt wird als Turnier: Alle spielen gleichzeitig zu zweit auf ihren Handys.',
        'Deine Flotte wird zufällig aufgestellt. Gefällt sie dir nicht, mische neu. Dann tippe „Bereit!“.',
        'Abwechselnd tippt ihr ein Feld im fremden Meer an. Wasser ist ein Punkt, ein Treffer ein Kreuz.',
        'Nach einem Treffer darfst du nochmal (wenn eingestellt). Ist ein Schiff versenkt, wird das Wasser drumherum aufgedeckt, denn Schiffe berühren sich nie.',
        'Nach jeder Runde gibt es neue Paare, niemand scheidet aus.',
      ],
      punkte: 'Sieg 2 Turnierpunkte, Freilos 2. Bei Gleichstand zählt, wie stark die bisherigen Gegner waren.',
    },
    wald: {
      titel: 'Waldspiel',
      ziel: 'Den wertvollsten Wald bauen: Bäume pflanzen und Tiere ansiedeln, die gut zusammenpassen.',
      schritte: [
        'Wer dran ist, macht eins von beidem: zwei Karten nehmen (vom Stapel oder offen aus der Lichtung) oder eine Karte ausspielen.',
        'Jede Karte kostet 0 bis 3 andere Karten aus deiner Hand. Diese Karten wandern offen in die Lichtung. Hat die Lichtung 10 Karten, wird sie geräumt.',
        'Ein Baum kommt neu in deinen Wald. Ein Tier braucht einen freien Platz an einem eigenen Baum: Vögel und Fledermäuse oben in der Krone, Pilze und Bodentiere unten, große Tiere und Schmetterlinge seitlich am Stamm.',
        'Pilz und Wolf lassen dich sofort Karten nachziehen.',
        'Höchstens 10 Karten auf der Hand. Nach den eingestellten Zügen ist Schluss.',
      ],
      punkte: 'Jede Karte zählt nach der Regel, die auf ihr steht. Die Punkte werden laufend angezeigt.',
    },
    eroberung: {
      titel: 'Eroberungsspiel',
      ziel: 'Möglichst viele Länder der Insel erobern.',
      schritte: [
        'Die Länder werden zu Beginn verteilt. Wer dran ist, verstärkt zuerst: mindestens 3 Truppen, mehr bei vielen Ländern und für jede ganz gehaltene Gegend.',
        'Dann greifst du Nachbarländer an (gestrichelte Linien sind Seewege). Angriff würfelt mit bis zu 3, Abwehr mit bis zu 2 Würfeln. Die höchsten werden verglichen, bei Gleichstand gewinnt die Abwehr.',
        'Ist ein Land leer, gehört es dir und Truppen rücken nach. Eine Truppe muss immer im Land bleiben, aus dem du angreifst.',
        'Zum Schluss darfst du einmal Truppen zwischen verbundenen eigenen Ländern verschieben.',
        'Wer in einem Zug erobert, bekommt einen Stern. Drei Sterne bringen 5 Extra-Truppen.',
        'Nach den eingestellten Runden gewinnt, wer die meisten Länder hat.',
      ],
      punkte: '5 Punkte pro Land, 10 extra für den Sieg. Scheidet jemand aus, bekommen alle Übrigen 10 Punkte. Bei gleich vielen Ländern gewinnt, wer mehr Truppen hat.',
    },
  };

  const esc = (t) => window.Gemeinsam.esc(t);

  function html(art, gross) {
    const r = REGELN[art];
    if (!r) return '';
    return `<div class="regeln ${gross ? 'gross' : ''}"><h2>${esc(r.titel)}</h2><p class="regeln-ziel">${esc(r.ziel)}</p>
      <ol>${r.schritte.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><p class="regeln-punkte"><b>Punkte:</b> ${esc(r.punkte)}</p></div>`;
  }

  // Einfaches Fenster über der Seite, auf dem Handy
  function zeige(art) {
    let el = document.getElementById('regelfenster');
    if (!el) {
      el = document.createElement('div');
      el.id = 'regelfenster';
      el.className = 'regelfenster';
      el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-regeln-zu]')) el.hidden = true; });
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="regelkarte">${html(art)}<button type="button" class="knopf haupt" data-regeln-zu>Alles klar</button></div>`;
    el.hidden = false;
  }

  window.Regeln = { REGELN, html, zeige, titel: (art) => (REGELN[art] ? REGELN[art].titel : art) };
})();
