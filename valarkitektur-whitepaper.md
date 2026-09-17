# Verifierbar Valarkitektur för Svenska Vallokaler

**Version 2.1 — reviderad teknisk specifikation**
Ursprungligt utkast: 2026-09-16 · E-legitimeringslagret omskrivet: 2026-09-16
Status: Utkast för granskning

---

## 0. Revideringsnot — vad som ändrats från version 1 och varför

Denna version ersätter föregående utkast. Fem tekniska pelare i ursprungsdokumentet
höll inte vid granskning. De är ersatta, inte bara omformulerade.

| Ursprungligt påstående | Problem | Ersätts av |
|---|---|---|
| Geofencing låser terminalen till vallokalens koordinater | GPS är trivialt förfalskningsbart. Geofencing bevisar ingenting om vem som kontrollerar enheten. | Fysisk attest: valförrättarkontroll + TPM-buren enhetsattestering + reproducerbara byggen |
| Blindsignaturer signerar valsedeln | Blindningen döljer valsedeln för väljaren också. Ingen möjlighet att bekräfta att det som registrerades är det som valdes. | Blindsignatur flyttas till rätt ställe: den signerar **behörighetstoken**, inte rösten (5.B). Röstinnehållet hanteras av VVPAT som primärt spår, med re-encryption-mixnet + oberoende verifieringsapp som option |
| Raft-konsensus med aktiv-aktiv replikering | Raft är ledarbaserat och motsäger aktiv-aktiv. Konsensus tillför ingen kryptografisk garanti. Split-brain-skydd tvingar minoriteten till papper ändå. | Offline-först design. Vallokalen behöver ingen nätverksuppkoppling. Kvorumsignerad publicering i efterhand |
| BankID för legitimering | BankID ägs av bankkonsortiet och motsäger v1:s krav på "uteslutande statliga aktörer". Men kravet var fel formulerat — det relevanta är inte ägarform utan godkänd tillitsnivå. | Leverantörsoberoende federation (4.4, 5.B): alla utfärdare godkända under tillitsramverket accepteras likvärdigt — Sverige-id (Polisen), BankID, Freja eID+ och eIDAS-plånböcker. BankID behålls |
| Publik hashkedja ger transparens | En append-only-logg ger loggintegritet, inte valintegritet. Den säger inget om röster räknats rätt. | Merklelogg för resultatprotokoll + riskbegränsad omräkning (RLA) mot papperssedlarna |

Ett problem som version 1 inte behandlade alls har dessutom fått ett eget avsnitt
(4.3): den öppna räkningen i vallokalen. Det är det tyngsta hindret, och det är
inte kryptografiskt.

**Ändringar i version 2.1.** E-legitimeringslagret är omskrivet från en enda
statlig utfärdare till en leverantörsoberoende federation (4.4, 5.B), och den
blindsignatur som version 1 använde på valsedeln har flyttats till det objekt där
den faktiskt fungerar: behörighetstoken. BankID behålls som godkänd utfärdare.
Version 2.0 innehöll ett sakfel — den angav "Skatteverkets statliga e-legitimation"
som alternativ. Skatteverket utfärdar ingen e-legitimation. Den statliga
e-legitimationen är Polisens Sverige-id, införd genom Lag (2026:1358) med ikraft-
trädande 1 december 2026.

---

## 1. Sammanfattning

Sverige digitaliserar inte valsedeln först. Systemet digitaliserar **räknandet,
transporten och granskningen** — och behåller papperet som den auktoritativa
recorden.

Väljaren legitimerar sig med valfri godkänd e-legitimation — Sverige-id, BankID,
Freja eID+ eller en eIDAS-plånbok — och får en blindsignerad behörighetstoken
som bryter kopplingen mellan identitet och röst matematiskt. Ingen utfärdare får
veta var eller hur väljaren röstat. Ingen enskild utfärdare kan stänga av ett val.

Väljaren markerar sin röst på en terminal i vallokalen. Terminalen skriver ut en
fysisk valsedel som väljaren läser, bekräftar och själv lägger i urnan. Inget
digitalt spår av rösten finns efter att väljaren lämnat båset. Vad som däremot
finns är ett signerat resultatprotokoll från varje vallokal, publicerat i en
öppen logg, och en statistiskt grundad omräkningsmetod som gör att ett felaktigt
resultat kan upptäckas med kvantifierbar sannolikhet.

Detta kräver ingen grundlagsändring, bevarar den offentliga räkningen i vallokalen,
och förbättrar den faktiska säkerheten jämfört med dagens system i stället för att
byta ut en fungerande mekanism mot en obeprövad.

Ett fullt digitalt spår (avsnitt 5.D) specificeras som framtida option, men är
medvetet inte en del av fas 1–3.

---

## 2. Vad som faktiskt är trasigt

Innan arkitektur anges behöver problemet formuleras korrekt. Det ursprungliga
dokumentet utgick från att pappersval är "sårbara för felräkning i skymundan".
Det är sant men ofullständigt. De reella svagheterna är:

