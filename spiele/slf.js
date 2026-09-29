'use strict';
// Stadt, Land, Fluss
// Buchstabe ziehen, alle schreiben gleichzeitig, danach Auswertung an der Bühne.

const { normalisiere, saeubere, zufall } = require('./werkzeuge');

const BUCHSTABEN = 'ABDEFGHIJKLMNOPRSTUVWZ'.split(''); // ohne C, Q, X, Y
const STOPP_NACHLAUF_MS = 10000;
const EINSAMMELN_MS = 1500;
const TAFEL_AUTOMATISCH_MS = 30000; // bei Prüfung durch die Kinder geht es danach von selbst weiter
const ANTWORT_MAX = 40;

class SlfSpiel {
  static kategorienAus(e) {
    const eigene = String(e.eigene || '').split(/\r?\n/).map((z) => saeubere(z, 40)).filter(Boolean);
    const alle = [...(e.kategorien || []), ...eigene];
    const gesehen = new Set();
    return alle.filter((k) => {
      const n = k.toLowerCase();
      if (gesehen.has(n)) return false;
      gesehen.add(n);
      return true;
    });
  }

  static pruefeEinstellungen(e) {
    const n = SlfSpiel.kategorienAus(e).length;
    if (n < 5) return `Wähle mindestens 5 Kategorien aus (gerade ${n}).`;
    if (n > 8) return `Höchstens 8 Kategorien, gerade sind es ${n}.`;
    return null;
  }

  constructor(hub, e) {
    this.hub = hub;
    this.runden = e.runden;
    this.gesamtMs = e.sekunden * 1000;
    this.modus = e.modus;
    this.pruefung = e.pruefung === 'lehrkraft' ? 'lehrkraft' : 'kinder';
    this.pruefMs = (e.pruefSekunden || 90) * 1000;
    this.kategorien = SlfSpiel.kategorienAus(e);
    this.benutzteBuchstaben = new Set();
    this.runde = 0;
    this.phase = 'schreiben';
    this.beendet = false;
  }

  jetzt() {
    return this.hub.raum.pause ? this.hub.raum.pauseSeit : Date.now();
  }

  starte() {
    this.neueRunde();
  }

  beende() {
    this.beendet = true;
  }

  neueRunde() {
    if (this.runde >= this.runden) {
      this.phase = 'ende';
      this.hub.aktualisiere();
      return;
    }
    this.runde++;
    let frei = BUCHSTABEN.filter((b) => !this.benutzteBuchstaben.has(b));
    if (!frei.length) { this.benutzteBuchstaben.clear(); frei = BUCHSTABEN; }
    this.buchstabe = zufall(frei);
    this.benutzteBuchstaben.add(this.buchstabe);
    this.antworten = new Map(); // spielerId -> [Text je Kategorie]
    this.fertig = new Set();
    this.stoppVon = null;
    this.phase = 'schreiben';
    this.phasenDauer = this.gesamtMs;
    this.endeUm = Date.now() + this.gesamtMs;
    this.teilnehmer = [];
    this.urteile = []; // je Kategorie: Map spielerId -> gueltig (nur Abweichungen vom Vorschlag)
    this.stimmen = []; // je Kategorie: Map spielerId -> Map stimmId -> +1/-1
    this.katIndex = 0;
    this.rundenPunkte = null;
    this.ergebnis = null;
    this.dagegen = new Map(); // "kat|vergleichsform" -> Set der Kinder, die dagegen sind
    this.pruefFertig = new Set();
    this.abgelehnt = null; // eingefroren beim Abschluss der Prüfrunde
    this.hub.aktualisiere();
  }

  einsammeln() {
    if (this.phase !== 'schreiben') return;
    this.phase = 'einsammeln';
    this.phasenDauer = EINSAMMELN_MS;
    this.endeUm = Date.now() + EINSAMMELN_MS;
    this.hub.aktualisiere();
  }

  starteAuswertung() {
    const ids = new Set([...this.antworten.keys(), ...this.hub.spieler().filter((s) => s.socketId).map((s) => s.id)]);
    this.teilnehmer = [...ids].filter((id) => this.hub.holeSpieler(id));
    this.urteile = this.kategorien.map(() => new Map());
    this.stimmen = this.kategorien.map(() => new Map());
    this.katIndex = 0;
    if (this.pruefung === 'kinder') {
      this.phase = 'pruefen';
      this.phasenDauer = this.pruefMs;
      this.endeUm = Date.now() + this.pruefMs;
    } else {
      this.phase = 'auswertung';
    }
    this.hub.aktualisiere();
  }

