# Verifierbar valarkitektur för svenska vallokaler

Teknisk specifikation och interaktiv demonstration av ett verifierbart valsystem som bevarar papperssedeln, den öppna räkningen och det decentraliserade genomförandet.

## Vad är detta?

Ett förslag till arkitektur som löser tre problem i det svenska valsystemet:

1. **Ingen verifiering av räkningsresultat** — löst med riskbegränsad omräkning (BRAVO)
2. **Resultattransporten saknar integritetsskydd** — löst med signerade protokoll i Merklelogg
3. **Digital avprickning hotar valhemligheten** — löst med blindsignerad behörighetstoken (Chaum)

Arkitekturen digitaliserar räkningen, transporten och granskningen — inte själva rösten. Papperssedeln förblir det auktoritativa originalet.

## Snabbstart

Öppna `demo/index.html` direkt i webbläsaren. Ingen server, ingen installation, inga beroenden.

```
# Alternativt via GitHub Pages:
https://henriksjoberg1989-lgtm.github.io/verifierbar-valarkitektur/index.html
```

Klicka "Generera RSA-2048-nyckel" och följ flödet steg för steg. I sidokolumnen visas vad varje aktör ser — och vad den inte ser.

## Struktur

```
├── valarkitektur-whitepaper.md    # Fullständig specifikation (v2.1)
├── demo/
│   ├── index.html                 # Huvuddemonstration
│   ├── granskare.html             # Oberoende verifiering
│   ├── sjalvtest.html             # Automatisk testsvit
│   ├── style.css
│   └── js/
│       ├── krypto.js              # SHA-256, RSA-2048, blindsignatur (ren JS)
│       ├── merkle.js              # RFC 6962-kompatibel Merklelogg
│       ├── rla.js                 # BRAVO riskbegränsad omräkning
│       ├── data.js                # Testdata (fiktiva partier och väljare)
│       ├── app.js                 # Flödesmotor
│       ├── granskare.js           # Oberoende granskning
│       └── sjalvtest.js           # 30+ tester
```

## Demon

| Sida | Beskrivning |
|---|---|
| [index.html](demo/index.html) | Huvudflödet: nyckelceremoni → e-legitimering → blindsignerad token → VVPAT → räkning → publicering |
| [granskare.html](demo/granskare.html) | Oberoende granskning: Merkleverifiering + BRAVO-audit. Manipulationsdemo |
| [sjalvtest.html](demo/sjalvtest.html) | Automatisk testsvit: SHA-256 (FIPS-vektorer), Miller-Rabin, RSA, blindsignatur, Merkle, BRAVO |

## Arkitekturen i korthet

| Egenskap | Dagens system | Föreslagen arkitektur |
|---|---|---|
| Räkningsverifiering | Full omräkning vid beslut | Riskbegränsad omräkning (BRAVO) |
| Resultattransport | Mänsklig, utan kryptografiskt skydd | Signerat protokoll i Merklelogg |
| Valhemlighet | Organisatoriskt skydd | Blindsignerad behörighetstoken |
| Tillgänglighet | Pappersvalsedel | VVPAT-terminal med skärm/ljud |
| Nätverksberoende | Lågt (papper) | Offline-först, degraderar till papper |

## Kryptografisk design

- **SHA-256**: Ren JavaScript-implementation. Stämmer med FIPS 180-4 testvektorer.
- **RSA-2048**: Nyckelgenerering i webbläsaren med `crypto.getRandomValues()` (CSPRNG). Miller-Rabin med 24 rundor.
- **Blindsignatur (Chaum)**: Klienten bländar tokenmaterialet `m' = m · r^e mod n`. Myndigheten signerar det blindade värdet. Klienten avbländar. Myndigheten kan aldrig koppla signaturen till det ursprungliga materialet.
- **Merklelogg**: RFC 6962-kompatibel med domänseparation (0x00 för löv, 0x01 för interna noder). Förhindrar second-preimage-angrepp.
- **BRAVO**: Ballot-polling audit. Deterministisk entropi ur publik källa (tärningsslag). Reproducerbart urval av oberoende granskare.

## Vad detta INTE är

- **Inte ett elektroniskt valsystem.** Rösten lagras aldrig digitalt. Papperssedeln är auktoritativ.
- **Inte produktionskod.** Kryptografiimplementationen är avsedd för granskning och utbildning, inte för drift. I produktion används HSM, korrekt RSA-padding (PKCS#1/PSS), och hårdvaruattestering.
- **Inte ett förslag om distansröstning.** Systemet kräver fysisk närvaro i vallokal.
- **Inte ett krav på grundlagsändring.** Arkitekturen fungerar inom nuvarande vallag.

## Öppna problem

- Den öppna räkningens framtid i vallokaler är olöst och erkänns som det tyngsta hindret.
- Bärartokens överlåtbarhet hanteras organisatoriskt (fysisk närvaro, enkel användning), inte kryptografiskt.
- Tidskorrelation som restrisk hanteras organisatoriskt (slumpmässig köordning, batchade tidsstämplar).
- Sverige-ids oprövade driftstatus kräver att federationen inte görs beroende av en enskild utfärdare.

## Koppling till pågående utredning

Valmyndigheten har ett regeringsuppdrag (beslutat 25 september 2025) att analysera och redovisa förutsättningarna för digitala röstlängder i vallokaler. Uppdraget ska redovisas senast 15 januari 2027. Denna arkitektur adresserar de säkerhets- och integritetsfrågor som uppdraget identifierar men inte löser.

## Licens

Källkod och specifikation är fritt tillgängliga för granskning.

## Kontakt

Henrik Sjöberg · henriksjoberg7@gmail.com · 0760-700 175