1. **Räkningen saknar oberoende verifiering.** Det finns ingen systematisk metod
   för att avgöra om ett rapporterat resultat avviker från de faktiska sedlarna,
   annat än vid särskilt beslutad omräkning.
2. **Resultattransporten är en kedja av mänskliga överföringar.** Från vallokal
   till kommun till central nivå. Varje länk är en integritetsrisk utan
   kryptografiskt skydd.
3. **Tillgänglighet.** Papperssedlar är ett reellt hinder för väljare med
   synnedsättning eller läs- och skrivsvårigheter. Detta är det starkaste
   argumentet för digital assistans — och det kräver inte att rösten lagras digitalt.
4. **Förtroende.** Förtroende byggs av att utomstående kan kontrollera, inte av
   att processen beskrivs som säker.

Notera vad som **inte** finns på listan: valhemligheten. Den nuvarande ordningen
är stark på den punkten. Ett system som försämrar den för att lösa 1–4 är en
dålig affär.

---

## 3. Säkerhetsmål och hotmodell

Version 1 saknade hotmodell. Utan den går det inte att avgöra vilka kontroller
som är relevanta.

### 3.1 Mål

- **M1 — Valhemlighet.** Ingen aktör, ensam eller i samverkan, kan koppla en
  väljare till en röst.
- **M2 — Ingen dubbelröstning.** Varje röstberättigad kan rösta högst en gång.
- **M3 — Cast-as-intended.** Väljaren kan fastställa att det som registrerats
  överensstämmer med det val hen gjorde.
- **M4 — Räkningsintegritet.** Ett felaktigt resultat upptäcks med kvantifierbar
  sannolikhet.
- **M5 — Tillgänglighet.** Systemet fungerar för väljare med funktionsnedsättning.
- **M6 — Avbrottsresiliens.** En vallokal kan fullfölja valet utan nätverk,
  utan centrala system och utan specialistkompetens.

### 3.2 Motståndare

- **A1 — Utomstående angripare** med nätverksåtkomst, ingen fysisk närvaro.
- **A2 — Insider i enskild myndighet** med administratörsrättigheter i ett
  delsystem.
- **A3 — Insider i vallokal** (manipulerad eller hotad valförrättare).
- **A4 — Staten själv** som vill kunna kartlägga röstning i efterhand.
- **A5 — Leverantör** i mjukvarans försörjningskedja.

### 3.3 Uttryckligen utanför scope

- **Distansröstning.** Inget i denna arkitektur tillåter röstning utanför
  vallokalen. Detta är ett medvetet beslut, inte en brist: distansröstning gör
  M1 och M3 omöjliga att garantera samtidigt, eftersom väljaren befinner sig i en
  miljö som systemet inte kan observera och där tvång inte kan uteslutas.

### 3.4 Vad hotmodellen avslöjar

Mot A3 och A5 ger kryptografi **inget** skydd. En valförrättare som byter ut
sedlar i urnan, eller en leverantör som komprometterar byggkedjan, kan inte
stoppas av en hashkedja. Dessa hot hanteras av organisationskontroller
(personalkontroll, åtskilda behörigheter, reproducerbara byggen) och av RLA som
detekterar resultatet av manipulation oavsett var i kedjan den skett.

Detta är skälet att papperssedeln behålls: den är det enda artefakt som överlever
kompromettering av hela den digitala stacken.

---

## 4. Juridisk efterlevnad

### 4.1 Regeringsformen 3 kap. 1 § — hemliga val

Uppfylls genom att ingen digital representation av rösten existerar efter det att
väljaren bekräftat den utskrivna sedeln. Terminalen skriver, väljaren läser,
sedeln hamnar i urnan, terminalens session nollställs. Det som lagras är antalet
avgivna röster per parti — inte per väljare, inte i någon ordning som kan
kopplas till en individs tidpunkt i lokalen.

### 4.2 Vallagen — likabehandling

Papperssedlar finns alltid tillgängliga parallellt. En väljare som inte vill
eller kan använda terminalen röstar exakt som idag. Ingen väljare tvingas in i
ett digitalt flöde.

### 4.3 Den öppna räkningen — det verkliga hindret

**Detta avsnitt fanns inte med i version 1 och är det viktigaste.**

Svensk valtradition vilar på att räkningen sker öppet i vallokalen, inför
närvarande allmänhet och partiombud. Det är inte en detalj i processen — det är
den mekanism genom vilken förtroende faktiskt skapas. En medborgare kan stå i
vallokalen och se sina grannars röster räknas.

