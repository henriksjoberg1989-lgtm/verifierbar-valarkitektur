/* Tillfällig körningsfil — används bara för att verifiera demot utanför
   webbläsaren. Ska inte levereras. */
(function () {
  'use strict';

  var logg = [];
  var fel = [];

  window.onerror = function (msg, src, line, col) {
    rapporteraFel('ONERROR: ' + msg + ' @ ' + (src || '').split('/').pop() + ':' + line + ':' + col);
  };
  window.addEventListener('unhandledrejection', function (e) {
    rapporteraFel('REJECTION: ' + e.reason);
  });
  var origErr = console.error;
  console.error = function () {
    rapporteraFel('CONSOLE: ' + Array.prototype.join.call(arguments, ' '));
    origErr.apply(console, arguments);
  };

  // läge-direkt ligger bakom en window.confirm eftersom bytet nollställer
  // flödet. Headless returnerar confirm falskt, så vi godkänner den explicit.
  window.confirm = function () { return true; };

  var origST = window.setTimeout;
  window.setTimeout = function (fn, t) {
    var args = Array.prototype.slice.call(arguments, 2);
    var wrapped = fn;
    if (typeof fn === 'function') {
      wrapped = function () {
        try { return fn.apply(null, arguments); }
        catch (e) { rapporteraFel('I setTimeout-callback: ' + e.message + '\n' + (e.stack || '')); }
      };
    }
    return origST.apply(window, [wrapped, t].concat(args));
  };

  var pre = null;
  function visa() {
    if (!document.body) return;
    if (!pre) {
      pre = document.createElement('pre');
      pre.id = 'transkript';
      pre.style.cssText = 'white-space:pre-wrap;font:11px monospace;background:#111;color:#0f0;padding:12px';
      document.body.appendChild(pre);
    }
    pre.textContent =
      '=== FEL (' + fel.length + ') ===\n' + fel.join('\n') +
      '\n\n=== STEG (' + logg.length + ') ===\n' + logg.join('\n');
  }

  function notera(s) { logg.push(s); visa(); }
  function rapporteraFel(s) { fel.push(s); visa(); document.title = 'DRIV FEL=' + fel.length; }

  function $(id) { return document.getElementById(id); }

  var steg = [];

  function klicka(namn, hitta, valfri) {
    steg.push({ namn: namn, hitta: hitta, valfri: !!valfri, redo: function (el) { el.click(); } });
  }

  function vänta(namn, villkor) {
    steg.push({
      namn: 'vänta: ' + namn,
      hitta: function () { return villkor() ? document.body : null; },
      redo: function () {}
    });
  }

  function fånga(namn, fn) {
    steg.push({ namn: namn, hitta: function () { return document.body; }, redo: fn });
  }

  /**
   * Ett fullständigt väljarflöde. I blindat läge finns btn-token och
   * btn-till-terminal; i v1-läget finns btn-till-terminal-direkt och ingen
   * token. Stegen för token är därför valfria.
   */
  function väljarflöde(v, sist) {
    klicka('väljarpill ' + v.namn, function () {
      var b = document.querySelector('.väljarpill[data-pnr="' + v.pnr + '"]');
      return b && !b.disabled ? b : null;
    });
    klicka('utfärdare ' + v.provider + ' för ' + v.namn, function () {
      var b = document.querySelector('.utfärdare[data-provider="' + v.provider + '"]');
      return b && !b.disabled ? b : null;
    });
    klicka('btn-legitimera', function () {
      var b = $('btn-legitimera'); return b && !b.disabled ? b : null;
    });
    klicka('btn-avpricka', function () {
      var b = $('btn-avpricka'); return b && !b.disabled ? b : null;
    }, true);
    klicka('btn-token', function () {
      var b = $('btn-token'); return b && !b.disabled ? b : null;
    }, true);
    klicka('btn-till-terminal', function () {
      var b = $('btn-till-terminal') || $('btn-till-terminal-direkt');
      return b && !b.disabled ? b : null;
    });
    klicka('btn-presentera', function () {
      var b = $('btn-presentera'); return b && !b.disabled ? b : null;
    }, true);
    klicka('btn-till-sedel', function () {
      var b = $('btn-till-sedel') || $('btn-till-sedel-d');
      return b && !b.disabled ? b : null;
    });
    klicka('partiknapp ' + v.parti, function () {
      return document.querySelector('.partiknapp[data-parti="' + v.parti + '"]');
    });
    klicka('btn-bekräfta', function () {
      var b = $('btn-bekräfta'); return b && !b.disabled ? b : null;
    });
    if (!sist) {
      klicka('btn-nästa', function () {
        var b = $('btn-nästa'); return b && !b.disabled ? b : null;
      });
    }
  }

  function angrepp(märke) {
    klicka('kör-angrepp (' + märke + ')', function () {
      var b = $('kör-angrepp'); return b && !b.disabled ? b : null;
    });
    vänta('angrepp klart (' + märke + ')', function () {
      var b = $('kör-angrepp'), r = $('angrepp-resultat');
      return b && !b.disabled && r && r.innerHTML.length > 50;
    });
    fånga('spara angrepp ' + märke, function () {
      notera('--- ANGREPP ' + märke + ' ---\n' + $('angrepp-resultat').innerText);
    });
  }

  /* ---------------------------- BLINDAT LÄGE ---------------------------- */

  klicka('btn-ceremoni', function () { return $('btn-ceremoni'); });
  vänta('nyckel klar', function () {
    var u = $('ceremoni-utfall'); return u && u.innerHTML.length > 50;
  });

  var BLIND = [
    { pnr: '19580314-2291', provider: 'bankid',     parti: 'FRA', namn: 'Alma/BankID' },
    { pnr: '19751102-3384', provider: 'sverige-id', parti: 'MIL', namn: 'Jonas/Sverige-id' },
    { pnr: '19810322-EU41', provider: 'eidas',      parti: 'KUS', namn: 'Marek/eIDAS-EU' },
    { pnr: '19391208-2264', provider: 'manuell',    parti: 'FRA', namn: 'Hildur/manuell' },
    { pnr: '19880706-2255', provider: 'freja',      parti: 'MIL', namn: 'Nadia/Freja' }
  ];
  BLIND.forEach(function (v, idx) { väljarflöde(v, idx === BLIND.length - 1); });

  klicka('btn-stäng', function () { var b = $('btn-stäng'); return b && !b.disabled ? b : null; });
  klicka('btn-räkna', function () { var b = $('btn-räkna'); return b && !b.disabled ? b : null; });
  vänta('räkning klar', function () {
    var u = $('räkna-utfall'); return u && u.innerHTML.length > 50;
  });

  angrepp('BLIND');

  fånga('sammanställ blind läge', function () {
    var g = $('länk-granskare-2') || $('länk-granskare');
    notera('--- GRANSKARLÄNK ---\n' + (g ? g.href : 'SAKNAS'));
    notera('--- RÄKNING ---\n' + ($('räkna-utfall') || {}).innerText);
    notera('--- AKTÖRSLOGGAR ---\n' + $('logg-yta').innerText);
  });

  /* ------------------------------ V1-LÄGE ------------------------------ */

  klicka('läge-direkt', function () { return $('läge-direkt'); });
  vänta('nollställt och i direktläge', function () {
    return $('läge-direkt').getAttribute('aria-pressed') === 'true' &&
           document.querySelector('.väljarpill') !== null;
  });

  var DIREKT = [
    { pnr: '19580314-2291', provider: 'bankid',     parti: 'FRA', namn: 'Alma/BankID (v1)' },
    { pnr: '19751102-3384', provider: 'sverige-id', parti: 'MIL', namn: 'Jonas/Sverige-id (v1)' }
  ];
  DIREKT.forEach(function (v, idx) { väljarflöde(v, idx === DIREKT.length - 1); });

  klicka('btn-stäng (v1)', function () { var b = $('btn-stäng'); return b && !b.disabled ? b : null; });
  klicka('btn-räkna (v1)', function () { var b = $('btn-räkna'); return b && !b.disabled ? b : null; });
  vänta('räkning klar (v1)', function () {
    var u = $('räkna-utfall'); return u && u.innerHTML.length > 50;
  });

  angrepp('DIREKT');

  var maxSteg = (function () {
    var m = /[?&]steg=(\d+)/.exec(location.search || '');
    return m ? parseInt(m[1], 10) : Infinity;
  })();

  var i = 0;
  function kör() {
    if (i >= steg.length || i >= maxSteg) { avsluta(); return; }
    var s = steg[i];
    var försök = 0;
    function prova() {
      var el = null;
      try { el = s.hitta(); } catch (e) { rapporteraFel('I "' + s.namn + '": ' + e.message); }
      if (el) {
        try { s.redo(el); notera('OK  ' + s.namn); }
        catch (e) { rapporteraFel('Klick i "' + s.namn + '" kastade: ' + e.message + '\n' + (e.stack || '')); }
        i++; setTimeout(kör, 1); return;
      }
      if (++försök > 400) {
        if (s.valfri) notera('SKIP ' + s.namn + ' (fanns inte i detta läge)');
        else rapporteraFel('TIMEOUT: "' + s.namn + '" hittade aldrig sitt element');
        i++; setTimeout(kör, 1); return;
      }
      setTimeout(prova, 5);
    }
    prova();
  }

  function avsluta() {
    logg.push('=== KÖRNINGEN AVSLUTAD ===');
    visa();
    document.title = 'KÖRD fel=' + fel.length + ' steg=' + logg.length;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kör);
  } else {
    kör();
  }
})();
