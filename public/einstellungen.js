/* Spieleinstellungen für Einzelregie und Gruppenregie.
   Baut das Formular in einen Container und meldet jede Änderung über schicke(teil). */
(function () {
  'use strict';
  const { esc, setzeHtml } = window.Gemeinsam;

  // Partyspiele: Knöpfe und Felder entstehen aus der Beschreibung in public/party/*.js
  const P = () => (window.Party ? window.Party : { reihenfolge: [], spiele: {} });

  function partyKnoepfe() {
    return P().reihenfolge.map((n) => `<button type="button" data-wert="${n}">${esc(P().spiele[n].titel)}</button>`).join('');
  }

  function feldHtml(spiel, f) {
    const id = `data-party="${spiel}" data-schluessel="${f.feld || ''}"`;
    if (f.typ === 'zahl') return `<div class="zeile"><label>${esc(f.label)} <input class="eingabe" type="number" ${id} data-typ="zahl" min="${f.min}" max="${f.max}" step="${f.step || 1}"></label></div>`;
    if (f.typ === 'schalter') {
      return `<div class="zeile"><label>${esc(f.label)}</label><div class="umschalter" ${id} data-typ="schalter">
        <button type="button" data-wert="ja">${esc(f.texte[0])}</button><button type="button" data-wert="nein">${esc(f.texte[1])}</button></div></div>`;
    }
    if (f.typ === 'wahl') {
      return `<div class="zeile"><label>${esc(f.label)}</label><div class="umschalter" ${id} data-typ="wahl">
        ${f.optionen.map(([wert, text]) => `<button type="button" data-wert="${esc(wert)}">${esc(text)}</button>`).join('')}</div></div>`;
    }
    if (f.typ === 'listen') return `<p class="status" style="margin:10px 0 0">${esc(f.label)}</p><div class="katwahl" data-listen="${f.quelle}" data-spiel="${spiel}" data-schluessel="${f.feld}"></div>`;
    if (f.typ === 'text') return `<label class="feld" style="margin-top:10px"><span style="font-size:17px">${esc(f.label)}</span><textarea class="eingabe" ${id} data-typ="text" placeholder="${esc(f.platzhalter || '')}"></textarea></label>`;
    if (f.typ === 'hinweis') return `<p class="status">${esc(f.text)}</p>`;
    return '';
  }

  function partyBloecke() {
    return P().reihenfolge.map((n) => `<div data-block="${n}" hidden>${(P().spiele[n].einstellungen || []).map((f) => feldHtml(n, f)).join('')}</div>`).join('');
  }

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
          <button type="button" data-wert="saboteur">Saboteur</button>
          ${partyKnoepfe()}
        </div>
      </div>
      ${partyBloecke()}

      <div data-block="zeichnen">
        <div class="zeile">
          <label>Runden <input class="eingabe" type="number" data-feld="z-runden" min="1" max="60"></label>
          <label>Sekunden <input class="eingabe" type="number" data-feld="z-sekunden" min="30" max="240" step="5"></label>
        </div>
        <p class="status" style="margin-top:4px">Eine Runde = eine Person zeichnet.</p>
        <p class="status" data-feld="z-anzahl"></p>
        <div class="katwahl" data-listen="begriffe" data-spiel="zeichnen" data-schluessel="listen"></div>
        <label class="feld" style="margin-top:10px">
          <span style="font-size:17px">Eigene Begriffe, einer pro Zeile</span>
          <textarea class="eingabe" data-feld="z-eigene" placeholder="Klassenfahrt&#10;Schulhof&#10;Hausmeister"></textarea>
        </label>
      </div>

      <div data-block="saboteur" hidden>
        <div class="zeile">
          <label>Runden <input class="eingabe" type="number" data-feld="b-runden" min="1" max="10"></label>
          <label>Saboteure <input class="eingabe" type="number" data-feld="b-saboteure" min="1" max="3"></label>
        </div>
        <div class="zeile">
          <label>Aufgaben pro Kopf <input class="eingabe" type="number" data-feld="b-aufgaben" min="2" max="8"></label>
          <label>Durchsagen <input class="eingabe" type="number" data-feld="b-notrufe" min="0" max="3"></label>
        </div>
        <div class="zeile">
          <label>Abklingzeit (s) <input class="eingabe" type="number" data-feld="b-abkling" min="10" max="60" step="5"></label>
          <label>Abstimmung (s) <input class="eingabe" type="number" data-feld="b-abstimm" min="30" max="180" step="10"></label>
        </div>
        <div class="zeile">
          <label>Nach Rauswurf Rolle</label>
          <div class="umschalter" data-feld="b-aufdecken">
            <button type="button" data-wert="ja">aufdecken</button>
            <button type="button" data-wert="nein">geheim halten</button>
          </div>
        </div>
        <div class="zeile">
          <label>Sabotagen</label>
          <div class="umschalter" data-feld="b-sabotagen"><button type="button" data-wert="ja">an</button><button type="button" data-wert="nein">aus</button></div>
          <label>Geheime Gänge</label>
          <div class="umschalter" data-feld="b-gaenge"><button type="button" data-wert="ja">an</button><button type="button" data-wert="nein">aus</button></div>
        </div>
        <p class="status">Ab 4 Mitspielenden. Je 3 Mitspielende höchstens ein Saboteur, mehr werden automatisch weniger. Am schönsten mit 5 bis 12 pro Raum, bei mehr Leuten lieber den Gruppenmodus nehmen.</p>
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
            <button type="button" data-wert="kinder">Alle stimmen ab</button>
            <button type="button" data-wert="lehrkraft">Spielleitung</button>
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
    umschalter(f('b-aufdecken'), (w) => this.schicke({ saboteur: { aufdecken: w === 'ja' } }));
    umschalter(f('b-sabotagen'), (w) => this.schicke({ saboteur: { sabotagen: w === 'ja' } }));
    umschalter(f('b-gaenge'), (w) => this.schicke({ saboteur: { gaenge: w === 'ja' } }));
    const zahl = (name, bereich, schluessel) => f(name).addEventListener('change', (e) => this.schicke({ [bereich]: { [schluessel]: e.target.value } }));
    zahl('z-runden', 'zeichnen', 'runden');
    zahl('z-sekunden', 'zeichnen', 'sekunden');
    zahl('s-runden', 'slf', 'runden');
    zahl('s-sekunden', 'slf', 'sekunden');
    zahl('s-pruefsekunden', 'slf', 'pruefSekunden');
    zahl('b-runden', 'saboteur', 'runden');
    zahl('b-saboteure', 'saboteur', 'saboteure');
    zahl('b-aufgaben', 'saboteur', 'aufgaben');
    zahl('b-notrufe', 'saboteur', 'notrufe');
    zahl('b-abkling', 'saboteur', 'abklingSekunden');
    zahl('b-abstimm', 'saboteur', 'abstimmSekunden');
    // Ankreuzlisten (Begriffe, Karten, Quizkategorien)
    this.wurzel.addEventListener('change', (e) => {
      const box = e.target.closest('[data-listen]');
      if (!box) return;
      const gewaehlt = Array.from(box.querySelectorAll('input:checked')).map((i) => i.value);
      this.schicke({ [box.dataset.spiel]: { [box.dataset.schluessel]: gewaehlt } });
    });
    // Felder der Partyspiele
    this.wurzel.addEventListener('change', (e) => {
      const el = e.target.closest('[data-party][data-typ="zahl"]');
      if (el) this.schicke({ [el.dataset.party]: { [el.dataset.schluessel]: el.value } });
    });
    this.wurzel.addEventListener('input', (e) => {
      const el = e.target.closest('[data-party][data-typ="text"]');
      if (!el) return;
      clearTimeout(this.textTimer);
      this.textTimer = setTimeout(() => this.schicke({ [el.dataset.party]: { [el.dataset.schluessel]: el.value } }), 400);
    });
    this.wurzel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-party][data-typ="schalter"] button[data-wert], [data-party][data-typ="wahl"] button[data-wert]');
      if (!b) return;
      const box = b.closest('[data-party]');
      const wert = box.dataset.typ === 'wahl' ? b.dataset.wert : b.dataset.wert === 'ja';
      this.schicke({ [box.dataset.party]: { [box.dataset.schluessel]: wert } });
    });
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
    const texte = { zeichnen: { eigene: this.feld('z-eigene').value }, slf: { eigene: this.feld('s-eigene').value } };
    this.wurzel.querySelectorAll('[data-party][data-typ="text"]').forEach((el) => {
      texte[el.dataset.party] = Object.assign(texte[el.dataset.party] || {}, { [el.dataset.schluessel]: el.value });
    });
    return texte;
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
    this.wurzel.querySelector('[data-block="saboteur"]').hidden = e.spiel !== 'saboteur';
    // Partyspiele
    for (const n of P().reihenfolge) {
      const block = this.wurzel.querySelector(`[data-block="${n}"]`);
      if (block) block.hidden = e.spiel !== n;
      const werte = e[n] || {};
      block.querySelectorAll('[data-party]').forEach((el) => {
        const w = werte[el.dataset.schluessel];
        if (el.dataset.typ === 'zahl' || el.dataset.typ === 'text') setzeWert(el, w === undefined ? '' : w);
        else if (el.dataset.typ === 'schalter') markiere(el, w ? 'ja' : 'nein');
        else if (el.dataset.typ === 'wahl') markiere(el, String(w));
      });
    }
    // Ankreuzlisten füllen und markieren
    this.wurzel.querySelectorAll('[data-listen]').forEach((box) => {
      const quelle = listen[box.dataset.listen] || {};
      const schluessel = JSON.stringify(quelle);
      if (box.__quelle !== schluessel) {
        box.__quelle = schluessel;
        box.innerHTML = Object.entries(quelle).map(([n, anzahl]) => `<label><input type="checkbox" value="${esc(n)}"> ${esc(n)} <small>(${anzahl})</small></label>`).join('');
      }
      const an = new Set(((e[box.dataset.spiel] || {})[box.dataset.schluessel]) || []);
      box.querySelectorAll('input').forEach((i) => { i.checked = an.has(i.value); });
    });
    if (e.saboteur) {
      setzeWert(f('b-runden'), e.saboteur.runden);
      setzeWert(f('b-saboteure'), e.saboteur.saboteure);
      setzeWert(f('b-aufgaben'), e.saboteur.aufgaben);
      setzeWert(f('b-notrufe'), e.saboteur.notrufe);
      setzeWert(f('b-abkling'), e.saboteur.abklingSekunden);
      setzeWert(f('b-abstimm'), e.saboteur.abstimmSekunden);
      markiere(f('b-aufdecken'), e.saboteur.aufdecken ? 'ja' : 'nein');
      markiere(f('b-sabotagen'), e.saboteur.sabotagen !== false ? 'ja' : 'nein');
      markiere(f('b-gaenge'), e.saboteur.gaenge !== false ? 'ja' : 'nein');
    }

    setzeWert(f('z-runden'), e.zeichnen.runden);
    setzeWert(f('z-sekunden'), e.zeichnen.sekunden);
    const gewaehlteListen = e.zeichnen.listen || [];
    const begriffeSumme = gewaehlteListen.reduce((s, n) => s + (listen.begriffe[n] || 0), 0);
    f('z-anzahl').textContent = gewaehlteListen.length
      ? `${gewaehlteListen.length} Listen mit ${begriffeSumme} Begriffen angehakt`
      : 'Keine Liste angehakt: nur eigene Begriffe, sonst alle Listen.';
    setzeWert(f('z-eigene'), e.zeichnen.eigene);

    setzeWert(f('s-runden'), e.slf.runden);
    setzeWert(f('s-sekunden'), e.slf.sekunden);
    markiere(f('s-modus'), e.slf.modus);
    markiere(f('s-pruefung'), e.slf.pruefung);
    this.wurzel.querySelector('[data-block="pruefzeit"]').hidden = e.slf.pruefung !== 'kinder';
    setzeWert(f('s-pruefsekunden'), e.slf.pruefSekunden);
    f('s-pruefhinweis').textContent = e.slf.pruefung === 'kinder'
      ? 'Alle prüfen die Antworten der anderen. Ist mehr als die Hälfte dagegen, fliegt die Antwort raus.'
      : 'Die Spielleitung entscheidet an der Bühne Kategorie für Kategorie.';
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
