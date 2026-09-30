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