  // ----- Prüfrunde durch die Kinder -----
  // Gleiche Antworten (nach Vergleichsform) werden zu einem Prüfeintrag zusammengefasst.
  pruefGruppen(k) {
    const gruppen = new Map();
    for (const id of this.teilnehmer) {
      const text = this.antwort(id, k);
      if (!this.vorschlag(text)) continue;
      const n = normalisiere(text);
      if (!gruppen.has(n)) gruppen.set(n, { schluessel: n, text, ids: [] });
      gruppen.get(n).ids.push(id);
    }
    return [...gruppen.values()].sort((a, b) => a.schluessel.localeCompare(b.schluessel));
  }

  // Prüfer sind alle Kinder der Runde, die noch im Raum sind, außer den Urhebern der Antwort.
  stimmenFuer(k, gruppe) {
    const pruefer = this.teilnehmer.filter((id) => this.hub.holeSpieler(id) && !gruppe.ids.includes(id));
    const dagegen = [...(this.dagegen.get(k + '|' + gruppe.schluessel) || [])].filter((id) => pruefer.includes(id)).length;
    return { dagegen, pruefer: pruefer.length, abgelehnt: pruefer.length > 0 && dagegen * 2 > pruefer.length };
  }

  schliessePruefungAb() {
    this.abgelehnt = new Set();
    this.kategorien.forEach((_, k) => {
      for (const g of this.pruefGruppen(k)) {
        if (this.stimmenFuer(k, g).abgelehnt) this.abgelehnt.add(k + '|' + g.schluessel);
      }
    });
    this.abschliessen();
  }

  abschliessen() {
    const summe = new Map(this.teilnehmer.map((id) => [id, 0]));
    const details = new Map(this.teilnehmer.map((id) => [id, []]));
    this.kategorien.forEach((_, k) => {
      const punkte = this.punkteFuer(k);
      for (const id of this.teilnehmer) {
        const p = punkte.get(id) || 0;
        summe.set(id, summe.get(id) + p);
        details.get(id).push(p);
      }
    });
    this.rundenPunkte = [];
    for (const id of this.teilnehmer) {
      const s = this.hub.holeSpieler(id);
      if (!s) continue;
      s.punkte += summe.get(id);
      this.rundenPunkte.push({ id, name: s.name, team: s.team, punkte: summe.get(id), je: details.get(id) });
    }
    this.rundenPunkte.sort((a, b) => b.punkte - a.punkte || a.name.localeCompare(b.name, 'de'));
    this.ergebnis = this.baueErgebnis();
    this.phase = 'tafel';
    if (this.pruefung === 'kinder') {
      this.phasenDauer = TAFEL_AUTOMATISCH_MS;
      this.endeUm = Date.now() + TAFEL_AUTOMATISCH_MS;
    }
    this.hub.aktualisiere();
  }

  // Übersicht für die Rundentafel: je Kategorie alle Antworten mit Urteil und Grund
  baueErgebnis() {
    return this.kategorien.map((kategorie, k) => {
      const punkte = this.punkteFuer(k);
      const gruppen = this.pruefGruppen(k);
      return {
        kategorie,
        eintraege: this.teilnehmer.map((id) => {
          const s = this.hub.holeSpieler(id);
          if (!s) return null;
          const text = this.antwort(id, k);
          let grund = null;
          let stimmen = null;
          if (!normalisiere(text)) grund = 'leer';
          else if (!this.vorschlag(text)) grund = 'buchstabe';
          if (!grund && this.pruefung === 'kinder') {
            const g = gruppen.find((x) => x.ids.includes(id));
            stimmen = g ? this.stimmenFuer(k, g) : null;
          }
          if (!grund && !this.istGueltig(id, k)) grund = this.pruefung === 'kinder' ? 'abgelehnt' : 'lehrkraft';
          return { id, name: s.name, team: s.team, text, gueltig: !grund, grund, stimmen, punkte: punkte.get(id) || 0 };
        }).filter(Boolean),
      };
    });
  }

  // ----- Bewertung -----
  antwort(id, k) {
    const a = this.antworten.get(id);
    return (a && a[k]) || '';
  }

  vorschlag(text) {
    const n = normalisiere(text);
    return n.length > 0 && n[0] === normalisiere(this.buchstabe)[0];
  }

  istGueltig(id, k) {
    if (this.pruefung === 'kinder') {
      const text = this.antwort(id, k);
      if (!this.vorschlag(text)) return false;
      return !(this.abgelehnt && this.abgelehnt.has(k + '|' + normalisiere(text)));
    }
    const urteil = this.urteile[k] && this.urteile[k].get(id);
    if (typeof urteil === 'boolean') return urteil && normalisiere(this.antwort(id, k)).length > 0;
    return this.vorschlag(this.antwort(id, k));
  }

