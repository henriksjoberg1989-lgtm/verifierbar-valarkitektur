/*
 * granskare.js — Oberoende verifiering av ett publicerat valresultat.
 *
 * Medvetet fristående från valsystemet. Delar ingen state med index.html;
 * data tas emot via URL-fragment, annars genereras ett eget scenario.
 * Det speglar designkravet att granskning ska kunna utföras av tredje part
 * utan tillgång till valmyndighetens infrastruktur.
 */
(function () {
  'use strict';

  var K = window.ValKrypto;
  var Merkle = window.ValMerkle;
  var RLA = window.ValRLA;
  var D = window.ValData;

  var ALFA = 0.05;

  var scenario = null;      // { val, vallokal, partier, protokoll[], signaturer[], rot, publikNyckel, sedlar[] }
  var demoScenario = null;  // Underlag från demonstrationen, via URL-fragment. Null om sidan öppnas fristående.
  var fulltScenario = null; // Realistiskt underlag, byggs vid första byte.
  var aktivtUnderlag = 'demo';
  var publiceradeProtokoll = null; // Orörd kopia — manipuleraProtokoll skriver i scenario.protokoll.
  var rapporteratResultat = null;
  var planteratDelta = null;   // { partiId: +/- röster } — överlever beräknaRapporterat().
  var manipuleratLäge = false;
  var planteratFel = false;
  var auditKörd = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) { return K.esc(s); }

  function kort(hex, n) {
    if (!hex) return '—';
    n = n || 12;
    return hex.length <= n * 2 + 1 ? hex : hex.slice(0, n) + '…' + hex.slice(-6);
  }

  /* ------------------------------------------------------------------ *
   * Scenariots ursprung
   * ------------------------------------------------------------------ */

  function läsFrånFragment() {
    var hash = location.hash || '';
    if (hash.indexOf('#data=') !== 0) return null;
    try {
      var payload = JSON.parse(decodeURIComponent(hash.slice(6)));
      if (!payload.protokoll || !payload.rot) return null;

      var sedlar = [];
      var s = payload.sedlar || '';
      for (var i = 0; i + 3 <= s.length; i += 3) sedlar.push(s.slice(i, i + 3));

      return {
        val: payload.val,
        vallokal: payload.vallokal,
        partier: payload.partier,
        protokoll: payload.protokoll,
        signaturer: payload.signaturer || [],
        rot: payload.rot,
        publikNyckel: payload.publikNyckel,
        sedlar: sedlar,
        källa: 'Mottaget från valsystemet via URL-fragment'
      };
    } catch (err) {
      return null;
    }
  }

  /** Eget scenario, så att sidan fungerar fristående. */
  function byggEgetScenario() {
    var partier = D.PARTIER;
    var protokoll = [];
    var sedlar = [];

    var fördelning = { FRA: 0.34, MIL: 0.19, KUS: 0.16, NAR: 0.13, VAL: 0.11, FRI: 0.07 };

    for (var lokal = 0; lokal < 8; lokal++) {
      var resultat = {};
      partier.forEach(function (p) { resultat[p.id] = 0; });

      var antalILokalen = 120 + Math.floor(Math.random() * 80);
      for (var i = 0; i < antalILokalen; i++) {
        var drag = Math.random(), ack = 0, vald = partier[0].id;
        for (var j = 0; j < partier.length; j++) {
          ack += fördelning[partier[j].id];
          if (drag <= ack) { vald = partier[j].id; break; }
        }
        resultat[vald]++;
        sedlar.push(vald);
      }

      protokoll.push(JSON.stringify({
        vallokal: '0' + (100 + lokal),
        vallokalNamn: 'Demolokal ' + (lokal + 1),
        val: 'Kommunval — demonstration',
        datum: '2030-09-08',
        antalRoster: antalILokalen,
        resultat: resultat
      }));
    }

    var träd = Merkle.build(protokoll);

    return {
      val: { namn: 'Kommunval — demonstration', datum: '2030-09-08' },
      vallokal: { id: 'samlad', namn: '8 vallokaler', kommun: 'Demokommun' },
      partier: partier,
      protokoll: protokoll,
      signaturer: [],
      rot: träd.root,
      publikNyckel: null,
      sedlar: sedlar,
      källa: 'Fristående scenario — sidan delar ingen state med valsystemet'
    };
  }

  /* ------------------------------------------------------------------ *
   * Skikt 1: Merklelogg
   * ------------------------------------------------------------------ */

  function renderMerkle() {
    var träd = Merkle.build(scenario.protokoll);

    $('rot').textContent = scenario.rot;
    $('antal-protokoll').textContent = scenario.protokoll.length;
    $('träddjup').textContent = (träd.levels.length - 1) + ' nivåer';
    $('publik-nyckel').textContent = scenario.publikNyckel
      ? 'n = ' + kort(scenario.publikNyckel.n, 10) + '  e = ' + scenario.publikNyckel.e
      : 'ej tillgänglig i detta scenario';

    var rotStämmer = träd.root === scenario.rot;

    var html = '';
    if (!rotStämmer) {
      html += '<div class="notis fara"><strong>Återskapad rot avviker från publicerad rot</strong>' +
        '<p>Återskapat: ' + kort(träd.root, 16) + '<br>Publicerat: ' + kort(scenario.rot, 16) + '</p></div>';
    }

    scenario.protokoll.forEach(function (json, i) {
      var protokoll = JSON.parse(json);
      var bevis = Merkle.proof(träd, i);
      var löv = Merkle.leafHash(json);
      var giltigt = Merkle.verifyProof(löv, bevis);

      // Verifiera också signaturen om publik nyckel finns.
      var signaturOk = null;
      if (scenario.publikNyckel && scenario.signaturer[i]) {
        signaturOk = K.verifySig(
          { n: K.hexToBig(scenario.publikNyckel.n), e: BigInt(scenario.publikNyckel.e) },
          json,
          scenario.signaturer[i]
        );
      }

      var resultatText = Object.keys(protokoll.resultat).map(function (p) {
        return p + ' ' + protokoll.resultat[p];
      }).join(' · ');

      html += '<div class="protokollkort" data-index="' + i + '">' +
        '<div class="protokollrad">' +
          '<b>Vallokal ' + esc(protokoll.vallokal) + '</b>' +
          '<span>' + esc(protokoll.vallokalNamn || '') + '</span>' +
          '<span style="color:var(--text-mjuk)">' + (protokoll.antalRoster || 0) + ' röster</span>' +
          '<span class="bevisstatus ' + (giltigt ? 'ok' : 'nej') + '">' +
            (giltigt ? '✓ BEVIS OK' : '✗ BEVIS BRUTET') + '</span>' +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:11px;color:var(--text-mjuk);margin-top:6px">' +
          esc(resultatText) +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:10.5px;color:var(--text-mjuk);margin-top:4px">' +
          'löv ' + kort(löv, 8) + ' · bevisdjup ' + bevis.siblings.length +
          (signaturOk === null ? '' : (signaturOk ? ' · signatur ✓' : ' · <span style="color:var(--röd)">signatur ✗</span>')) +
        '</div>' +
      '</div>';
    });

    $('protokoll-lista').innerHTML = html;

    if (rotStämmer) {
      $('protokoll-lista').insertAdjacentHTML('beforebegin', '');
    }
    return rotStämmer;
  }

  function manipuleraProtokoll() {
    if (!scenario.protokoll.length) return;
    var idx = Math.min(2, scenario.protokoll.length - 1);
    var original = JSON.parse(scenario.protokoll[idx]);

    // Byt 40 röster från ett parti till ett annat.
    var partier = Object.keys(original.resultat);
    if (partier.length < 2) return;
    var från = partier[1], till = partier[0];
    var flytt = Math.min(40, original.resultat[från]);
    original.resultat[från] -= flytt;
    original.resultat[till] += flytt;
    original.antalRoster = original.antalRoster;

    scenario.protokoll[idx] = JSON.stringify(original);
    manipuleratLäge = true;

    renderMerkle();

    var kortEl = document.querySelector('.protokollkort[data-index="' + idx + '"]');
    if (kortEl) kortEl.classList.add('manipulerat');

    $('manipulationsutfall').innerHTML =
      '<div class="notis fara">' +
        '<strong>Manipulation upptäckt</strong>' +
        '<p>Protokoll för vallokal ' + esc(original.vallokal) + ' ändrades: ' + flytt +
        ' röster flyttade från ' + esc(fromText(från)) + ' till ' + esc(fromText(till)) + '. ' +
        'Inklusionsbeviset mot den publicerade roten bryts omedelbart, eftersom lövets hash ändras.</p>' +
        '<p>En angripare kan inte bara ändra ett protokoll — hen måste förfalska hela vägen upp ' +
        'till roten, och roten är redan publicerad på oberoende kanaler. Det är vad ' +
        '"append-only" betyder i praktiken.</p>' +
      '</div>';
  }

  function fromText(id) {
    var p = D.parti(id);
    return p ? p.namn : id;
  }

  function återställ() {
    if (!manipuleratLäge && !planteratFel) return;
    scenario.protokoll = publiceradeProtokoll.slice();
    laddaScenario(scenario.källa);
    $('manipulationsutfall').innerHTML =
      '<div class="notis lyckat"><strong>Återställt</strong><p>Protokollen är åter i sitt publicerade skick.</p></div>';
  }

  /* ------------------------------------------------------------------ *
   * Publik entropi: tärningsslag
   * ------------------------------------------------------------------ */

  var tärningsvärden = [];

  function renderTärningar(rullar) {
    var html = '';
    for (var i = 0; i < 6; i++) {
      html += '<div class="tärning' + (rullar ? ' rullar' : '') + '">' +
        (rullar ? '?' : (tärningsvärden[i] || '–')) + '</div>';
    }
    $('tärningar').innerHTML = html;
  }

  function slåTärningar() {
    renderTärningar(true);
    var kast = 0;
    var intervall = setInterval(function () {
      kast++;
      if (kast > 9) {
        clearInterval(intervall);
        tärningsvärden = [];
        for (var i = 0; i < 6; i++) tärningsvärden.push(1 + Math.floor(Math.random() * 6));
        renderTärningar(false);
        var frö = 'tärningsceremoni|' + tärningsvärden.join('-') + '|' + Date.now();
        $('entropi').value = frö;
        $('btn-audit').disabled = false;
        $('audit-utfall').innerHTML =
          '<div class="notis"><strong>Publik entropi registrerad</strong>' +
          '<p>Frö: <code style="font-size:11px">' + esc(frö) + '</code></p>' +
          '<p>I en verklig ceremoni slås tärningarna offentligt, direktsänds och protokollet ' +
          'undertecknas av närvarande partiombud. Ingen enskild aktör — inte heller valmyndigheten — ' +
          'kan välja urvalet, eftersom det bestäms av kast som redan har inträffat.</p></div>';
      } else {
        renderTärningar(true);
      }
    }, 70);
  }

  /* ------------------------------------------------------------------ *
   * Skikt 2: Riskbegränsad omräkning
   * ------------------------------------------------------------------ */

  function beräknaRapporterat() {
    rapporteratResultat = {};
    scenario.partier.forEach(function (p) { rapporteratResultat[p.id] = 0; });
    scenario.protokoll.forEach(function (json) {
      var prot = JSON.parse(json);
      Object.keys(prot.resultat).forEach(function (id) {
        if (id in rapporteratResultat) rapporteratResultat[id] += prot.resultat[id];
      });
    });
    if (planteratDelta) {
      Object.keys(planteratDelta).forEach(function (id) {
        if (id in rapporteratResultat) rapporteratResultat[id] += planteratDelta[id];
      });
    }
  }

  function planteraFel() {
    planteratDelta = null;          // utgå från det sanna rapporterade resultatet
    beräknaRapporterat();
    var ordnade = Object.keys(rapporteratResultat).sort(function (a, b) {
      return rapporteratResultat[b] - rapporteratResultat[a];
    });
    if (ordnade.length < 2) return;

    // Flytta röster i det RAPPORTERADE resultatet så att ordningen ändras,
    // medan urnans faktiska sedlar lämnas orörda. Detta är exakt det fel en
    // RLA ska upptäcka.
    var vinnare = ordnade[0], tvåa = ordnade[1];
    var marginal = rapporteratResultat[vinnare] - rapporteratResultat[tvåa];

    // Minst marginal/2 + 1 krävs för att vända ordningen; aldrig så mycket att
    // vinnarens antal blir negativt (på en 5-sedlars urna är marginalen 0).
    var flytt = Math.min(Math.floor(marginal / 2) + 1, rapporteratResultat[vinnare]);
    if (flytt < 1) return;

    planteratDelta = {};
    planteratDelta[vinnare] = -flytt;
    planteratDelta[tvåa] = flytt;
    planteratFel = true;

    renderAuditIngångar();

    $('audit-utfall').innerHTML =
      '<div class="notis varning">' +
        '<strong>Räkningsfel planterat i det rapporterade resultatet</strong>' +
        '<p>' + flytt + ' röster har flyttats från ' + esc(fromText(vinnare)) + ' till ' +
        esc(fromText(tvåa)) + ' i det <em>rapporterade</em> resultatet. Urnans fysiska sedlar är ' +
        'orörda — felet finns bara i siffrorna.</p>' +
        '<p>Slå tärningarna och kör omräkningen. Om metoden fungerar ska den upptäcka detta utan ' +
        'att behöva räkna hela urnan.</p>' +
      '</div>';
  }

  function renderAuditIngångar() {
    beräknaRapporterat();
    $('urna-antal').textContent = scenario.sedlar.length;
    $('alfa').textContent = ALFA + '  (5 % risk att godkänna ett felaktigt resultat)';

    var ordnade = Object.keys(rapporteratResultat).sort(function (a, b) {
      return rapporteratResultat[b] - rapporteratResultat[a];
    });
    $('rapporterat').innerHTML = ordnade.map(function (id) {
      return esc(fromText(id)) + ' ' + rapporteratResultat[id];
    }).join('<br>') + (planteratFel ? '<br><span style="color:var(--röd);font-weight:700">(manipulerat)</span>' : '');
  }

  function körAudit() {
    var frö = $('entropi').value.trim();
    if (!frö) {
      $('audit-utfall').innerHTML = '<div class="notis varning"><strong>Ingen entropi</strong><p>Slå tärningarna först.</p></div>';
      return;
    }

    beräknaRapporterat();
    var sannaSedlar = scenario.sedlar;
    var santResultat = RLA.tally(sannaSedlar);

    // Vid planterat fel använder vi den manipulerade rapporten, inte den sanna.
    var rapport = planteratFel ? rapporteratResultat : santResultat;

    $('btn-audit').disabled = true;
    $('audit-status').innerHTML = '<span class="spinner"></span> drar stickprov och uppdaterar riskmått…';

    setTimeout(function () {
      var res;
      try {
        res = RLA.audit({
          reported: rapport,
          ballots: sannaSedlar,
          alpha: ALFA,
          seed: frö,
          maxSample: sannaSedlar.length
        });
      } catch (err) {
        $('audit-status').textContent = '';
        $('btn-audit').disabled = false;
        $('audit-utfall').innerHTML = '<div class="notis fara"><strong>Fel</strong><p>' + esc(err.message) + '</p></div>';
        return;
      }

      auditKörd = true;
      $('audit-status').textContent = 'klar';
      $('btn-audit').disabled = false;

      var parHtml = res.pairs.map(function (p) {
        var status = p.passed ? 'KLARAT' : 'EJ KLARAT';
        var klass = p.passed ? 'ok' : 'fara';
        return '<tr>' +
          '<td>' + esc(fromText(p.winner)) + ' mot ' + esc(fromText(p.loser)) + '</td>' +
          '<td class="siffra">' + (p.pWinner * 100).toFixed(1) + ' %</td>' +
          '<td class="siffra">' + p.T.toExponential(2) + '</td>' +
          '<td class="siffra">' + (p.stoppedAt || res.ballotsDrawn) + '</td>' +
          '<td class="bevisstatus ' + klass + '">' + status + '</td>' +
        '</tr>';
      }).join('');

      // Riskkurva för det första paret
      var kurva = res.pairs[0].curve;
      var kurvaHtml = '';
      for (var i = 0; i < kurva.length; i++) {
        if (i % Math.max(1, Math.floor(kurva.length / 40)) !== 0 && i !== kurva.length - 1) continue;
        var under = kurva[i] <= ALFA;
        kurvaHtml += '<div class="' + (under ? 'ok' : 'fara') + '">' +
          'sedel ' + String(i).padStart(4, ' ') + '  risk = ' + kurva[i].toExponential(3) +
          (under ? '   ← under α' : '') + '</div>';
      }

      var utfall = res.passed
        ? '<div class="notis lyckat"><strong>Omräkningen godkänner resultatet</strong>' +
          '<p>Riskmåttet föll under ' + ALFA + ' efter <b>' + res.ballotsDrawn + '</b> av ' +
          res.ballotsTotal + ' sedlar (' + (res.andelGranskad * 100).toFixed(1) + ' %). ' +
          'Sannolikheten att ett felaktigt resultat godkänns är högst ' + ALFA + '.</p></div>'
        : '<div class="notis ' + (res.ballotsTotal < MIN_RLA_UNDERLAG ? 'varning' : 'fara') + '">' +
          '<strong>Omräkningen underkänner resultatet</strong>' +
          '<p>Riskmåttet nådde aldrig under ' + ALFA + '. ' +
          (res.fullRecount
            ? 'Hela urvalet förbrukades utan att gränsen nåddes — detta eskalerar till <b>full manuell omräkning</b>.'
            : 'Granskade ' + res.ballotsDrawn + ' av ' + res.ballotsTotal + ' sedlar.') +
          '</p>' +
          (res.ballotsTotal < MIN_RLA_UNDERLAG
            ? '<p>Underlaget är för litet för att auditen ska kunna dra någon slutsats. Att eskalera till ' +
              'full omräkning är då det <b>korrekta</b> svaret: en riskbegränsad omräkning sparar arbete ' +
              'bara när marginalen är tydlig i förhållande till urnans storlek. Välj det realistiska ' +
              'underlaget ovan för att se auditen fungera som avsett.</p>'
            : '') +
          '</div>';

      var santHtml = planteratFel
        ? '<div class="notis">' +
          '<strong>Jämförelse med urnans faktiska innehåll</strong>' +
          '<p>Rapporterat: ' + Object.keys(rapport).map(function (k) { return esc(fromText(k)) + ' ' + rapport[k]; }).join(' · ') + '</p>' +
          '<p>Faktiskt: ' + Object.keys(santResultat).sort(function (a,b){return santResultat[b]-santResultat[a];}).map(function (k) { return esc(fromText(k)) + ' ' + santResultat[k]; }).join(' · ') + '</p>' +
          '</div>'
        : '';

      $('audit-utfall').innerHTML =
        utfall + santHtml +
        '<table class="resultattabell">' +
          '<thead><tr><th>Parvis jämförelse</th><th style="text-align:right">Rapporterad andel</th>' +
          '<th style="text-align:right">Risk T</th><th style="text-align:right">Sedlar</th><th>Utfall</th></tr></thead>' +
          '<tbody>' + parHtml + '</tbody>' +
        '</table>' +
        '<p style="font-size:12px;color:var(--text-mjuk);margin:14px 0 5px">' +
          '<strong>Riskkurva</strong> — ' + esc(fromText(res.pairs[0].winner)) + ' mot ' + esc(fromText(res.pairs[0].loser)) +
        '</p>' +
        '<div class="riskkurva">' + kurvaHtml + '</div>' +
        '<div class="notis" style="margin-top:14px">' +
          '<strong>Reproducerbart</strong>' +
          '<p>Frö: <code style="font-size:11px">' + esc(frö) + '</code></p>' +
          '<p>Urval: ' + res.sample.slice(0, 12).join(', ') + (res.sample.length > 12 ? ', … (' + res.sample.length + ' index)' : '') + '</p>' +
          '<p>Vem som helst som kör om med samma frö och samma urninnehåll får exakt samma stickprov. ' +
          'Det är vad som gör auditen körbar av tredje part utan att lita på valmyndighetens kod.</p>' +
        '</div>';

      renderSammanfattning(res);
    }, 60);
  }

  function renderSammanfattning(res) {
    var merkleOk = Merkle.build(scenario.protokoll).root === scenario.rot && !manipuleratLäge;

    $('sammanfattning').innerHTML =
      '<p class="inledning">' +
        'Granskaren har kontrollerat två skilda egenskaper. De kräver olika underlag och svarar på ' +
        'olika frågor — det är därför båda behövs.' +
      '</p>' +
      '<table class="resultattabell">' +
        '<thead><tr><th>Fråga</th><th>Metod</th><th>Underlag som krävts</th><th>Utfall</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>Har det publicerade protokollet ändrats i efterhand?</td>' +
          '<td>Merkleträd, inklusionsbevis</td>' +
          '<td>Protokollen + den publicerade roten</td>' +
          '<td class="bevisstatus ' + (merkleOk ? 'ok' : 'nej') + '">' + (merkleOk ? '✓ NEJ' : '✗ JA') + '</td></tr>' +
          '<tr><td>Har rösterna räknats rätt?</td>' +
          '<td>BRAVO, riskbegränsad omräkning</td>' +
          '<td>De fysiska sedlarna + offentlig entropi</td>' +
          '<td class="bevisstatus ' + (res && res.passed ? 'ok' : 'nej') + '">' +
            (res ? (res.passed ? '✓ JA' : '✗ NEJ') : '—') + '</td></tr>' +
        '</tbody>' +
      '</table>' +
      '<div class="notis varning">' +
        '<strong>Det granskaren fortfarande måste lita på</strong>' +
        '<p>Att de fysiska sedlarna i urnan är de sedlar väljarna faktiskt lade ner. Ingen ' +
        'kryptografisk metod kan verifiera det — det är därför papperssedeln måste vara kvar som ' +
        'auktoritativt original, och därför räkningen sker öppet i vallokalen. En RLA verifierar ' +
        'räkningen mot sedlarna, inte sedlarna mot väljarnas avsikt.</p>' +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Initiering
   * ------------------------------------------------------------------ */

  function laddaScenario(källa) {
    manipuleratLäge = false;
    planteratFel = false;
    planteratDelta = null;
    auditKörd = false;
    $('audit-utfall').innerHTML = '';
    $('sammanfattning').innerHTML = '';
    $('audit-status').textContent = '';
    beräknaRapporterat();
    renderMerkle();
    renderAuditIngångar();
    $('meta-val').textContent = scenario.val.namn + ' · ' + (scenario.val.datum || '');
    $('meta-källa').textContent = källa;
  }

  /* ------------------------------------------------------------------ *
   * Underlag. Demonstrationen lämnar över en enda vallokal med de röster
   * som faktiskt klickades fram — ofta bara ett handfull. Det är för lite
   * för att en riskbegränsad omräkning ska kunna nå någon slutsats alls,
   * så granskaren kan växla till ett realistiskt underlag.
   * ------------------------------------------------------------------ */

  var MIN_RLA_UNDERLAG = 200;

  function renderUnderlag() {
    var litet = scenario.sedlar.length < MIN_RLA_UNDERLAG;
    $('underlagstext').innerHTML =
      'Aktivt underlag: <strong>' + esc(scenario.källa) + '</strong> — ' +
      scenario.protokoll.length + ' protokoll, ' + scenario.sedlar.length + ' sedlar i urnan.' +
      (litet
        ? ' Det är för litet för en meningsfull riskbegränsad omräkning: BRAVO behöver tillräckligt ' +
          'många drag för att riskmåttet ska kunna falla under α, och på en liten urna eskalerar den ' +
          'i stället till full omräkning. Det är <em>korrekt</em> beteende, inte ett fel — men det ' +
          'visar inte hur auditen fungerar när den väl fungerar. Välj det realistiska underlaget för ' +
          'att se det.'
        : ' Tillräckligt för att auditen ska kunna nå en slutsats utan att räkna hela urnan.');

    $('btn-underlag-demo').disabled = !demoScenario;
    $('btn-underlag-demo').setAttribute('aria-pressed', aktivtUnderlag === 'demo' ? 'true' : 'false');
    $('btn-underlag-full').setAttribute('aria-pressed', aktivtUnderlag === 'full' ? 'true' : 'false');
  }

  function väljUnderlag(typ) {
    if (typ === 'demo' && !demoScenario) return;
    if (typ === aktivtUnderlag) return;
    if (typ === 'full' && !fulltScenario) fulltScenario = byggEgetScenario();
    aktivtUnderlag = typ;
    scenario = typ === 'demo' ? demoScenario : fulltScenario;
    publiceradeProtokoll = scenario.protokoll.slice();
    $('entropi').value = '';
    $('btn-audit').disabled = true;
    $('manipulationsutfall').innerHTML = '';
    laddaScenario(scenario.källa);
    renderUnderlag();
  }

  function init() {
    demoScenario = läsFrånFragment();
    if (demoScenario) {
      aktivtUnderlag = 'demo';
      scenario = demoScenario;
    } else {
      aktivtUnderlag = 'full';
      scenario = byggEgetScenario();
    }
    publiceradeProtokoll = scenario.protokoll.slice();
    laddaScenario(scenario.källa);
    renderUnderlag();

    renderTärningar(false);
    $('btn-underlag-demo').onclick = function () { väljUnderlag('demo'); };
    $('btn-underlag-full').onclick = function () { väljUnderlag('full'); };
    $('btn-slå').onclick = slåTärningar;
    $('btn-audit').onclick = körAudit;
    $('btn-manipulera').onclick = manipuleraProtokoll;
    $('btn-återställ').onclick = återställ;
    $('btn-plantera').onclick = planteraFel;
    $('entropi').addEventListener('input', function () {
      $('btn-audit').disabled = !$('entropi').value.trim();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
