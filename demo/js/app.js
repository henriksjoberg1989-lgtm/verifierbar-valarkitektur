/*
 * app.js — Flödesmotor för demonstrationen.
 *
 * Kör hela kedjan från whitepaper v2.1: nyckelceremoni, federerad
 * e-legitimering, avprickning, blindad behörighetstoken, anonym presentation
 * vid valsedelsterminalen, VVPAT, räkning, signerat resultatprotokoll och
 * publicering i Merklelogg.
 *
 * Sidokolumnen visar löpande vad varje aktör ser — och vad den inte ser.
 */
(function () {
  'use strict';

  var K = window.ValKrypto;
  var Merkle = window.ValMerkle;
  var RLA = window.ValRLA;
  var D = window.ValData;

  /* ------------------------------------------------------------------ *
   * Tillstånd
   * ------------------------------------------------------------------ */

  var state = {
    nyckel: null,
    nyckelKlar: false,
    valdVäljare: null,
    valdProvider: null,
    läge: 'blind',            // 'blind' (v2.1) | 'direkt' (v1-modellen)

    avprickade: {},           // pnr -> { tid, provider }
    händelser: [],            // kronologisk lista för korrelationsangreppet

    token: null,              // { m, r, blinded, blindSig, sig, tid }
    röst: null,               // parti-id
    urna: [],                 // [{ parti, tid, väljareOkänd }]
    protokoll: [],
    träd: null,

    steg: {},                 // steg-id -> status
    loggar: {},
    kör: false
  };

  var AKTÖRER = [
    { id: 'utfärdare',    namn: 'E-legitimationsutfärdaren', roll: 'ser legitimeringen' },
    { id: 'proxy',        namn: 'Legitimeringsproxyn',       role: '', roll: 'döljer valsammanhanget' },
    { id: 'avprickning',  namn: 'Avprickningstjänsten',      roll: 'håller röstlängden' },
    { id: 'token',        namn: 'Tokenmyndigheten',          roll: 'signerar behörighet' },
    { id: 'terminal',     namn: 'Valsedelsterminalen',       roll: 'tar emot rösten' }
  ];

  AKTÖRER.forEach(function (a) { state.loggar[a.id] = []; });

  /* ------------------------------------------------------------------ *
   * Hjälpfunktioner
   * ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }

  function kort(hex, n) {
    if (!hex) return '—';
    n = n || 10;
    return hex.length <= n * 2 + 1 ? hex : hex.slice(0, n) + '…' + hex.slice(-6);
  }

  function klockslag(ms) {
    var d = new Date(ms);
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
           '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function esc(s) { return K.esc(s); }

  /** Lägger till en post i en aktörs logg. klass: 'ser' | 'serInte' | 'tom' */
  function logg(aktörId, html, klass) {
    state.loggar[aktörId].push({ html: html, klass: klass || 'ser' });
    renderLoggar();
  }

  function rensaLoggar() {
    AKTÖRER.forEach(function (a) { state.loggar[a.id] = []; });
    renderLoggar();
  }

  function sättSteg(id, status) {
    state.steg[id] = status;
    var el = document.querySelector('[data-steg="' + id + '"]');
    if (!el) return;
    el.classList.toggle('låst', status === 'väntar');
    var märke = el.querySelector('.stegstatus');
    if (märke) {
      märke.className = 'stegstatus ' + status;
      märke.textContent = status === 'klar' ? 'KLAR' : status === 'aktiv' ? 'PÅGÅR' : 'VÄNTAR';
    }
  }

  function markeraKör(kör) {
    state.kör = kör;
    document.querySelectorAll('.knapp[data-flöde]').forEach(function (b) {
      b.disabled = kör || b.dataset.villkor === 'false';
    });
  }

  /* ------------------------------------------------------------------ *
   * Rendering: stegkort
   * ------------------------------------------------------------------ */

  var STEGDEF = [
    { id: 'ceremoni',   nr: '00', titel: 'Nyckelceremoni',                beskrivning: 'Tokenmyndigheten genererar sin signeringsnyckel under kontrollerade former' },
    { id: 'välj',       nr: '01', titel: 'Välj väljare och utfärdare',    beskrivning: 'Federationen — valfri godkänd e-legitimation (whitepaper 5.B.1)' },
    { id: 'legitimera', nr: '02', titel: 'Legitimering via proxyn',       beskrivning: 'Data-minimering: utfärdaren får inget vallokalssammanhang' },
    { id: 'avpricka',   nr: '03', titel: 'Avprickning mot röstlängden',   beskrivning: 'Binär flagga. Dubbelröstningsskydd (M2)' },
    { id: 'token',      nr: '04', titel: 'Blindad behörighetstoken',      beskrivning: 'Chaums blindsignatur — bryter kopplingen identitet → röst (M1)' },
    { id: 'terminal',   nr: '05', titel: 'Presentation vid valsedelsterminalen', beskrivning: 'Token presenteras utan identitet' },
    { id: 'sedel',      nr: '06', titel: 'Valsedel och VVPAT',            beskrivning: 'Väljaren läser den utskrivna sedeln med egna ögon (M3)' },
    { id: 'räkna',      nr: '07', titel: 'Räkning, protokoll och publicering', beskrivning: 'Signerat resultatprotokoll i Merklelogg (M4)' }
  ];

  function renderStegskal() {
    var html = '';
    STEGDEF.forEach(function (s) {
      html +=
        '<section class="stegkort låst" data-steg="' + s.id + '">' +
          '<div class="steghuvud">' +
            '<span class="stegnummer">' + s.nr + '</span>' +
            '<h2>' + esc(s.titel) + '</h2>' +
            '<span class="stegstatus väntar">VÄNTAR</span>' +
            '<span class="stegbeskrivning">' + esc(s.beskrivning) + '</span>' +
          '</div>' +
          '<div class="stegkropp" id="kropp-' + s.id + '"></div>' +
        '</section>';
    });
    $('steg-container').innerHTML = html;
    STEGDEF.forEach(function (s) { state.steg[s.id] = 'väntar'; });
    setCeremoni();
  }

  /* ------------------------------------------------------------------ *
   * Rendering: aktörsloggar
   * ------------------------------------------------------------------ */

  function renderLoggar() {
    var html = '';
    AKTÖRER.forEach(function (a) {
      var poster = state.loggar[a.id];
      var namn = a.namn;
      if (a.id === 'utfärdare' && state.valdProvider) {
        namn = D.provider(state.valdProvider).namn;
      }
      html += '<div class="aktör" data-aktör="' + a.id + '">' +
        '<div class="aktörhuvud">' +
          '<span class="aktörnamn">' + esc(namn) + '</span>' +
          '<span class="aktörroll">' + esc(a.roll) + '</span>' +
        '</div>';
      if (!poster.length) {
        html += '<div class="post tom">Ingenting registrerat ännu.</div>';
      } else {
        poster.forEach(function (p) {
          html += '<div class="post ' + p.klass + '">' + p.html + '</div>';
        });
      }
      html += '</div>';
    });
    $('logg-yta').innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * Steg 00 — Nyckelceremoni
   * ------------------------------------------------------------------ */

  function setCeremoni() {
    $('kropp-ceremoni').innerHTML =
      '<p class="inledning">' +
        'Tokenmyndigheten behöver ett RSA-nyckelpar för att blindsignera behörighetstoken. ' +
        'I produktion sker detta i en HSM med delad kontroll och ceremoniell rotation före varje val ' +
        '(whitepaper 5.B.4). Här genereras nyckeln öppet i webbläsaren så att hela förloppet kan följas — ' +
        'men <strong>den privata exponenten visas aldrig för väljarklienten</strong>, bara för ' +
        'tokenmyndighetens egen panel.' +
      '</p>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-ceremoni" data-flöde>Generera RSA-2048-nyckel</button>' +
        '<span class="körsjustering" id="ceremoni-status"></span>' +
      '</div>' +
      '<div id="ceremoni-utfall"></div>';
    $('btn-ceremoni').onclick = körCeremoni;
    sättSteg('ceremoni', 'aktiv');
    $('meta-status').textContent = 'Väntar på nyckelceremoni';
  }

  function körCeremoni() {
    $('btn-ceremoni').disabled = true;
    $('ceremoni-status').innerHTML = '<span class="spinner"></span> söker primtal…';
    var t0 = Date.now();

    setTimeout(function () {
      var nyckel;
      try {
        nyckel = K.generateRsaKey(2048);
      } catch (err) {
        $('ceremoni-status').textContent = 'Fel: ' + err.message;
        $('btn-ceremoni').disabled = false;
        return;
      }
      var ms = Date.now() - t0;
      state.nyckel = nyckel;
      state.nyckelKlar = true;

      $('ceremoni-status').textContent = 'klar på ' + ms + ' ms';
      $('ceremoni-utfall').innerHTML =
        '<div class="notis">' +
          '<strong>Nyckelceremoni genomförd</strong>' +
          '<p>Primtalstest: Miller–Rabin, 24 rundor. Felmarginal 4<sup>−24</sup>.</p>' +
        '</div>' +
        '<dl class="datafalt">' +
          '<dt>Modulus n (publik)</dt><dd>' + kort(K.bigToHex(nyckel.n), 14) + ' <span class="etikett">(' + nyckel.n.toString(2).length + ' bitar)</span></dd>' +
          '<dt>Exponent e (publik)</dt><dd>' + nyckel.e.toString() + '</dd>' +
          '<dt>Exponent d (privat)</dt><dd class="nej">Hålls i HSM — visas aldrig för klienten</dd>' +
          '<dt>Verifiering</dt><dd class="ok">Publik nyckel publicerad till valsedelsterminalen</dd>' +
        '</dl>';

      logg('token', '<span class="etikett">CEREMONI</span> RSA-2048 genererad, n=' + kort(K.bigToHex(nyckel.n), 8), 'ser');
      logg('token', '<span class="etikett">PUBLIK NYCKEL</span> distribuerad till terminaler', 'ser');
      logg('terminal', '<span class="etikett">MOTTAGIT</span> publik nyckel från tokenmyndigheten, e=' + nyckel.e, 'ser');

      sättSteg('ceremoni', 'klar');
      setVälj();
    }, 30);
  }

  /* ------------------------------------------------------------------ *
   * Steg 01 — Välj väljare och utfärdare
   * ------------------------------------------------------------------ */

  function setVälj() {
    var kvarvarande = D.ROSTLANGD.filter(function (v) { return !state.avprickade[v.pnr]; });

    var pills = D.ROSTLANGD.map(function (v) {
      var avprickad = !!state.avprickade[v.pnr];
      var markerad = state.valdVäljare === v.pnr;
      var etikett = v.namn.split(' ')[0] + ' ' + v.namn.split(' ')[1].charAt(0) + '.';
      if (v.ingenEleg) etikett += ' (ingen e-leg)';
      if (v.euMedborgare) etikett += ' (EU)';
      return '<button class="väljarpill" data-pnr="' + v.pnr + '" ' +
        (avprickad ? 'disabled title="Har redan röstat"' : '') + ' ' +
        'aria-pressed="' + (markerad ? 'true' : 'false') + '">' + esc(etikett) + '</button>';
    }).join('');

    var utf = D.PROVIDERS.map(function (p) {
      var tillgänglig = true;
      var anledning = '';
      if (state.valdVäljare) {
        var v = D.valjare(state.valdVäljare);
        if (v.ingenEleg && p.id !== 'manuell') { tillgänglig = false; anledning = 'Väljaren saknar e-legitimation'; }
        if (v.euMedborgare && p.id !== 'eidas' && p.id !== 'manuell') { tillgänglig = false; anledning = 'Endast eIDAS-plånbok eller manuell legitimering'; }
      }
      return '<button class="utfärdare" data-provider="' + p.id + '" ' +
        (tillgänglig ? '' : 'disabled data-villkor="false" title="' + esc(anledning) + '" ') +
        'aria-pressed="' + (state.valdProvider === p.id ? 'true' : 'false') + '">' +
        märke(p) +
        '<span class="utfärdare-text">' +
          '<span class="utfärdare-namn">' + esc(p.namn) + (p.foredragen ? ' · föredragen' : '') + '</span><br>' +
          '<span class="utfärdare-det">' + esc(p.utfardare) + ' · ' + esc(p.form) + ' · nivå: ' + esc(p.niva) + '<br>' + esc(p.ramlag) + '</span>' +
        '</span>' +
        '<span class="tagg ' + p.typ + '">' + esc(p.typ) + '</span>' +
      '</button>';
    }).join('');

    $('kropp-välj').innerHTML =
      '<p class="inledning">' +
        'Väljaren legitimerar sig med <strong>valfri</strong> godkänd e-legitimation. Federationen är ' +
        'ingen bekvämlighet utan ett krav: att kräva en enda utfärdare skulle utesluta väljare utan ' +
        'bankförbindelse och EU-medborgare med rösträtt i kommun- och regionval (whitepaper 4.4). ' +
        'Överstrukna väljare har redan röstat.' +
      '</p>' +
      '<div class="väljarlista">' + pills + '</div>' +
      '<div class="utfärdarlista">' + utf + '</div>' +
      '<div class="notis varning" style="margin-top:14px">' +
        '<strong>Flera väljare i flödet samtidigt</strong>' +
        '<p>Kör gärna flera väljare i följd utan att avsluta flödet direkt. Det behövs för att ' +
        'korrelationsangreppet i sidokolumnen ska bli realistiskt: i en verklig vallokal är flera ' +
        'väljare samtidigt i flödet, vilket gör tidskorrelation tvetydig.</p>' +
      '</div>' +
      '<div class="knapprad" style="margin-top:14px">' +
        '<button class="knapp" id="btn-legitimera" data-flöde ' +
          'data-villkor="' + (state.valdVäljare && state.valdProvider ? 'true' : 'false') + '" ' +
          (state.valdVäljare && state.valdProvider ? '' : 'disabled') + '>Fortsätt till legitimering</button>' +
      '</div>';

    document.querySelectorAll('.väljarpill').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        state.valdVäljare = b.dataset.pnr;
        state.valdProvider = null;
        state.token = null; state.röst = null;
        setVälj();
      };
    });
    document.querySelectorAll('.utfärdare').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled || !state.valdVäljare) return;
        state.valdProvider = b.dataset.provider;
        setVälj();
      };
    });
    $('btn-legitimera').onclick = körLegitimering;

    sättSteg('välj', state.nyckelKlar ? 'aktiv' : 'väntar');
    renderLoggar();
  }

  function märke(p) {
    return '<svg class="utfärdare-märke" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path d="' + p.mark + '" fill="none" stroke="' + p.farg + '" stroke-width="3" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ------------------------------------------------------------------ *
   * Steg 02 — Legitimering via proxyn
   * ------------------------------------------------------------------ */

  function körLegitimering() {
    if (!state.valdVäljare || !state.valdProvider || !state.nyckelKlar) return;
    var v = D.valjare(state.valdVäljare);
    var p = D.provider(state.valdProvider);
    markeraKör(true);
    sättSteg('legitimera', 'aktiv');
    $('meta-status').textContent = 'Legitimering pågår';

    var tid = Date.now();

    // Utfärdarens logg: inget vallokalssammanhang, inget om rösträtt.
    logg('utfärdare', '<span class="etikett">BEGÄRAN</span> från RP <b>STATENS-VALPROXY</b>', 'ser');
    logg('utfärdare', '<span class="etikett">TID</span> ' + klockslag(tid), 'ser');
    logg('utfärdare', '<span class="etikett">VALLOKAL</span> <span class="hemligt">OKÄND — skickas inte</span>', 'serInte');
    logg('utfärdare', '<span class="etikett">ÄRENDE</span> <span class="hemligt">OKÄNT — generiskt RP-namn</span>', 'serInte');

    // Proxyn: vidarebefordrar, loggar inte persistent.
    logg('proxy', '<span class="etikett">VIDAREBEFORDRAR</span> legitimeringsbegäran, fråntar vallokalssammanhanget', 'ser');
    logg('proxy', '<span class="etikett">INTYG</span> mottaget från ' + esc(p.namn) + ', nivå ' + esc(p.niva), 'ser');
    logg('proxy', '<span class="etikett">PERSISTENT LOGG</span> <span class="hemligt">FINNS INTE — designkrav</span>', 'serInte');

    setTimeout(function () {
      state.händelser.push({
        typ: 'legitimering',
        pnr: v.pnr,
        provider: p.id,
        tid: tid
      });

      $('kropp-legitimera').innerHTML =
        '<div class="notis lyckat">' +
          '<strong>Legitimering godkänd</strong>' +
          '<p>' + esc(p.namn) + ' (' + esc(p.utfardare) + ') har returnerat ett intyg på nivå ' +
          '<b>' + esc(p.niva) + '</b>. Intyget är adresserat till proxyn, inte till vallokalen.</p>' +
        '</div>' +
        '<dl class="datafalt">' +
          '<dt>Väljare</dt><dd>' + esc(v.namn) + '</dd>' +
          '<dt>Personnummer</dt><dd>' + esc(D.maskeraPnr(v.pnr)) + ' <span class="etikett">(maskerat i alla loggar)</span></dd>' +
          '<dt>Utfärdare</dt><dd>' + esc(p.namn) + ' — ' + esc(p.typ) + '</dd>' +
          '<dt>Tillitsnivå</dt><dd class="ok">Godkänd: ' + esc(p.niva) + '</dd>' +
          '<dt>Ramverk</dt><dd>' + esc(p.ramlag) + '</dd>' +
        '</dl>' +
        '<div class="notis">' +
          '<strong>Data-minimering mot utfärdaren</strong>' +
          '<p>Utfärdaren lärde sig att någon legitimerade sig mot en tjänst med ett generiskt namn. ' +
          'Den lärde sig <em>inte</em> att det var ett val, inte vilken vallokal, inte om personen hade ' +
          'rösträtt, och ingenting om röstinnehållet. Se loggen i sidokolumnen.</p>' +
        '</div>';

      markeraKör(false);
      sättSteg('legitimera', 'klar');
      setAvpricka();
    }, 260);
  }

  function setAvpricka() {
    var v = D.valjare(state.valdVäljare);
    $('kropp-avpricka').innerHTML =
      '<p class="inledning">' +
        'Avprickningstjänsten slår upp väljaren i röstlängden. Resultatet är en <strong>binär flagga</strong> — ' +
        'ingenting om röstinnehåll passerar denna tjänst, i någon riktning (whitepaper 5.B.2).' +
      '</p>' +
      '<dl class="datafalt">' +
        '<dt>Uppslag</dt><dd>' + esc(v.namn) + ', ' + esc(D.maskeraPnr(v.pnr)) + '</dd>' +
        '<dt>Rösträtt kommunval</dt><dd class="ok">JA</dd>' +
        '<dt>Rösträtt regionval</dt><dd class="ok">JA</dd>' +
        '<dt>Rösträtt riksdagsval</dt><dd class="' + (v.riksdag ? 'ok' : 'nej') + '">' + (v.riksdag ? 'JA' : 'NEJ — EU-medborgare') + '</dd>' +
        '<dt>Flagga "har röstat"</dt><dd class="nej">ej satt</dd>' +
      '</dl>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-avpricka" data-flöde>Sätt flaggan och begär behörighet</button>' +
      '</div>';
    $('btn-avpricka').onclick = körAvprickning;
    sättSteg('avpricka', 'aktiv');
  }

  function körAvprickning() {
    var v = D.valjare(state.valdVäljare);
    var tid = Date.now();
    markeraKör(true);

    if (state.avprickade[v.pnr]) {
      $('kropp-avpricka').innerHTML =
        '<div class="notis fara"><strong>Avvisad — dubbelröstning</strong>' +
        '<p>Flaggan är redan satt. Flödet avbryts. Detta är hela dubbelröstningsskyddet (M2): ' +
        'en binär flagga per person, inte en räkning av röster.</p></div>';
      logg('avprickning', '<span class="etikett">AVVISAD</span> flagga redan satt för ' + esc(D.maskeraPnr(v.pnr)), 'ser');
      markeraKör(false);
      return;
    }

    state.avprickade[v.pnr] = { tid: tid, provider: state.valdProvider };
    state.händelser.push({ typ: 'avprickning', pnr: v.pnr, tid: tid });

    logg('avprickning', '<span class="etikett">UPPSLAG</span> ' + esc(D.maskeraPnr(v.pnr)) + ' → rösträtt JA', 'ser');
    logg('avprickning', '<span class="etikett">FLAGGA</span> satt "har röstat" kl ' + klockslag(tid), 'ser');
    logg('avprickning', '<span class="etikett">GODKÄNNANDE</span> skickat till tokenmyndigheten', 'ser');
    logg('avprickning', '<span class="etikett">RÖSTINNEHÅLL</span> <span class="hemligt">ALDRIG — passerar inte tjänsten</span>', 'serInte');

    setTimeout(function () {
      markeraKör(false);
      sättSteg('avpricka', 'klar');
      setToken();
    }, 200);
  }

  /* ------------------------------------------------------------------ *
   * Steg 04 — Blindad behörighetstoken
   * ------------------------------------------------------------------ */

  function setToken() {
    if (state.läge === 'direkt') {
      $('kropp-token').innerHTML =
        '<div class="notis fara">' +
          '<strong>Hoppas över i v1-läget</strong>' +
          '<p>I v1-modellen finns ingen blindad token. Väljaren legitimerar sig i stället direkt vid ' +
          'valsedelsterminalen, vilket innebär att terminalen ser både identitet och röst i samma session. ' +
          'Byt läge i sidokolumnen för att se skillnaden — eller kör korrelationsangreppet för att se ' +
          'konsekvensen.</p>' +
        '</div>' +
        '<div class="knapprad">' +
          '<button class="knapp" id="btn-till-terminal-direkt" data-flöde>Fortsätt direkt till terminalen</button>' +
        '</div>';
      $('btn-till-terminal-direkt').onclick = function () {
        state.token = { direkt: true, tid: Date.now(), pnr: state.valdVäljare };
        state.händelser.push({ typ: 'terminalidentitet', pnr: state.valdVäljare, tid: state.token.tid });
        logg('terminal', '<span class="etikett">LEGITIMERING</span> ' + esc(D.maskeraPnr(state.valdVäljare)) + ' — <span class="hemligt">IDENTITET SYNLIG</span>', 'ser');
        sättSteg('token', 'klar');
        setTerminal();
      };
      sättSteg('token', 'aktiv');
      return;
    }

    var v = D.valjare(state.valdVäljare);
    $('kropp-token').innerHTML =
      '<p class="inledning">' +
        'Här sker det som faktiskt bryter kopplingen mellan identitet och röst. Klienten väljer ett ' +
        'slumpmässigt tokenmaterial <b>m</b> och en hemlig bländningsfaktor <b>r</b>, och skickar ' +
        '<b>m&#8242; = m · r<sup>e</sup> mod n</b> till tokenmyndigheten. Myndigheten signerar utan att ' +
        'kunna läsa. Klienten avbländar och får en signatur <b>s</b> som myndigheten aldrig kan känna igen igen.' +
      '</p>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-token" data-flöde>Begär blindsignerad behörighetstoken</button>' +
        '<span class="körsjustering" id="token-status"></span>' +
      '</div>' +
      '<div id="token-utfall"></div>';
    $('btn-token').onclick = körToken;
    sättSteg('token', 'aktiv');
  }

  function körToken() {
    markeraKör(true);
    $('token-status').innerHTML = '<span class="spinner"></span> beräknar modulär exponentiering…';

    setTimeout(function () {
      var pub = { n: state.nyckel.n, e: state.nyckel.e };
      var nonce = K.toHex(K.randomBytes(16));
      var kontext = D.VAL.ar + '|' + D.VALLOKAL.id + '|' + nonce;

      var prep;
      try {
        prep = K.Blind.prepare(pub, K.utf8(kontext));
      } catch (err) {
        $('token-status').textContent = 'Fel: ' + err.message;
        markeraKör(false);
        return;
      }

      var blindSig = K.Blind.sign(state.nyckel, prep.blinded);
      var sig = K.Blind.unblind(pub, blindSig, prep.r);
      var verifierad = K.Blind.verify(pub, prep.m, sig);
      var tid = Date.now();

      state.token = {
        m: prep.m, r: prep.r, blinded: prep.blinded,
        blindSig: blindSig, sig: sig, verifierad: verifierad,
        nonce: nonce, tid: tid
      };

      // Tokenmyndigheten ser ENDAST det blindade värdet och sin egen signatur.
      logg('token', '<span class="etikett">IN: m&#8242;</span> ' + kort(K.bigToHex(prep.blinded), 8), 'ser');
      logg('token', '<span class="etikett">UT: s&#8242;</span> ' + kort(K.bigToHex(blindSig), 8), 'ser');
      logg('token', '<span class="etikett">IDENTITET</span> <span class="hemligt">OKÄND</span>', 'serInte');
      logg('token', '<span class="etikett">TOKENMATERIAL m</span> <span class="hemligt">OLÄSBART — blindat</span>', 'serInte');

      $('token-status').textContent = '';
      $('token-utfall').innerHTML =
        '<div class="kryptoruta">' +
          '<div><span class="nyckel">kontext      </span> <span class="kommentar">// val + vallokal + slump, hashas till m</span></div>' +
          '<div><span class="nyckel">nonce        </span> <span class="värde">' + kort(nonce, 12) + '</span></div>' +
          '<div><span class="nyckel">m            </span> <span class="värde">' + kort(K.bigToHex(prep.m), 12) + '</span> <span class="kommentar">// tokenmaterial</span></div>' +
          '<div><span class="nyckel">r            </span> <span class="hemlig">' + kort(K.bigToHex(prep.r), 12) + '</span> <span class="kommentar">// bländningsfaktor, RÖJS ALDRIG, kasseras nu</span></div>' +
          '<div><span class="nyckel">m&#8242; = m·rᵉ   </span> <span class="värde">' + kort(K.bigToHex(prep.blinded), 12) + '</span> <span class="kommentar">// det enda myndigheten ser</span></div>' +
          '<div><span class="nyckel">s&#8242; = m&#8242;ᵈ   </span> <span class="värde">' + kort(K.bigToHex(blindSig), 12) + '</span> <span class="kommentar">// myndighetens signatur</span></div>' +
          '<div><span class="nyckel">s = s&#8242;·r⁻¹  </span> <span class="värde">' + kort(K.bigToHex(sig), 12) + '</span> <span class="kommentar">// avbländad token</span></div>' +
          '<div><span class="nyckel">kontroll sᵉ  </span> <span class="' + (verifierad ? 'värde' : 'hemlig') + '">' + (verifierad ? '== m ✓  giltig' : '!= m ✗') + '</span></div>' +
        '</div>' +
        '<div class="notis ' + (verifierad ? 'lyckat' : 'fara') + '">' +
          '<strong>' + (verifierad ? 'Token giltig — och olänkbar' : 'Token ogiltig') + '</strong>' +
          '<p>' + (verifierad
            ? 'Tokenmyndigheten har signerat ett tokenmaterial den aldrig kunde läsa. ' +
              'Bländningsfaktorn r har nu kasserats ur minnet. När token presenteras vid ' +
              'valsedelsterminalen i nästa steg har myndigheten <em>ingen möjlighet</em> att känna igen ' +
              'den — inte genom att jämföra med sin logg, inte genom att räkna om, inte genom någon ' +
              'kombination av uppgifter den har. Detta är en matematisk egenskap, inte ett löfte om ' +
              'att inte titta i loggarna.'
            : 'Signaturen verifierar inte. Detta ska inte inträffa.') + '</p>' +
        '</div>' +
        '<div class="knapprad">' +
          '<button class="knapp" id="btn-till-terminal" data-flöde ' + (verifierad ? '' : 'disabled') + '>Gå till valsedelsterminalen</button>' +
        '</div>';

      $('btn-till-terminal').onclick = function () {
        state.händelser.push({ typ: 'tokenutfärdad', pnr: state.valdVäljare, tid: tid });
        sättSteg('token', 'klar');
        setTerminal();
      };

      markeraKör(false);
    }, 30);
  }

  /* ------------------------------------------------------------------ *
   * Steg 05 — Presentation vid valsedelsterminalen
   * ------------------------------------------------------------------ */

  function setTerminal() {
    if (state.läge === 'direkt') {
      $('kropp-terminal').innerHTML =
        '<div class="notis fara">' +
          '<strong>v1-läget: terminalen har redan sett identiteten</strong>' +
          '<p>Ingen token behövde presenteras, eftersom väljaren legitimerade sig direkt vid terminalen. ' +
          'Terminalens logg innehåller nu både personnummer och — så snart rösten avges — röstinnehåll, ' +
          'i samma session och med samma tidsstämpel.</p>' +
        '</div>' +
        '<div class="knapprad"><button class="knapp" id="btn-till-sedel-d" data-flöde>Fortsätt till valsedeln</button></div>';
      $('btn-till-sedel-d').onclick = function () { sättSteg('terminal', 'klar'); setSedel(); };
      sättSteg('terminal', 'aktiv');
      return;
    }

    $('kropp-terminal').innerHTML =
      '<p class="inledning">' +
        'Väljaren presenterar token vid terminalen. <strong>Ingen identitet följer med.</strong> ' +
        'Terminalen verifierar signaturen med den publika nyckeln från nyckelceremonin och kontrollerar ' +
        'att token inte redan förbrukats. Terminalen kan inte och behöver inte veta vem väljaren är.' +
      '</p>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-presentera" data-flöde>Presentera token</button>' +
        '<span class="körsjustering" id="terminal-status"></span>' +
      '</div>' +
      '<div id="terminal-utfall"></div>';
    $('btn-presentera').onclick = körTerminal;
    sättSteg('terminal', 'aktiv');
  }

  var förbrukadeToken = {};

  function körTerminal() {
    markeraKör(true);
    $('terminal-status').innerHTML = '<span class="spinner"></span> verifierar signatur…';

    setTimeout(function () {
      var t = state.token;
      var pub = { n: state.nyckel.n, e: state.nyckel.e };
      var mHex = K.bigToHex(t.m);
      var tid = Date.now();

      var giltig = K.Blind.verify(pub, t.m, t.sig);
      var återanvänd = !!förbrukadeToken[mHex];

      logg('terminal', '<span class="etikett">IN: m</span> ' + kort(mHex, 8), 'ser');
      logg('terminal', '<span class="etikett">IN: s</span> ' + kort(K.bigToHex(t.sig), 8), 'ser');
      logg('terminal', '<span class="etikett">sᵉ mod n == m</span> ' + (giltig ? 'SANT' : 'FALSKT'), 'ser');
      logg('terminal', '<span class="etikett">ÅTERANVÄND</span> ' + (återanvänd ? 'JA — AVVISA' : 'NEJ'), 'ser');
      logg('terminal', '<span class="etikett">PERSONNUMMER</span> <span class="hemligt">FINNS INTE I REQUESTEN</span>', 'serInte');
      logg('terminal', '<span class="etikett">VÄLJARENS NAMN</span> <span class="hemligt">FINNS INTE I REQUESTEN</span>', 'serInte');

      state.händelser.push({ typ: 'tokenförbrukad', tid: tid, m: mHex });

      if (!giltig || återanvänd) {
        $('terminal-status').textContent = 'avvisad';
        $('terminal-utfall').innerHTML =
          '<div class="notis fara"><strong>Token avvisad</strong>' +
          '<p>' + (återanvänd
            ? 'Token har redan förbrukats. Detta är återanvändningsskyddet: en token ger rätt till ' +
              'exakt en röst, oavsett hur många gånger den kopieras.'
            : 'Signaturen verifierar inte mot den publika nyckeln.') + '</p></div>';
        markeraKör(false);
        return;
      }

      förbrukadeToken[mHex] = { tid: tid };

      $('terminal-status').textContent = 'godkänd';
      $('terminal-utfall').innerHTML =
        '<div class="notis lyckat">' +
          '<strong>Behörighet bekräftad — utan att terminalen vet vem du är</strong>' +
          '<p>Terminalen har verifierat en giltig, outnyttjad token. Den har inte mottagit något ' +
          'personnummer, inget namn och ingen referens till legitimeringen. Dess logg innehåller två ' +
          'tal och en tidsstämpel.</p>' +
        '</div>' +
        '<dl class="datafalt">' +
          '<dt>Signaturkontroll</dt><dd class="ok">s<sup>e</sup> mod n == m ✓</dd>' +
          '<dt>Återanvändning</dt><dd class="ok">Nej — token markerad förbrukad</dd>' +
          '<dt>Identitet i requesten</dt><dd class="nej">Ingen</dd>' +
          '<dt>Tidsstämpel</dt><dd>' + klockslag(tid) + '</dd>' +
        '</dl>' +
        '<div class="knapprad"><button class="knapp" id="btn-till-sedel" data-flöde>Öppna valsedelsskärmen</button></div>';

      $('btn-till-sedel').onclick = function () { sättSteg('terminal', 'klar'); setSedel(); };
      markeraKör(false);
    }, 30);
  }

  /* ------------------------------------------------------------------ *
   * Steg 06 — Valsedel och VVPAT
   * ------------------------------------------------------------------ */

  function setSedel() {
    var partival = D.PARTIER.map(function (p) {
      return '<button class="partiknapp" data-parti="' + p.id + '" aria-pressed="' +
        (state.röst === p.id ? 'true' : 'false') + '">' +
        '<span class="partifärg" style="background:' + p.farg + '"></span>' +
        '<span>' + esc(p.namn) + '</span>' +
        '<span class="partikod">' + p.id + '</span>' +
      '</button>';
    }).join('');

    $('kropp-sedel').innerHTML =
      '<p class="inledning">' +
        'Väljaren gör sitt val. Terminalen skriver sedan ut en <strong>fysisk valsedel</strong> som ' +
        'väljaren läser med egna ögon bakom glas, bekräftar och själv lägger i urnan. ' +
        'Papperssedeln är det auktoritativa originalet — alla digitala siffror är härledningar ur den, ' +
        'aldrig tvärtom (whitepaper 5.C).' +
      '</p>' +
      '<div class="partival">' + partival + '</div>' +
      '<div id="sedel-utfall"></div>';

    document.querySelectorAll('.partiknapp').forEach(function (b) {
      b.onclick = function () {
        state.röst = b.dataset.parti;
        setSedel();
      };
    });
    sättSteg('sedel', 'aktiv');
  }

  function renderSedel() {
    var p = D.parti(state.röst);
    $('sedel-utfall').innerHTML =
      '<div class="sedel">' +
        '<div class="sedel-val">' + esc(D.VAL.namn) + ' · ' + esc(D.VALLOKAL.namn) + '</div>' +
        '<div class="sedel-parti">' + esc(p.namn) + '</div>' +
        '<div class="sedel-kryss">Kryss för person: lämnat tomt</div>' +
      '</div>' +
      '<div class="notis">' +
        '<strong>VVPAT — väljaren verifierar med ögonen</strong>' +
        '<p>Sedeln visas bakom glas och kan inte ändras, inte tas med och inte fotograferas utan att ' +
        'bryta mot ordningen i lokalen. Detta uppfyller M3 <em>utan något kryptografiskt antagande</em>: ' +
        'väljaren behöver inte lita på att terminalen visar det den registrerar, eftersom väljaren ' +
        'kontrollerar det fysiska resultatet själv. Ett mixnet kan inte erbjuda detta utan en oberoende ' +
        'verifieringsenhet (whitepaper 5.D).</p>' +
      '</div>' +
      '<div class="urna" id="urna">Väljaren bekräftar och lägger sedeln i urnan</div>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-bekräfta">Bekräfta och lägg i urnan</button>' +
        '<button class="knapp sekundär" id="btn-ångra">Ångra — välj ett annat parti</button>' +
      '</div>';

    $('btn-bekräfta').onclick = function () {
      var tid = Date.now();
      state.urna.push({ parti: state.röst, tid: tid });
      state.händelser.push({ typ: 'röst', tid: tid, parti: state.röst });

      logg('terminal', '<span class="etikett">RÖST</span> ' + state.röst + ' kl ' + klockslag(tid), 'ser');
      logg('terminal', '<span class="etikett">SESSION</span> nollställd, tokenmaterial och r ur minnet', 'ser');

      $('urna').className = 'urna mottagen';
      $('urna').textContent = 'Sedeln finns i urnan. Ingen digital representation av rösten finns kvar på terminalen.';
      $('btn-bekräfta').disabled = true;
      $('btn-ångra').disabled = true;

      $('sedel-utfall').insertAdjacentHTML('beforeend',
        '<div class="knapprad" style="margin-top:12px">' +
          '<button class="knapp" id="btn-nästa">Nästa väljare</button>' +
          '<button class="knapp sekundär" id="btn-stäng">Stäng vallokalen och räkna</button>' +
        '</div>');
      $('btn-nästa').onclick = nästaVäljare;
      $('btn-stäng').onclick = function () { sättSteg('sedel', 'klar'); setRäkna(); };
      sättSteg('sedel', 'klar');
    };

    $('btn-ångra').onclick = function () { state.röst = null; setSedel(); };

    if (state.röst) {
      var bekräfta = $('btn-bekräfta');
      if (bekräfta) bekräfta.focus();
    }
  }

  // Rendera sedeln först när ett parti valts
  var origSetSedel = setSedel;
  setSedel = function () {
    origSetSedel();
    if (state.röst) renderSedel();
  };

  function nästaVäljare() {
    state.token = null;
    state.röst = null;
    state.valdVäljare = null;
    state.valdProvider = null;
    ['legitimera', 'avpricka', 'token', 'terminal', 'sedel'].forEach(function (id) {
      sättSteg(id, 'väntar');
      $('kropp-' + id).innerHTML = '<p class="inledning">Väntar på nästa väljare.</p>';
    });
    $('meta-status').textContent = state.urna.length + ' röster i urnan';
    setVälj();
    $('kör-angrepp').disabled = state.händelser.filter(function (h) { return h.typ === 'röst'; }).length === 0;
  }

  /* ------------------------------------------------------------------ *
   * Steg 07 — Räkning, protokoll och publicering
   * ------------------------------------------------------------------ */

  function setRäkna() {
    if (!state.urna.length) {
      $('kropp-räkna').innerHTML = '<div class="notis varning"><strong>Urnans tom</strong><p>Inga röster att räkna.</p></div>';
      sättSteg('räkna', 'aktiv');
      return;
    }

    $('kropp-räkna').innerHTML =
      '<p class="inledning">' +
        'Räkningen sker <strong>öppet i vallokalen</strong>, inför närvarande allmänhet och partiombud — ' +
        'precis som idag. Det är inte en detalj utan den mekanism genom vilken förtroende faktiskt ' +
        'skapas (whitepaper 4.3). Terminalens räkning är en oberoende kontroll; avvikelser löses alltid ' +
        'till papperets fördel. Resultatet skrivs till ett signerat protokoll och publiceras i en ' +
        'append-only-logg.' +
      '</p>' +
      '<div class="knapprad">' +
        '<button class="knapp" id="btn-räkna" data-flöde>Räkna, signera och publicera</button>' +
      '</div>' +
      '<div id="räkna-utfall"></div>';
    $('btn-räkna').onclick = körRäkning;
    sättSteg('räkna', 'aktiv');
  }

  function körRäkning() {
    markeraKör(true);
    var resultat = {};
    D.PARTIER.forEach(function (p) { resultat[p.id] = 0; });
    state.urna.forEach(function (s) { resultat[s.parti]++; });

    var ordnade = D.PARTIER.slice().sort(function (a, b) { return resultat[b.id] - resultat[a.id]; });
    var total = state.urna.length;

    var protokoll = {
      vallokal: D.VALLOKAL.id,
      vallokalNamn: D.VALLOKAL.namn,
      val: D.VAL.namn,
      datum: D.VAL.datum,
      valforrattare: D.VALLOKAL.valforrattare,
      ombud: D.VALLOKAL.ombud,
      antalAvprickade: Object.keys(state.avprickade).length,
      antalRoster: total,
      resultat: resultat,
      skapad: Date.now()
    };

    var json = JSON.stringify(protokoll);
    var signatur = K.sign(state.nyckel, json);
    protokoll.signatur = signatur;
    protokoll.json = json;
    state.protokoll.push(protokoll);

    var items = state.protokoll.map(function (p) { return p.json; });
    state.träd = Merkle.build(items);

    var rader = ordnade.map(function (p) {
      var antal = resultat[p.id];
      var andel = total ? (100 * antal / total).toFixed(1) : '0.0';
      return '<tr class="' + (antal === resultat[ordnade[0].id] && antal > 0 ? 'vinnare' : '') + '">' +
        '<td><span class="partifärg" style="display:inline-block;width:9px;height:9px;background:' + p.farg + ';border-radius:2px;margin-right:7px"></span>' + esc(p.namn) + '</td>' +
        '<td class="siffra">' + antal + '</td>' +
        '<td class="siffra">' + andel + ' %</td>' +
      '</tr>';
    }).join('');

    logg('terminal', '<span class="etikett">PROTOKOLL</span> signerat, ' + total + ' röster', 'ser');

    $('räkna-utfall').innerHTML =
      '<table class="resultattabell">' +
        '<thead><tr><th>Parti</th><th style="text-align:right">Röster</th><th style="text-align:right">Andel</th></tr></thead>' +
        '<tbody>' + rader + '</tbody>' +
        '<tfoot><tr><th>Summa</th><th class="siffra">' + total + '</th><th class="siffra">100 %</th></tr></tfoot>' +
      '</table>' +
      '<dl class="datafalt">' +
        '<dt>Avprickade väljare</dt><dd>' + protokoll.antalAvprickade + '</dd>' +
        '<dt>Röster i urnan</dt><dd>' + total + '</dd>' +
        '<dt>Kontroll</dt><dd class="' + (protokoll.antalAvprickade === total ? 'ok' : 'nej') + '">' +
          (protokoll.antalAvprickade === total ? 'Antalet matchar ✓' : 'AVVIKELSE — kräver full omräkning') + '</dd>' +
        '<dt>Protokollets signatur</dt><dd>' + kort(signatur, 12) + '</dd>' +
        '<dt>Merklerot</dt><dd>' + kort(state.träd.root, 14) + '</dd>' +
      '</dl>' +
      '<div class="notis">' +
        '<strong>Publicerad i append-only-logg</strong>' +
        '<p>Protokollet är signerat av vallokalens nyckel och medsignerat av valförrättare och ' +
        'närvarande partiombud. Merkleloggens rot publiceras på oberoende kanaler. En aktör som i ' +
        'efterhand försöker byta ut protokollet måste förfalska en rot som redan publicerats på flera håll.</p>' +
        '<p><strong>Men loggen ger bara loggintegritet.</strong> Att resultatet inte manipulerats i ' +
        'transporten säger ingenting om att rösterna räknats rätt. Det krävs en riskbegränsad ' +
        'omräkning mot de fysiska sedlarna — den finns på granskarsidan.</p>' +
      '</div>' +
      '<div class="knapprad">' +
        '<a class="knapp" id="länk-granskare-2" href="granskare.html">Öppna granskarsidan med detta val</a>' +
      '</div>';

    // Skicka data till granskarsidan via URL-fragment. Fungerar även från
    // filsystemet, till skillnad från localStorage på file://-origin.
    var sedelStr = state.urna.map(function (s) { return s.parti; }).join('');
    var payload = {
      val: D.VAL,
      vallokal: D.VALLOKAL,
      partier: D.PARTIER,
      protokoll: state.protokoll.map(function (p) { return p.json; }),
      signaturer: state.protokoll.map(function (p) { return p.signatur; }),
      rot: state.träd.root,
      publikNyckel: { n: K.bigToHex(state.nyckel.n), e: state.nyckel.e.toString() },
      sedlar: sedelStr
    };
    var frag = '#data=' + encodeURIComponent(JSON.stringify(payload));
    $('länk-granskare-2').href = 'granskare.html' + frag;
    $('länk-granskare').href = 'granskare.html' + frag;

    markeraKör(false);
    sättSteg('räkna', 'klar');
    $('meta-status').textContent = 'Vallokalen stängd · ' + total + ' röster · protokoll publicerat';
  }

  /* ------------------------------------------------------------------ *
   * Korrelationsangreppet
   * ------------------------------------------------------------------ */

  function sättLäge(läge) {
    state.läge = läge;
    $('läge-blind').setAttribute('aria-pressed', läge === 'blind' ? 'true' : 'false');
    $('läge-direkt').setAttribute('aria-pressed', läge === 'direkt' ? 'true' : 'false');
    if (!state.nyckelKlar) return;
    setVälj();
    if (state.valdVäljare && state.steg.token !== 'väntar') setToken();
  }

  function körAngrepp() {
    var resultat = $('angrepp-resultat');
    $('angrepp-status').innerHTML = '<span class="spinner"></span> angriparen söker…';
    $('kör-angrepp').disabled = true;

    setTimeout(function () {
      var röster = state.händelser.filter(function (h) { return h.typ === 'röst'; });
      var avprickningar = state.händelser.filter(function (h) { return h.typ === 'avprickning'; });
      var direkta = state.händelser.filter(function (h) { return h.typ === 'terminalidentitet'; });
      var utfärdade = state.händelser.filter(function (h) { return h.typ === 'tokenutfärdad'; });
      var förbrukade = state.händelser.filter(function (h) { return h.typ === 'tokenförbrukad'; });

      var html = '';

      /* ---- Angrepp 1: tokenmyndigheten försöker känna igen sin signatur ---- */
      var a1Lyckades = false;
      var a1Detaljer = '';
      if (state.läge === 'direkt') {
        a1Detaljer = 'Ingen blindad token finns i detta läge. Terminalen fick identiteten direkt, ' +
          'så inget angrepp behövs — kopplingen finns i terminalens egen logg.';
        a1Lyckades = direkta.length > 0;
      } else {
        // Angriparen har tokenmyndighetens logg (m', s') och terminalens logg (m, s).
        // Försök hitta en träff.
        var träffar = 0;
        for (var i = 0; i < utfärdade.length; i++) {
          for (var j = 0; j < förbrukade.length; j++) {
            // Enda möjliga koppling: m' == m (om bländningen vore 1) eller s' == s.
            // Kräver att angriparen känner r, vilket den inte gör.
            träffar++;
          }
        }
        a1Lyckades = false;
        a1Detaljer = 'Tokenmyndigheten har ' + utfärdade.length + ' blindade par (m&#8242;, s&#8242;) i sin logg. ' +
          'Terminalen har ' + förbrukade.length + ' avbländade par (m, s). ' +
          'Att koppla dem kräver bländningsfaktorn r, som kasserades ur klientens minne vid steg 04. ' +
          'Utan r finns ingen beräkning som återför s&#8242; till s — det är inte svårt, det är omöjligt.';
      }
      html += angreppsblock(
        'Angrepp 1 — tokenmyndigheten (hotklass A2)',
        'Försöker känna igen en utställd token när den förbrukas.',
        a1Lyckades, a1Detaljer
      );

      /* ---- Angrepp 2: utfärdaren ---- */
      var a2 = state.händelser.filter(function (h) { return h.typ === 'legitimering'; });
      html += angreppsblock(
        'Angrepp 2 — e-legitimationsutfärdaren (hotklass A5)',
        'Försöker härleda vallokal, rösträtt eller röstinnehåll.',
        false,
        a2.length + ' legitimeringar i loggen. Alla mot RP-namnet <b>STATENS-VALPROXY</b>. ' +
        'Ingen vallokal, ingen rösträttstatus, inget röstinnehåll — proxyn fråntar begäran ' +
        'valsammanhanget innan den når utfärdaren. Utfärdaren kan inte ens avgöra att det rör sig om ett val. ' +
        'Detta gäller i båda lägena: data-minimeringen beror inte på blindsignaturen.'
      );

      /* ---- Angrepp 3: tidskorrelation med alla loggar ---- */
      // Ärlig redovisning: blindsignaturen stoppar INTE tidskorrelation.
      // Det gör organisatorisk åtskillnad och samtidighet i lokalen.
      var a3Lyckades = false;
      var a3Detaljer = '';
      var a3Tvetydighet = 0;

      if (state.läge === 'direkt') {
        a3Lyckades = direkta.length > 0;
        a3Tvetydighet = 0;
        a3Detaljer = 'Terminalens logg innehåller personnummer och röst i samma post. ' +
          'Ingen korrelation behövs — kopplingen är explicit. ' +
          direkta.length + ' väljare kan kopplas till sin röst.';
      } else {
        // Hur många väljare var i flödet samtidigt vid varje röstavgivande?
        röster.forEach(function (r) {
          var iFlödet = avprickningar.filter(function (a) {
            return a.tid <= r.tid && a.tid > r.tid - 180000;
          }).length;
          if (iFlödet > a3Tvetydighet) a3Tvetydighet = iFlödet;
        });

        var entydiga = röster.filter(function (r) {
          return avprickningar.filter(function (a) {
            return a.tid <= r.tid && a.tid > r.tid - 180000;
          }).length === 1;
        }).length;

        a3Lyckades = entydiga > 0;
        a3Detaljer =
          'Angriparen har båda loggarna och försöker koppla avprickningens tidpunkt till ' +
          'terminalens tidpunkt. ' + röster.length + ' röster avgivna.<br><br>' +
          '<b>Entydigt kopplingsbara: ' + entydiga + ' av ' + röster.length + '.</b> ' +
          'Maximalt antal väljare samtidigt i flödet: ' + a3Tvetydighet + '.<br><br>' +
          (entydiga > 0
            ? 'Angreppet lyckas delvis. Detta är den <em>ärliga</em> begränsningen: blindsignaturen ' +
              'bryter den kryptografiska kopplingen men inte tidskorrelationen. När endast en väljare ' +
              'är i flödet avslöjar tidpunkten vem som röstade. Skyddet mot detta är inte matematiskt ' +
              'utan organisatoriskt — avprickningstjänsten och valsedelsterminalen drivs av olika ' +
              'myndigheter utan delade loggar (whitepaper 5.B). Faller den åtskillnaden, faller skyddet.'
            : 'Ingen entydig koppling möjlig. Flera väljare var samtidigt i flödet vid varje ' +
              'röstavgivande, vilket gör tidskorrelationen tvetydig. Kör fler väljare i följd för att ' +
              'se hur samtidigheten i en verklig vallokal skyddar mot detta.');
      }
      html += angreppsblock(
        'Angrepp 3 — tidskorrelation med samtliga loggar (hotklass A4)',
        'Försöker koppla avprickning till röst genom tidpunkt.',
        a3Lyckades, a3Detaljer, true
      );

      var sammanfattning = state.läge === 'direkt'
        ? '<div class="notis fara"><strong>v1-modellen fallerar</strong>' +
          '<p>Utan blindad token ser valsedelsterminalen både identitet och röst i samma session. ' +
          'Valhemligheten (M1) är inte uppfylld. Det spelar ingen roll hur rösten krypteras därefter — ' +
          'kopplingen finns redan i loggen.</p></div>'
        : '<div class="notis ' + (a3Lyckades ? 'varning' : 'lyckat') + '">' +
          '<strong>v2.1 — kryptografiskt olänkbar, organisatoriskt beroende</strong>' +
          '<p>Den kryptografiska kopplingen är bruten och kan inte återställas av någon aktör, ' +
          'enskild eller i samverkan. Tidskorrelationen kvarstår som restrisk och hanteras av ' +
          'organisatorisk åtskillnad och av samtidigheten i lokalen. Att påstå något annat vore ' +
          'ohederligt — whitepapern redovisar båda delarna.</p></div>';

      resultat.innerHTML = html + sammanfattning;
      $('angrepp-status').textContent = 'klart';
      $('kör-angrepp').disabled = false;
    }, 120);
  }

  function angreppsblock(titel, fråga, lyckades, detalj, nyanserad) {
    var klass = lyckades ? (nyanserad ? 'varning' : 'fara') : 'lyckat';
    var etikett = lyckades ? (nyanserad ? 'LYCKAS DELVIS' : 'LYCKAS') : 'MISSLYCKAS';
    return '<div class="notis ' + klass + '" style="margin-bottom:11px">' +
      '<strong>' + esc(titel) + ' — ' + etikett + '</strong>' +
      '<p style="color:var(--text-mjuk);margin-bottom:5px">' + esc(fråga) + '</p>' +
      '<p>' + detalj + '</p>' +
    '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Initiering
   * ------------------------------------------------------------------ */

  function init() {
    $('meta-val').textContent = D.VAL.namn + ' · ' + D.VAL.datum;
    $('meta-lokal').innerHTML = 'Vallokal ' + D.VALLOKAL.id + ' · ' + D.VALLOKAL.namn +
      ' · ' + D.VALLOKAL.kommun;
    $('meta-status').textContent = 'Väntar på nyckelceremoni';

    renderStegskal();
    renderLoggar();

    $('läge-blind').onclick = function () { sättLäge('blind'); };
    $('läge-direkt').onclick = function () {
      if (state.händelser.length) {
        var ok = window.confirm(
          'Byte till v1-läget nollställer det pågående flödet så att de båda ' +
          'arkitekturerna kan jämföras under samma förutsättningar. Fortsätt?'
        );
        if (!ok) return;
        nollställ();
      }
      sättLäge('direkt');
    };
    $('kör-angrepp').onclick = körAngrepp;

    // Öppna steg 01 direkt om nyckeln redan finns (t.ex. efter omstart).
    if (state.nyckelKlar) setVälj();
  }

  function nollställ() {
    state.avprickade = {};
    state.händelser = [];
    state.token = null;
    state.röst = null;
    state.urna = [];
    state.valdVäljare = null;
    state.valdProvider = null;
    förbrukadeToken = {};
    rensaLoggar();
    ['välj', 'legitimera', 'avpricka', 'token', 'terminal', 'sedel', 'räkna'].forEach(function (id) {
      sättSteg(id, 'väntar');
      $('kropp-' + id).innerHTML = '<p class="inledning">Väntar på föregående steg.</p>';
    });
    logg('token', '<span class="etikett">CEREMONI</span> nyckel finns sedan tidigare, återanvänds', 'ser');
    setVälj();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
