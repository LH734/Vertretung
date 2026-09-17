/* Spieleinstellungen für Einzelregie und Gruppenregie.
   Baut das Formular in einen Container und meldet jede Änderung über schicke(teil). */
(function () {
  'use strict';
  const { esc, setzeHtml } = window.Gemeinsam;

  function Einstellungen(wurzel, schicke) {
    this.wurzel = wurzel;
    this.schicke = schicke;
    this.kategorienGebaut = '';
    this.textTimer = null;
    wurzel.innerHTML = `
      <div class="zeile">
        <div class="umschalter" data-feld="spiel">
          <button type="button" data-wert="zeichnen">Zeichnen und Raten</button>
          <button type="button" data-wert="slf">Stadt, Land, Fluss</button>
        </div>
      </div>

      <div data-block="zeichnen">
        <div class="zeile">
          <label>Runden <input class="eingabe" type="number" data-feld="z-runden" min="1" max="60"></label>
          <label>Sekunden <input class="eingabe" type="number" data-feld="z-sekunden" min="30" max="240" step="5"></label>
        </div>
        <p class="status" style="margin-top:4px">Eine Runde = ein Kind zeichnet.</p>
        <div class="zeile">
          <label>Begriffe <select class="eingabe" data-feld="z-liste"></select></label>
        </div>
        <label class="feld" style="margin-top:10px">
          <span style="font-size:17px">Eigene Begriffe, einer pro Zeile</span>
          <textarea class="eingabe" data-feld="z-eigene" placeholder="Klassenfahrt&#10;Schulhof&#10;Hausmeister"></textarea>
        </label>
      </div>

      <div data-block="slf" hidden>
        <div class="zeile">
          <label>Runden <input class="eingabe" type="number" data-feld="s-runden" min="1" max="20"></label>
          <label>Sekunden <input class="eingabe" type="number" data-feld="s-sekunden" min="30" max="600" step="10"></label>
        </div>
        <div class="zeile">
          <div class="umschalter" data-feld="s-modus">
            <button type="button" data-wert="timer">Fester Timer</button>
            <button type="button" data-wert="stopp">Erster Stopp</button>
          </div>
        </div>
        <div class="zeile">
          <label>Prüfen</label>
          <div class="umschalter" data-feld="s-pruefung">
            <button type="button" data-wert="kinder">Kinder stimmen ab</button>
            <button type="button" data-wert="lehrkraft">Lehrkraft</button>
          </div>
        </div>
        <div class="zeile" data-block="pruefzeit">
          <label>Sekunden zum Prüfen <input class="eingabe" type="number" data-feld="s-pruefsekunden" min="30" max="300" step="10"></label>
        </div>
        <p class="status" data-feld="s-pruefhinweis"></p>
        <p class="status" data-feld="s-anzahl"></p>
        <div class="katwahl" data-feld="s-kategorien"></div>
        <label class="feld" style="margin-top:10px">
          <span style="font-size:17px">Eigene Kategorien, eine pro Zeile</span>
          <textarea class="eingabe" data-feld="s-eigene" placeholder="etwas, das in den Ranzen passt"></textarea>
        </label>
      </div>`;
    this.binde();
  }

  Einstellungen.prototype.feld = function (name) {
    return this.wurzel.querySelector(`[data-feld="${name}"]`);
  };

  Einstellungen.prototype.binde = function () {
    const f = (n) => this.feld(n);
    const umschalter = (el, handler) => el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-wert]');
      if (b) handler(b.dataset.wert);
    });
    umschalter(f('spiel'), (w) => this.schicke({ spiel: w }));
    umschalter(f('s-modus'), (w) => this.schicke({ slf: { modus: w } }));
    umschalter(f('s-pruefung'), (w) => this.schicke({ slf: { pruefung: w } }));
    const zahl = (name, bereich, schluessel) => f(name).addEventListener('change', (e) => this.schicke({ [bereich]: { [schluessel]: e.target.value } }));
    zahl('z-runden', 'zeichnen', 'runden');
    zahl('z-sekunden', 'zeichnen', 'sekunden');
    zahl('s-runden', 'slf', 'runden');
    zahl('s-sekunden', 'slf', 'sekunden');
    zahl('s-pruefsekunden', 'slf', 'pruefSekunden');
    f('z-liste').addEventListener('change', (e) => this.schicke({ zeichnen: { liste: e.target.value } }));
    const text = (name, bereich) => f(name).addEventListener('input', (e) => {
      clearTimeout(this.textTimer);
      this.textTimer = setTimeout(() => this.schicke({ [bereich]: { eigene: e.target.value } }), 400);
    });
    text('z-eigene', 'zeichnen');
    text('s-eigene', 'slf');
    f('s-kategorien').addEventListener('change', () => {
      const gewaehlt = Array.from(f('s-kategorien').querySelectorAll('input:checked')).map((i) => i.value);
      this.schicke({ slf: { kategorien: gewaehlt } });
    });
  };

  // Aktuelle Texte, damit beim Start nichts verloren geht, was noch im Tipp-Puffer steckt
  Einstellungen.prototype.texte = function () {
    clearTimeout(this.textTimer);
    return { zeichnen: { eigene: this.feld('z-eigene').value }, slf: { eigene: this.feld('s-eigene').value } };
  };

  function setzeWert(el, wert) {
    if (document.activeElement === el) return;
    if (el.value !== String(wert)) el.value = wert;
  }
  function markiere(el, wert) {
    el.querySelectorAll('button').forEach((b) => b.classList.toggle('an', b.dataset.wert === wert));
  }

  Einstellungen.prototype.male = function (e, listen) {
    const f = (n) => this.feld(n);
    markiere(f('spiel'), e.spiel);
    this.wurzel.querySelector('[data-block="zeichnen"]').hidden = e.spiel !== 'zeichnen';
    this.wurzel.querySelector('[data-block="slf"]').hidden = e.spiel !== 'slf';

    setzeWert(f('z-runden'), e.zeichnen.runden);
    setzeWert(f('z-sekunden'), e.zeichnen.sekunden);
    const optionen = Object.entries(listen.begriffe).map(([n, anzahl]) => `<option value="${esc(n)}">${esc(n)} (${anzahl})</option>`).join('') +
      '<option value="alle">Alle Listen gemischt</option><option value="eigene">Nur eigene Begriffe</option>';
    const auswahl = f('z-liste');
    if (setzeHtml(auswahl, optionen) || document.activeElement !== auswahl) auswahl.value = e.zeichnen.liste;
    setzeWert(f('z-eigene'), e.zeichnen.eigene);

    setzeWert(f('s-runden'), e.slf.runden);
    setzeWert(f('s-sekunden'), e.slf.sekunden);
    markiere(f('s-modus'), e.slf.modus);
    markiere(f('s-pruefung'), e.slf.pruefung);
    this.wurzel.querySelector('[data-block="pruefzeit"]').hidden = e.slf.pruefung !== 'kinder';
    setzeWert(f('s-pruefsekunden'), e.slf.pruefSekunden);
    f('s-pruefhinweis').textContent = e.slf.pruefung === 'kinder'
      ? 'Die Kinder prüfen die Antworten der anderen. Ist mehr als die Hälfte dagegen, fliegt die Antwort raus.'
      : 'Du entscheidest an der Bühne Kategorie für Kategorie.';
    setzeWert(f('s-eigene'), e.slf.eigene);

    const schluessel = JSON.stringify(listen.kategorien);
    if (this.kategorienGebaut !== schluessel) {
      this.kategorienGebaut = schluessel;
      f('s-kategorien').innerHTML = Object.entries(listen.kategorien).map(([liste, eintraege]) =>
        `<h3>${esc(liste)}</h3>` + eintraege.map((k) => `<label><input type="checkbox" value="${esc(k)}"> ${esc(k)}</label>`).join('')).join('');
    }
    const gewaehlt = new Set(e.slf.kategorien);
    f('s-kategorien').querySelectorAll('input').forEach((i) => { i.checked = gewaehlt.has(i.value); });
    const eigene = e.slf.eigene.split('\n').map((x) => x.trim()).filter(Boolean).length;
    const summe = e.slf.kategorien.length + eigene;
    const anzahl = f('s-anzahl');
    anzahl.textContent = `${summe} Kategorien gewählt (5 bis 8)`;
    anzahl.style.color = summe < 5 || summe > 8 ? 'var(--rot)' : '';
  };

  window.Einstellungen = Einstellungen;
})();