  punkteFuer(k) {
    const gueltige = this.teilnehmer.filter((id) => this.istGueltig(id, k));
    const aus = new Map();
    if (gueltige.length === 1) {
      aus.set(gueltige[0], 20);
      return aus;
    }
    const zaehler = new Map();
    for (const id of gueltige) {
      const n = normalisiere(this.antwort(id, k));
      zaehler.set(n, (zaehler.get(n) || 0) + 1);
    }
    for (const id of gueltige) aus.set(id, zaehler.get(normalisiere(this.antwort(id, k))) > 1 ? 5 : 10);
    return aus;
  }

  // ----- Takt -----
  tick(jetzt) {
    if (this.beendet) return;
    if (this.phase === 'schreiben') {
      if (jetzt >= this.endeUm) return this.einsammeln();
      if (this.modus === 'timer') {
        const online = this.hub.spieler().filter((s) => s.socketId);
        if (online.length && online.every((s) => this.fertig.has(s.id))) this.einsammeln();
      }
    } else if (this.phase === 'einsammeln' && jetzt >= this.endeUm) {
      this.starteAuswertung();
    } else if (this.phase === 'pruefen') {
      if (jetzt >= this.endeUm) return this.schliessePruefungAb();
      const online = this.hub.spieler().filter((s) => s.socketId);
      if (online.length && online.every((s) => this.pruefFertig.has(s.id))) this.schliessePruefungAb();
    } else if (this.phase === 'tafel' && this.pruefung === 'kinder' && jetzt >= this.endeUm) {
      this.neueRunde();
    }
  }

  verschiebe(ms) {
    this.endeUm += ms;
  }

  ueberspringe() {
    if (this.phase === 'schreiben') this.einsammeln();
    else if (this.phase === 'einsammeln') this.starteAuswertung();
    else if (this.phase === 'pruefen') this.schliessePruefungAb();
    else if (this.phase === 'auswertung') this.abschliessen();
    else if (this.phase === 'tafel') this.neueRunde();
  }

  spielerWeg() {}

  spielerDa() {}

  // ----- Eingaben -----
  speichereAntworten(spieler, liste) {
    if (!Array.isArray(liste)) return;
    const a = this.kategorien.map((_, i) => saeubere(liste[i], ANTWORT_MAX));
    this.antworten.set(spieler.id, a);
  }

  kindEreignis(spieler, art, d) {
    if (art === 'antworten' && (this.phase === 'schreiben' || this.phase === 'einsammeln')) {
      if (this.phase === 'schreiben' || !this.fertig.has(spieler.id)) this.speichereAntworten(spieler, d.antworten);
      return { ok: true };
    }
    if (art === 'fertig' && this.phase === 'schreiben') {
      this.speichereAntworten(spieler, d.antworten);
      const a = this.antworten.get(spieler.id) || [];
      if (this.modus === 'stopp' && !a.every((x) => x.length > 0)) {
        return { ok: false, fehler: 'Fülle erst alle Felder aus, dann darfst du Stopp rufen.' };
      }
      this.fertig.add(spieler.id);
      if (this.modus === 'stopp' && !this.stoppVon) {
        this.stoppVon = spieler.name;
        const neuesEnde = Date.now() + STOPP_NACHLAUF_MS;
        if (neuesEnde < this.endeUm) {
          this.endeUm = neuesEnde;
          this.phasenDauer = STOPP_NACHLAUF_MS;
        }
      }
      this.hub.aktualisiere();
      return { ok: true };
    }
    if (art === 'dagegen' && this.phase === 'pruefen') {
      if (this.pruefFertig.has(spieler.id)) return { ok: false, fehler: 'Du hast schon fertig geprüft.' };
      const k = Number(d.kat);
      const schluessel = String(d.schluessel || '').slice(0, 80);
      if (!this.kategorien[k]) return { ok: false };
      const gruppe = this.pruefGruppen(k).find((g) => g.schluessel === schluessel);
      if (!gruppe || gruppe.ids.includes(spieler.id)) return { ok: false };
      const key = k + '|' + schluessel;
      if (!this.dagegen.has(key)) this.dagegen.set(key, new Set());
      if (d.wert) this.dagegen.get(key).add(spieler.id);
      else this.dagegen.get(key).delete(spieler.id);
      this.hub.aktualisiere();
      return { ok: true };
    }
    if (art === 'geprueft' && this.phase === 'pruefen') {
      this.pruefFertig.add(spieler.id);
      this.hub.aktualisiere();
      return { ok: true };
    }
    if (art === 'stimme' && this.phase === 'auswertung') {
      const k = Number(d.kat);
      const id = String(d.id || '');
      const wert = Number(d.wert);
      if (!this.stimmen[k] || !this.teilnehmer.includes(id) || id === spieler.id) return { ok: false };
      if (![1, -1, 0].includes(wert)) return { ok: false };
      if (!this.stimmen[k].has(id)) this.stimmen[k].set(id, new Map());
      if (wert === 0) this.stimmen[k].get(id).delete(spieler.id);
      else this.stimmen[k].get(id).set(spieler.id, wert);
      this.hub.aktualisiere();
      return { ok: true };
    }
    return { ok: false };
  }

