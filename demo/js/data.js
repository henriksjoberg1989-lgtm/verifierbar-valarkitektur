/*
 * data.js — Demodata: utfärdare, vallokal, röstlängd och partier.
 *
 * Samtliga personuppgifter, partier och vallokaler i denna fil är påhittade.
 * Utfärdarnas märken är abstrakta placeholder-figurer, INTE de verkliga
 * organisationernas logotyper. Se README.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * E-legitimationsutfärdare (whitepaper 4.4)
   *
   * Färg och form är generiska. Inget av märkena återger något verkligt
   * varumärke — demot ska illustrera federationen, inte imitera en tjänst.
   * ------------------------------------------------------------------ */

  var PROVIDERS = [
    {
      id: 'sverige-id',
      namn: 'Sverige-id',
      utfardare: 'Polismyndigheten',
      typ: 'statlig',
      niva: 'högsta',
      ramlag: 'Lag (2026:1358), i kraft 1 december 2026',
      form: 'App',
      foredragen: true,
      farg: '#1f5fa8',
      mark: 'M32 6 L56 16 V32 C56 46 45 55 32 58 C19 55 8 46 8 32 V16 Z'
    },
    {
      id: 'bankid',
      namn: 'BankID',
      utfardare: 'Finansiell ID-Teknik BID AB',
      typ: 'privat',
      niva: 'hög',
      ramlag: 'Tillitsramverket för svensk e-legitimation (Digg)',
      form: 'App / fil',
      foredragen: false,
      farg: '#2a7d4f',
      mark: 'M8 20 H56 V52 H8 Z M16 20 V10 H48 V20 M8 32 H56'
    },
    {
      id: 'freja',
      namn: 'Freja eID+',
      utfardare: 'Freja',
      typ: 'privat',
      niva: 'hög',
      ramlag: 'Tillitsramverket för svensk e-legitimation (Digg)',
      form: 'App',
      foredragen: false,
      farg: '#8a5a1f',
      mark: 'M32 8 A24 24 0 1 0 32 56 A24 24 0 1 0 32 8 M32 20 V44 M22 32 H42'
    },
    {
      id: 'eidas',
      namn: 'eIDAS-plånbok',
      utfardare: 'Medlemsstat inom EU',
      typ: 'europeisk',
      niva: 'substantial / high',
      ramlag: 'Förordning (EU) 2024/1183',
      form: 'Digital plånbok',
      foredragen: false,
      farg: '#5b4fa8',
      mark: 'M32 8 L38 24 H56 L42 34 L47 52 L32 42 L17 52 L22 34 L8 24 H26 Z'
    },
    {
      id: 'manuell',
      namn: 'Manuell legitimering',
      utfardare: 'Valförrättaren',
      typ: 'fysisk',
      niva: 'fysisk ID-handling',
      ramlag: 'Vallagen — ordinarie förfarande',
      form: 'Pappersröstlängd',
      foredragen: false,
      farg: '#6b6b6b',
      mark: 'M12 8 H44 L52 16 V56 H12 Z M20 24 H44 M20 32 H44 M20 40 H36'
    }
  ];

  /* ------------------------------------------------------------------ *
   * Fiktiva partier. Medvetet inga verkliga partier: en demo som producerar
   * ett påhittat valresultat tillskrivet riktiga partier är en
   * desinformationsrisk oavsett avsikt.
   * ------------------------------------------------------------------ */

  var PARTIER = [
    { id: 'FRA', namn: 'Framstegspartiet',  farg: '#2e6fba' },
    { id: 'MIL', namn: 'Miljöalliansen',     farg: '#3a9d5d' },
    { id: 'KUS', namn: 'Kustpartiet',        farg: '#2aa5a5' },
    { id: 'NAR', namn: 'Näringspartiet',     farg: '#c8952a' },
    { id: 'VAL', namn: 'Välfärdslistan',     farg: '#b4483f' },
    { id: 'FRI', namn: 'De frihetliga',      farg: '#7d5bb5' }
  ];

  /* ------------------------------------------------------------------ *
   * Vallokal
   * ------------------------------------------------------------------ */

  var VALLOKAL = {
    id: '0142',
    namn: 'Södra skolans gymnastiksal',
    adress: 'Södra vägen 14',
    kommun: 'Demokommun',
    valdistrikt: 'Södra 3',
    valforrattare: 'A. Lindqvist',
    notarie: 'M. Ekström',
    ombud: ['Framstegspartiet', 'Miljöalliansen', 'Välfärdslistan']
  };

  var VAL = {
    namn: 'Kommunval — demonstration',
    ar: 2030,
    datum: '2030-09-08',
    valmyndighet: 'Valmyndigheten (demonstration)',
    typ: 'DEMONSTRATION — inte ett riktigt val'
  };

  /* ------------------------------------------------------------------ *
   * Röstlängd. Påhittade väljare.
   *
   * personnummer visas maskerat i alla loggar — dels för realism, dels för
   * att demonstrera data-minimeringen i 5.B.1: identiteten stannar i
   * avprickningens domän.
   * ------------------------------------------------------------------ */

  var ROSTLANGD = [
    { pnr: '19580314-2291', namn: 'Alma Bergström',      ar: 1958, kommun: true, region: true, riksdag: true },
    { pnr: '19751102-3384', namn: 'Jonas Ek',            ar: 1975, kommun: true, region: true, riksdag: true },
    { pnr: '19920419-1127', namn: 'Sofia Lindmark',      ar: 1992, kommun: true, region: true, riksdag: true },
    { pnr: '19691228-4410', namn: 'Per-Olov Ågren',      ar: 1969, kommun: true, region: true, riksdag: true },
    { pnr: '19880706-2255', namn: 'Nadia Hassan',        ar: 1988, kommun: true, region: true, riksdag: true },
    { pnr: '20010123-9903', namn: 'Lucas Berg',          ar: 2001, kommun: true, region: true, riksdag: true },
    { pnr: '19470915-3312', namn: 'Ingrid Sjöberg',      ar: 1947, kommun: true, region: true, riksdag: true },
    { pnr: '19830530-7748', namn: 'Mikael Dahlin',       ar: 1983, kommun: true, region: true, riksdag: true },
    { pnr: '19961011-6621', namn: 'Elin Fors',           ar: 1996, kommun: true, region: true, riksdag: true },
    { pnr: '19620227-5539', namn: 'Göran Nilsson',       ar: 1962, kommun: true, region: true, riksdag: true },
    { pnr: '19790814-8802', namn: 'Katarina Vu',         ar: 1979, kommun: true, region: true, riksdag: true },
    { pnr: '19540603-1176', namn: 'Bertil Ohlsson',      ar: 1954, kommun: true, region: true, riksdag: true },
    // EU-medborgare: rösträtt i kommun- och regionval, inte i riksdagsval.
    { pnr: '19810322-EU41', namn: 'Marek Kowalski',      ar: 1981, kommun: true, region: true, riksdag: false, euMedborgare: true, eidasEndast: true },
    { pnr: '19940717-EU28', namn: 'Chiara Rossi',        ar: 1994, kommun: true, region: true, riksdag: false, euMedborgare: true, eidasEndast: true },
    // Väljare utan någon e-legitimation — den manuella vägen måste fungera.
    { pnr: '19391208-2264', namn: 'Hildur Andersson',    ar: 1939, kommun: true, region: true, riksdag: true, ingenEleg: true }
  ];

  function maskeraPnr(pnr) {
    return pnr.indexOf('-EU') > -1
      ? pnr.slice(0, 8) + '-EU••'
      : pnr.slice(0, 8) + '-••••';
  }

  global.ValData = {
    PROVIDERS: PROVIDERS,
    PARTIER: PARTIER,
    VALLOKAL: VALLOKAL,
    VAL: VAL,
    ROSTLANGD: ROSTLANGD,
    maskeraPnr: maskeraPnr,
    parti: function (id) {
      for (var i = 0; i < PARTIER.length; i++) if (PARTIER[i].id === id) return PARTIER[i];
      return null;
    },
    provider: function (id) {
      for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
      return null;
    },
    valjare: function (pnr) {
      for (var i = 0; i < ROSTLANGD.length; i++) if (ROSTLANGD[i].pnr === pnr) return ROSTLANGD[i];
      return null;
    }
  };
})(window);