Ett system där röster krypteras, blandas i ett mixnet och dekrypteras centralt
tar bort denna möjlighet helt. Medborgaren erbjuds i stället att lita på att
kryptografin är korrekt — vilket kräver specialistkompetens som praktiskt taget
ingen väljare har. Argumentet i version 1 ("matematiska bevis ersätter blind
tilltro") byter ut blind tilltro till manuella processer mot blind tilltro till
kryptografiska processer. Det är ingen förbättring ur förtroendesynpunkt.

**Slutsats:** arkitekturen måste bevara räkningen i vallokalen. Det är ett hårt
designkrav, och det är skälet att VVPAT är primärt spår och mixnet är en option.

### 4.4 E-legitimering — federerad, inte statligt monopol

**Version 1:s krav var fel formulerat.** "Infrastrukturen kontrolleras uteslutande
av statliga aktörer" är inte ett meningsfullt säkerhetskrav för
identitetslagret. Det relevanta kriteriet är inte vem som äger utfärdaren utan
vilken **tillitsnivå** e-legitimationen är godkänd på, och om utfärdaren står
under tillsyn. Ägarformen skyddar inte mot något hot i hotmodellen — en statlig
aktör är lika kapabel till A2 och A4 som en privat.

**Det faktiska läget i Sverige, september 2026:**

| Utfärdare | Form | Tillträde | Roll i systemet |
|---|---|---|---|
| **Polismyndigheten** — Sverige-id | App, statlig e-legitimation enligt Lag (2026:1358) om statlig e-legitimation och elektronisk identifiering. I kraft 1 december 2026 | Högsta tillitsnivån | Föredragen utfärdare. Statlig, och den första svenska e-legitimation som är utfärdad under ett lagstiftat ramverk |
| **Finansiell ID-Teknik BID AB** — BankID | App / fil, privaträttslig | Godkänd under tillitsramverket för svensk e-legitimation (Digg) | Accepteras likvärdigt. Störst utbredning i befolkningen |
| **Freja** — Freja eID+ | App, privaträttslig | Godkänd på hög nivå | Accepteras likvärdigt |
| **Skatteverket** | Utfärdar **ingen** e-legitimation | — | Två roller: (1) folkbokföringsmyndighet och därmed källa till uppgifterna som ligger till grund för röstlängden, (2) den myndighet som hanterar kopplingen mellan europeiska eID-handlingar och svenska personnummer |
| **eIDAS-plånböcker** | EU-medborgares nationella digitala identiteter | Notifierad nivå substantial/high | Nödvändig för EU-medborgares rösträtt, se nedan |

Version 1 angav "Skatteverkets statliga e-legitimation" som alternativ till
BankID. Den finns inte. Den statliga e-legitimationen är Polisens Sverige-id.

**Varför flera utfärdare är ett krav, inte en bekvämlighet:**

1. **Likabehandling.** Vallagen kräver att alla röstberättigade behandlas lika.
   Att kräva en enda specifik e-legitimation utesluter i praktiken de väljare som
   inte har den — äldre, personer utan bankförbindelse, personer under
   förmyndarskap, nyanlända. EU-medborgare med rösträtt i kommun- och regionval
   har ofta ingen svensk e-legitimation alls och identifieras i stället via sin
   nationella eIDAS-handling, som Skatteverket kopplar till person- eller
   samordningsnummer. En enda utfärdare gör alltså M5 och likabehandlingskravet
   omöjliga att uppfylla.
2. **Resiliens (M6).** BankID har haft driftstörningar. Med fyra oberoende
   utfärdare är ett bortfall hos en ingen katastrof — väljaren använder en annan.
   Detta är en väsentlig förbättring jämfört med både v1 och v2:s tidigare text.
3. **Statlig förankring utan statligt monopol.** Sverige-id ger en statlig väg in
   som inte är beroende av banksektorn. BankID och Freja behålls eftersom de redan
   finns i befolkningens fickor och eftersom tvingande migration skulle minska
   valdeltagandet.

**Det juridiska krav som faktiskt ställs** är därför inte ägarform utan:

- Endast e-legitimationer godkända på hög tillitsnivå under tillitsramverket för
  svensk e-legitimation, eller notifierade på nivå *substantial*/*high* enligt
  eIDAS, accepteras.
- Ingen utfärdare får samtidigt driva någon del av systemet som hanterar
  röstinnehåll eller behörighetstoken. Åtskillnaden är organisatorisk och
  kontraktuell, och gäller oavsett om utfärdaren är statlig eller privat.
- Utfärdaren får aldrig motta information om vallokal, tidpunkt eller valresultat
  utöver vad som krävs för själva legitimeringen. Se 5.B för hur detta begränsas.

**Kvarstående juridisk osäkerhet som måste utredas:** huruvida uppgiften *att* en
person har röstat omfattas av sekretess. Sekretessen gäller hur en person röstat;
frågan om huruvida avprickningen som sådan är offentlig har inte prövats i denna
kontext och måste klaras av Valmyndigheten innan produktion, eftersom utfärdarnas
loggar i praktiken kan komma att innehålla den uppgiften.

---

## 5. Arkitektur

### 5.A Fysisk attest (ersätter geofencing)

**Syfte:** säkerställa att terminalen står under vallokalens kontroll.

Säkerheten kommer inte från position, utan från **fysisk förvaring**. Kontrollerna:

1. Terminalen är utlämnad och förseglad av Valmyndigheten till vallokalen.
   Kvittens skrivs av valförrättaren.
2. Enheten har TPM-buren attesteringsnyckel. Vid uppstart signerar den en
   attestering över uppmätt bootkedja och körtidsmiljö. Utan godkänd attestering
   vägrar enheten visa valsedelsskärmen.
3. Mjukvaran byggs reproducerbart. Byggartifactens hash publiceras före valet så
   att vem som helst kan verifiera att den körda binären motsvarar den granskade
   källkoden.
4. Enheten har ingen generell nätverksåtkomst. Endast en allowlistad kanal till
   avprickningstjänsten, och den kan vara nere utan att röstandet påverkas.

GPS eller nätverksgeofencing används **inte** som säkerhetsmekanism. Om
positionsdata samlas in alls är det för logistik, aldrig för åtkomstkontroll.

### 5.B Identifikation, federation och blindad behörighetstoken

**Syfte:** förhindra dubbelröstning (M2) utan att någon aktör kan koppla en
väljare till en röst (M1) — och utan att göra detta beroende av en enskild
e-legitimationsutfärdare.

Detta är den största förändringen mot version 1. Blindsignaturidén var rätt, men
satt på fel objekt. Den ska inte signera rösten, utan **behörigheten att rösta**.

#### 5.B.1 Federationen

Avprickningstjänsten är en *relying party* mot flera oberoende identitetsleverantörer
samtidigt. Väljaren väljer själv:

- **Sverige-id** (Polismyndigheten, statlig, från 1 december 2026) — föredragen
- **BankID** (Finansiell ID-Teknik BID AB)
- **Freja eID+**
- **eIDAS-plånbok** för EU-medborgare med rösträtt i kommun- och regionval,
  där Skatteverkets koppling till person- eller samordningsnummer används
- **Manuell legitimering** med fysisk ID-handling och avprickning i pappersröstlängden

Alla vägar leder till exakt samma resultat: en bekräftad binär flagga och en
token. Vilken väg väljaren tog lagras inte i något system som har åtkomst till
röstinnehåll.

Protokollet är leverantörsoberoende — OpenID Connect med eIDAS-kompatibla
intyg, eller SAML där leverantören kräver det. En ny utfärdare kan anslutas utan
att resten av systemet ändras. Detta är en medveten designprincip: valet ska
inte vara gisslan hos ett enskilt företags driftstatus eller affärsbeslut.

**Data-minimering mot utfärdaren.** Utfärdaren får se att en legitimering begärts
av en tjänst med ett generiskt namn, och returnerar ett intyg. Utfärdaren får
aldrig: vallokalens identitet, väljarens rösträttstatus, huruvida flaggan redan
var satt, eller något om röstinnehåll. Requesten går via en mellanliggande
statlig legitimeringsproxy vars enda uppgift är att dölja vallokalssammanhanget
från utfärdaren. Proxyn loggar inte och har ingen koppling till någon senare del
av flödet.

#### 5.B.2 Behörighetstoken — flödet

```
Väljare                Avprickning            Tokenmyndighet         Valsedelsterminal
   |                    (röstlängd)            (signeringsnyckel)          |
   |--- 1. e-legitimering via valfri utfärdare ---------------------------> |
   |                    |                          |                        |
   |                    |-- 2. kontrollera rösträtt, sätt flagga "har röstat"
   |                    |                          |                        |
   |--- 3. begär token (blinded) ----------------->|                        |
   |                    |                          |-- signera blindat token |
   |<-- 4. blindsignerad token --------------------|                        |
   |                                                                       |
   |--- 5. presentera token (avbländad, ingen identitet) ----------------->|
   |                                                                       |-- 6. verifiera
   |<--- 7. valsedelsskärm aktiverad --------------------------------------|
```

**Steg 1–2.** Väljaren legitimerar sig. Avprickningstjänsten kontrollerar mot
röstlängden och sätter flaggan. Har flaggan redan satts avbryts flödet — detta
är dubbelröstningsskyddet. Tjänsten returnerar *ingenting* om rösträtten till
någon annan part än ett godkännande till tokenmyndigheten.

**Steg 3.** Klienten genererar ett slumptal som tokenmaterial, multiplicerar det
med en bländningsfaktor och skickar det blindade materialet till tokenmyndigheten.

**Steg 4.** Tokenmyndigheten signerar det blindade materialet. Den ser inte
tokenmaterialet och kan inte känna igen det senare. Signaturen returneras.
Klienten avbländar och får en giltig token som tokenmyndigheten **aldrig kan
känna igen igen**.

**Steg 5–6.** Väljaren går till valsedelsterminalen och presenterar token — utan
identitet, utan personnummer, utan referens till steg 1–4. Terminalen verifierar
signaturen mot tokenmyndighetens publika nyckel och kontrollerar att token inte
redan använts.

**Steg 7.** Skärmen aktiveras. Väljaren röstar enligt 5.C.

#### 5.B.3 Vad detta faktiskt köper

Kopplingen mellan identitet och röst är nu **matematiskt** bruten, inte
organisatoriskt. Tokenmyndigheten har signerat en token den inte kan känna igen.
Avprickningstjänsten vet att någon röstade men inte vad. Valsedelsterminalen vet
att en behörig token presenterades men inte av vem. Ingen kombination av dessa
tre loggar återskapar kopplingen — till skillnad från version 1, där
korrelation på tidpunkt mellan avprickning och röstavgivning var möjlig för
varje aktör med tillgång till båda.

Detta gäller även mot A4 (staten själv) och även om en enskild myndighet är
komprometterad (A2).

#### 5.B.4 Ärliga begränsningar

**Token är en bärartoken.** Den som innehar en giltig token kan rösta. Den kan i
princip överlåtas eller tvingas fram. Detta går inte att lösa kryptografiskt
utan att återinföra kopplingen till identitet — det är bärarobjektets hela
poäng. Begränsningarna som håller risken nere:

- Kort livslängd, storleksordningen minuter, bunden till vallokalen.
- Utfärdas och förbrukas i samma fysiskt övervakade lokal, under
  valförrättarkontroll enligt 5.A.
- En token ger rätt till exakt en röst. Återanvändning detekteras vid steg 6.
- Röstköp och påverkan i vallokal är brottsliga handlingar som i praktiken
  kräver vittnen — lokalens fysiska övervakning är skyddet, inte kryptografin.

Detta är **svagare** än dagens flöde, där väljaren personligen tar emot en
fysisk sedel av valförrättaren. Skillnaden måste redovisas öppet. Motvikten är
att dagens flöde saknar skydd mot korrelation mellan avprickning och röst, vilket
token löser. Det är en avvägning, inte en entydig förbättring.

**Avveckling av tokenmaterialet.** Om klienten är en vallokalsterminal som delas
mellan väljare måste tokenmaterial och bländningsfaktor nollställas ur minnet
mellan väljare, och terminalen får inte kunna koppla en token till den
föregående sessionen. Detta är ett hårt krav på implementeringen och en
förutsägbar källa till fel.

**Tokenmyndigheten är en centraliserad tillitspunkt.** Den kan inte skapa
extra behörighet utan avprickningstjänstens godkännande, men en komprometterad
signeringsnyckel tillåter utfärdande av godtyckliga token. Nyckeln måste ligga
i HSM med delad kontroll och ceremoniell nyckelrotation före varje val.

#### 5.B.5 Degradation utan avbrott

Om någon del av kedjan faller — utfärdare, proxy, avprickningstjänst eller
tokenmyndighet — skriver valförrättaren av manuellt i den fysiska röstlängden
och väljaren får en papperssedel, exakt som idag. Flödet har en enda
auktoritativ källa för rösträtt och den är papperet. Ett digitalt bortfall
degraderar till 2026-års process, inte till ett inställt val.

Detta gäller också för väljare som saknar varje form av e-legitimation. De är
inte en felmarginal i designen utan en förstaklassig väg.

**Inget röstinnehåll passerar något av dessa system.** Aldrig, i någon riktning.

### 5.C Valsedel — primärt spår: VVPAT

Väljaren gör sitt val på terminalen. Terminalen skriver ut en fysisk valsedel
bakom glas. Väljaren **läser** sedeln — den kan inte ändras, inte tas med, inte
fotograferas utan att bryta ordningen — bekräftar och lägger den i urnan.

Egenskaper:

- Papperssedeln är den **auktoritativa recorden**. Alla digitala siffror är
  härledningar ur den, aldrig tvärtom.
- Räkningen sker öppet i vallokalen som idag. Terminalen räknar med som en
  oberoende kontroll, men avvikelser löses alltid till papperets fördel.
- Väljaren kan kontrollera sin röst med egna ögon. M3 är uppfyllt utan
  kryptografiskt antagande.
- Tillgänglighet (M5) löses: skärm, ljud och anpassat gränssnitt i båset.

Detta är den beprövade modellen. Den är mindre elegant än ett mixnet och den är
betydligt svårare att angripa.

### 5.D Valsedel — framtida option: mixnet med verifieringskod

Specificeras här men byggs inte i fas 1–3, eftersom 4.3 inte är löst.

Om ett fullt digitalt spår senare utreds gäller:

- Rösten krypteras med ElGamal över en grupp med distribuerad nyckelgenerering.
  Ingen enskild myndighet innehar hela dekrypteringsnyckeln; en kvorum av
  åtskilda valnämnder krävs.
- En **re-encryption-mixnet** med minst tre oberoende noder blandar och
  omkrypterar sedlarna. Varje nod lämnar ett nollkunskapsbevis för att blandningen
  är korrekt (Bayer–Groth eller motsvarande). Manipulation av en nod detekteras.
- Väljaren får en **verifieringskod**. Efter valet publiceras de dekrypterade
  sedlarna med sina koder. Väljaren kontrollerar att hens kod finns med.
- **Begränsning som måste sägas rakt ut:** verifiering på samma enhet som användes
  för att rösta bekräftar bara att den röst som skickades finns i urnan
  (*cast-as-recorded*). För *cast-as-intended* — att terminalen inte visade A och
  krypterade B — krävs verifiering på en **oberoende enhet**, typiskt väljarens
  egen telefon med en app som dekrypterar själv. Detta är modellen Estland införde
  2013, och dess begränsning är att den förutsätter att väljarens telefon inte är
  komprometterad.

Ett mixnet ger alltså svagare M3 än en utskriven sedel som väljaren läser med
egna ögon. Det är skälet att det inte är primärt spår.

### 5.E Resultattransport (ersätter Raft)

**Konsensus behövs inte och tas bort.** Röster och resultatprotokoll är
append-only-artefakter, inte tillstånd som måste konvergera i realtid.

Designen är **offline-först**:

1. Vallokalen räknar. Resultatet skrivs till ett **resultatprotokoll** som
   signeras av vallokalens nyckel och medsigneras av valförrättare och
   närvarande partiombud.
2. Protokollet kan skapas och lagras lokalt utan någon uppkoppling. Vallokalen
   är aldrig beroende av att nätet fungerar — detta är en styrka i dagens system
   som inte får kasseras.
3. När uppkoppling finns publiceras protokollet i den offentliga loggen. Flera
   oberoende kanaler (nät, SMS-gateway, fysisk budbärare med signerad artifact)
   accepteras; loggen avgör vilket som anlänt först och alla kopior måste vara
   identiska.
4. Publiceringen bekräftas av en kvorum av oberoende publiceringsnoder. En nod som
   avviker utesluts. Ingen ledarnod, ingen split-brain-problematik.

Tillgängligheten kommer från att systemet **inte behöver vara tillgängligt** för
att valet ska genomföras. Det är en väsentligt starkare position än
replikering.

### 5.F Offentlig verifierbarhet — Merklelogg + RLA

Två skikt, eftersom de löser olika problem:

**Skikt 1: Merklelogg för resultatprotokoll.** Varje publicerat protokoll läggs
i ett append-only-träd. Roten publiceras kontinuerligt på oberoende kanaler
(Myndighetens webbplats, partiernas, media, utländska observatörer). En aktör som
i efterhand försöker byta ut ett protokoll måste förfalska en rot som redan
publicerats på flera håll. Detta ger **loggintegritet**.

**Skikt 2: Riskbegränsad omräkning (RLA).** Detta ger **valintegritet** och är
den del version 1 helt saknade.

- Ett slumpmönster genereras ur offentlig entropi (tärningsslag utförda
  ceremoniellt och direktsända, som i flera befintliga RLA-implementeringar).
  Ingen aktör kan välja mönstret.
- Urvalet avgör vilka papperssedlar som ska jämföras mot det digitala
  resultatet.
- Omräkningen avslutas när statistisk säkerhet uppnåtts — typiskt efter en bråkdel
  av sedlarna — eller eskalerar till full omräkning om avvikelse hittas.
- Metoden är öppen, granskbar och kan köras av vem som helst med tillgång till
  urnorna. Partier och allmänhet behöver inte lita på Valmyndighetens
  implementering, eftersom RLA är publik och körbar av tredje part.

En hashkedja som bara visar att antalet avprickade matchar antalet röster —
version 1:s förslag — säger ingenting om rösterna räknats rätt. RLA gör det,
och kräver papper. De två skikten kompletterar varandra; inget av dem räcker
ensamt.

---

## 6. Det som medvetet inte byggs

Att vara explicit om detta är en del av specifikationen.

- **Distansröstning och poströstning via internet.** Se 3.3.
- **Konsensusprotokoll för röster.** Se 5.E.
- **Positionsbaserad åtkomstkontroll.** Se 5.A.
- **Digital röstning som ersättning för papper.** Papperet är recorden. Det
  digitala är assistans, kontroll och transport.
- **Nödlägesbrytare som stänger av pappersspåret.** Finns inte. Ett spår som kan
  stängas av centralt är en attackyta.
- **Bindning till en enskild e-legitimationsutfärdare.** Systemet accepterar alla
  godkända utfärdare likvärdigt. Att göra valet beroende av ett enskilt företags
  driftstatus eller affärsbeslut är inte acceptabelt. Se 4.4 och 5.B.1.
- **Lagring av väljarens identitet i röstkeden.** Personnummer, e-legitimationsintyg
  och utfärdaridentifiering stannar i avprickningens domän och lämnar den aldrig.
  Behörighet överförs framåt som en blindad token utan identitetsuppgift.

---

## 7. Motargument — bemötta ärligt

Version 1 besvarade tre invändningar med argument som inte höll. Nedan återstår
invändningarna, med korrekta svar där sådana finns och med erkännande där de inte
gör det.

**"Papper är långsamt och dyrt."**
Svar: Kostnaden för RLA och signerade protokoll är marginell jämfört med
kostnaden för ett val som inte kan verifieras. Däremot är det sant att
terminaler i varje vallokal är en reell investering. Den motiveras primärt av
tillgänglighet (M5), inte av effektivitet.

**"Det går inte att granska för en lekman."**
Svar: Korrekt för mixnetspåret — och därför är det inte primärt spår. För VVPAT
är svaret att väljaren granskar sin egen röst med ögonen och att RLA kan köras av
vem som helst med tillgång till urnorna och den publicerade entropin. Ingen
kryptografisk kunskap krävs. Vi byter inte blind tilltro mot en annan blind
tilltro.

**"Risk för systemhaveri."**
Svar: Systemet är offline-först. Vallokalen kan genomföra och räkna ett val utan
nätverk, utan centrala tjänster och utan att terminalen fungerar — papperssedlar
finns alltid. Ett haveri degraderar till dagens process, inte till ett inställt
val. Detta är sannolikt starkare än dagens läge, eftersom resultattransporten
idag saknar kryptografisk integritet.

**"Hot mot valhemligheten."**
Svar: Ingen digital representation av rösten existerar efter bekräftelse. Det
finns mindre att läcka än i ett system som lagrar krypterade röster i decennier,
där en senare komprometterad nyckel eller bruten blindning deanonimiserar
retroaktivt. Papper har inget minne.

**"Ni digitaliserar inte valet, bara kringarbetet."**
Svar: Det är avsikten. Digitalisering av själva röstavgivandet försämrar M3 och
tar bort den offentliga räkningen (4.3). Vi digitaliserar där digitalisering
faktiskt förbättrar säkerheten och lämnar det som fungerar.

**"Privata företag som BankID ska inte ha en roll i ett val."**
Svar: Delvis berättigat, och därför är Sverige-id föredragen utfärdare från och
med december 2026. Men att utesluta BankID och Freja skulle i praktiken utesluta
de väljare som bara har dessa, vilket strider mot likabehandlingskravet. Lösningen
är inte monopol utan data-minimering: utfärdaren får aldrig veta vallokal,
rösträttstatus eller röstinnehåll, och legitimeringsproxyn döljer
valsammanhanget. Utfärdaren ser en legitimering, inte ett val. Därtill är
utfärdarna utbytbara — federationen innebär att inget enskilt företag kan stänga
av ett val.

**"Behörighetstoken kan säljas eller tvingas fram."**
Svar: Ja. Det är bärartokens inneboende egenskap och den går inte att lösa
kryptografiskt utan att återinföra den koppling till identitet som hela designen
syftar till att bryta. Skyddet är fysiskt, inte matematiskt: kort livslängd,
bundenhet till vallokalen, valförrättarkontroll och att röstköp i lokalen är ett
brott med vittnen. Detta är svagare än dagens flöde, där väljaren personligen
tar emot sin sedel. Vi redovisar det som en avvägning i 5.B.4 i stället för att
bortförklara det. För väljare som inte vill ta den risken finns alltid den
manuella vägen med pappersröstlängd.

**Invändning vi inte kan besvara:** om en valförrättare systematiskt manipulerar
sedlar i urnan i många vallokaler samtidigt, detekterar RLA avvikelsen men kan
inte tillskriva orsaken. Ingen arkitektur löser organiserad insidermanipulation
med fysisk tillgång till sedlarna. Detta hanteras av personalkontroll,
åtskilda behörigheter och flerögonprincipen vid räkningen — inte av kryptografi.
Det är en ärlig begränsning och den gäller dagens system i samma utsträckning.

---

## 8. Handlingsplan

### Fas 1 — Verifiering utan valsedelsförändring (0–12 månader)
Ingen förändring av hur väljaren röstar. Levererar M4.

1. **RLA-verktyg.** Öppen källkod, granskningsbar, körbar av tredje part.
   Ballot-comparison-audit mot digitala resultatprotokoll.
2. **Signerade resultatprotokoll.** Format, signeringsflöde, nyckelhantering.
   Vallokalsnyckel i TPM eller motsvarande hårdvaruenhet.
3. **Merklelogg** med publik rotdistribution och oberoende verifieringsklient.
4. **Pilot i ett begränsat antal vallokaler** vid ett mellanliggande val, med
   Valmyndigheten som granskare.

Fas 1 kräver ingen lagändring och kan genomföras inom nuvarande regelverk.

### Fas 2 — Assisterad röstavgivning (12–30 månader)
Levererar M5 och M3.

5. **VVPAT-terminal.** Utskrift bakom glas, ingen möjlighet att exportera eller
   ändra sedeln efter utskrift.
6. **Reproducerbara byggen** och publicerad byggartefakthash före varje val.
7. **TPM-attestering** av bootkedja och körtidsmiljö.
8. **Tillgänglighetsprofil:** skärmläsare, ljudspår, anpassat gränssnitt.

### Fas 3 — Federation, avprickning och token (24–42 månader)
Levererar M1 och M2.

9. **Legitimeringsproxy och federation.** OpenID Connect-baserad RP mot flera
   utfärdare samtidigt: Sverige-id, BankID, Freja eID+, eIDAS-plånböcker.
   Data-minimering enligt 5.B.1 — ingen utfärdare får vallokalssammanhang.
10. **Tokenmyndighet.** Blindsignering av behörighetstoken, HSM-buren
    signeringsnyckel med delad kontroll, ceremoniell rotation före varje val.
11. **Avprickningstjänst** med organisatorisk åtskillnad från allt som rör
    röstinnehåll, och med manuell pappersfallback som förstaklassig väg.
12. **Offline-första publiceringsvägar** med kvorumbekräftelse.
13. **Formell hotmodellsgenomgång** med extern granskare före varje valcykel.

**Tidsrealism.** Sverige-id lanseras 1 december 2026 och är vid lanseringen
oprövat i stor skala. Nästa ordinarie riksdagsval är 2030; EU-parlamentsvalet
2029 är den första realistiska arenan för en begränsad pilot. Detta ger tid att
utvärdera Sverige-id under drift innan något val vilar på det — och är ett
ytterligare skäl att federationen inte får göras beroende av en enskild utfärdare,
oavsett om den är statlig.

### Fas 4 — Option, endast vid ändrad förutsättning
14. Mixnet och verifieringskod enligt 5.D. Kräver att frågan i 4.3 — den öppna
    räkningen — är politiskt och juridiskt löst. Inte schemalagd.

---

## 9. Öppna problem

Dessa är olösta och ska inte döljas i en specifikation.

- **4.3 — den öppna räkningen.** Så länge ett digitalt spår flyttar räkningen
  från vallokalen till en central process förloras den mekanism som faktiskt
  bär förtroendet. Vi har ingen lösning, och därför är mixnetspåret en option.
- **Terminalens kostnad och underhåll.** Tusentals enheter i svenska vallokaler
  är en logistisk och ekonomisk fråga som inte är utredd här.
- **RLA vid mycket jämna val.** Riskbegränsad omräkning kräver större urval när
  marginalen är liten. Vid ett val med några hundra rösters marginal kan RLA
  i praktiken bli en full omräkning. Det är korrekt beteende, men det bör
  kommuniseras i förväg.
- **Långsiktig sekretess.** Om ett framtida mixnet lagrar krypterade röster
  måste hemligheten hålla i decennier. Kvantberäkningsresistenta konstruktioner
  är inte mogna för produktionsbruk i denna kontext. Ett skäl ytterligare att
  hålla papperet primärt.
- **Är avprickningen som sådan offentlig?** Sekretessen gäller hur en person
  röstat. Frågan om uppgiften *att* en person har röstat omfattas av sekretess är
  inte utredd. Den måste klaras innan produktion, eftersom federationen innebär
  att flera utfärdare — varav några privata — i sina loggar kan komma att se att
  en legitimering skett mot en valtjänst vid en given tidpunkt. Se 4.4.
- **Bärartokens överlåtbarhet.** Behörighetstoken är anonym och kan därför i
  princip överlåtas eller tvingas fram. Skyddet är fysiskt och organisatoriskt,
  inte kryptografiskt. Det finns ingen lösning som både bevarar M1 och eliminerar
  denna risk — det är en grundläggande spänning, inte en implementeringsbrist.
  Se 5.B.4.
- **Sverige-id är oprövat.** Lansering 1 december 2026. Ingen erfarenhet finns
  ännu av utfärdarens tillgänglighet eller prestanda under samtidig hög belastning,
  vilket ett val innebär. Federationen måste därför vara fullt fungerande med
  BankID och Freja som primära vägar under den första valcykeln, även om
  Sverige-id är den föredragna utfärdaren i specifikationen.

---

## 10. Slutsats

Den ursprungliga idén — att Sverige bör modernisera valprocessen kryptografiskt —
är rätt. Den ursprungliga arkitekturen valde fel punkt att attackera.

Genom att behålla papperssedeln som auktoritativ record, digitalisera assistans
och transport, och lägga till riskbegränsad omräkning får Sverige ett val som
för första gången är **matematiskt verifierbart av utomstående** utan att
valhemligheten eller den öppna räkningen offras. Det är en förbättring som kan
levereras inom nuvarande lagstiftning, med en pilot i fas 1, och som inte
förutsätter att väljaren litar på kryptografi hen inte kan granska.

Ett system som kräver blind tilltro till matematik i stället för blind tilltro
till människor är inte en framgång. Ett system som kräver ingen tilltro alls,
för att vem som helst kan räkna om, är det.