  lehrerEreignis(art, d) {
    if (art === 'gueltig' && this.phase === 'auswertung') {
      const k = Number(d.kat);
      if (!this.urteile[k] || !this.teilnehmer.includes(d.id)) return null;
      this.urteile[k].set(d.id, !!d.gueltig);
    } else if (art === 'kategorie' && this.phase === 'auswertung') {
      const neu = this.katIndex + (Number(d.richtung) < 0 ? -1 : 1);
      if (neu < 0) return null;
      if (neu >= this.kategorien.length) return this.abschliessen();
      this.katIndex = neu;
    } else if (art === 'weiter' && this.phase === 'tafel') {
      this.neueRunde();
    }
    this.hub.aktualisiere();
    return null;
  }

  // ----- Sicht -----
  sicht(rolle, spielerId) {
    const online = this.hub.spieler().filter((s) => s.socketId);
    const sicht = {
      art: 'slf',
      phase: this.phase,
      runde: this.runde,
      runden: this.runden,
      buchstabe: this.buchstabe,
      kategorien: this.kategorien,
      modus: this.modus,
      restMs: Math.max(0, this.endeUm - this.jetzt()),
      phasenDauer: this.phasenDauer,
      stoppVon: this.stoppVon,
      fertigIds: [...this.fertig],
      teilnehmerAnzahl: online.length,
    };
    if (rolle === 'kind') {
      sicht.meineAntworten = this.antworten.get(spielerId) || null;
      sicht.ichFertig = this.fertig.has(spielerId);
    }
    if (this.phase === 'auswertung') {
      const k = this.katIndex;
      const punkte = this.punkteFuer(k);
      sicht.auswertung = {
        katIndex: k,
        kategorie: this.kategorien[k],
        eintraege: this.teilnehmer
          .map((id) => {
            const s = this.hub.holeSpieler(id);
            if (!s) return null;
            const text = this.antwort(id, k);
            const stimmen = this.stimmen[k].get(id) || new Map();
            let hoch = 0;
            let runter = 0;
            for (const w of stimmen.values()) (w > 0 ? hoch++ : runter++);
            return {
              id,
              name: s.name,
              team: s.team,
              text,
              gueltig: this.istGueltig(id, k),
              vorschlag: this.vorschlag(text),
              hoch,
              runter,
              meineStimme: rolle === 'kind' ? stimmen.get(spielerId) || 0 : 0,
              punkte: punkte.get(id) || 0,
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.text ? 1 : 0) - (a.text ? 1 : 0) || normalisiere(a.text).localeCompare(normalisiere(b.text)) || a.name.localeCompare(b.name, 'de')),
      };
    }
    sicht.pruefung = this.pruefung;
    if (this.phase === 'pruefen') {
      sicht.pruefFertigIds = [...this.pruefFertig];
      if (rolle === 'kind') {
        sicht.ichGeprueft = this.pruefFertig.has(spielerId);
        // anonym: Kinder sehen nicht, wer was geschrieben hat
        sicht.pruefliste = this.kategorien.map((kategorie, k) => ({
          kat: k,
          kategorie,
          eintraege: this.pruefGruppen(k).map((g) => ({
            schluessel: g.schluessel,
            text: g.text,
            anzahl: g.ids.length,
            eigen: g.ids.includes(spielerId),
            dagegen: !!(this.dagegen.get(k + '|' + g.schluessel) || new Set()).has(spielerId),
          })),
          falsch: this.teilnehmer
            .map((id) => this.antwort(id, k))
            .filter((t) => normalisiere(t) && !this.vorschlag(t)),
        }));
      }
    }
    if (this.phase === 'tafel') {
      sicht.tafel = this.rundenPunkte;
      sicht.ergebnis = this.ergebnis;
    }
    return sicht;
  }
}

module.exports = SlfSpiel;
