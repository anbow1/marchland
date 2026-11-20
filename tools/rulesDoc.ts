// docs/RULES.md: every rule of the game in one place (Polish), the numbers read from src/config.ts so the
// document cannot drift from the game. Written by tools/docs.ts (npm run docs).
import { AI, AI_CHARACTERS, MAP, AI_TUNING, ARMY, CAMPAIGN, CAPTAIN, CARTS, CHAPEL, COMBAT, DEFENCE, ELEVATION, FATIGUE, FOOD, FORMATION, GATE, KEEP_BAYS, KEEP_LEVELS, KEEP_UPGRADE_SECONDS, MISSILE, MORALE, PAY, POINTS, REARM, REINFORCE, TOWER, TOWN, UNITS, VETERANS, WALLS } from '../src/config.ts';
import { type ResourceId, UNIT_KINDS, type UnitKind } from '../src/sim/types.ts';
import { GOOD_PL, UNIT_PL } from './docs.ts';

const pct = (v: number): string => `${Math.round(v * 100)} %`;
/** A number without float noise (1.8, not 1.7999999999999998). */
const num = (v: number): string => String(Math.round(v * 100) / 100);
const sec = (s: number): string => (s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${s} s`);

export function rulesDoc(): string {
  const shields = UNIT_KINDS.filter((k) => UNITS[k].missileBlock > 0 && !UNITS[k].cavalry && !UNITS[k].engine);
  const braced = UNIT_KINDS.filter((k) => UNITS[k].bonusVsCavalry > 0);
  const chargers = UNIT_KINDS.filter((k) => UNITS[k].chargeBonus > 0);
  const bucklers = UNIT_KINDS.filter((k) => (UNITS[k].shieldDefence ?? 0) > 0);
  const name = (k: UnitKind): string => UNIT_PL[k].name.toLowerCase();
  const goods = (c: Partial<Record<string, number>>): string => Object.entries(c).map(([g, n]) => `${n} ${GOOD_PL[g as ResourceId]}`).join(', ');
  const POINT_PL: Record<string, string> = { mine: 'bogata kopalnia', quarry: 'kamieniołom w polu', village: 'wieś' };
  return `# Marchland — wszystkie zasady gry

*Plik generowany przez \`npm run docs\` z \`src/config.ts\` (tekst w \`tools/rulesDoc.ts\`). Nie poprawiaj ręcznie.
Ceny i statystyki jednostek: [UNITS.md](UNITS.md); budynki, receptury i ceny: [BUILDINGS.md](BUILDINGS.md);
ludność, jedzenie, transport, pola: [ECONOMY.md](ECONOMY.md); ekran, menu i sterowanie: [MANUAL.md](MANUAL.md);
misje: [CAMPAIGN.md](CAMPAIGN.md).*

## 1. Cel gry i tryby

- **Potyczka:** wygrywa strona, która zburzy zamek przeciwnika (${TOWN.keepHp} punktów wytrzymałości na poziomie 1,
  więcej na wyższych). Zamek bronią łucznicy na murach: strzelają do wroga w promieniu ${TOWN.keepRangeM} m co
  ${KEEP_LEVELS.map((l) => `${l.shotIntervalS}`).join(' / ')} s (poziom zamku 1 / 2 / 3), za ${TOWN.keepArrowDamage} obrażeń.
- **Obrona:** ${sec(DEFENCE.lengthS)} przeciw falom; pierwsza po ${sec(DEFENCE.firstWaveS)}, kolejne co
  ${sec(DEFENCE.waveEveryS)}; fale rosną. Przetrwanie do końca to wygrana, upadek zamku — przegrana.
- **Samouczek:** kroki od drwala do koszar; bez przeciwnika.
- **Kampania:** pięć misji z własnymi celami (§14).

## 2. Mapa

- Mapa ${MAP.sizeM} × ${MAP.sizeM} m. Trzy miejsca zamku; zamek przeciwnika stoi zawsze naprzeciw (ten sam układ obrócony).
- Układy: Otwarte pole, Przeprawa (rzeka z groblą i dwoma brodami), Bór, Dolina, Twierdza (kampania).
- **Woda, skała i góry** są nieprzechodnie; w lesie oddziały idą wolniej (piechota ×${ARMY.forestFootSpeedFactor},
  jazda ×${ARMY.forestHorseSpeedFactor}), a strzały trafiają dwa razy rzadziej (×${MISSILE.forestHitFactor}). Wycięty las
  jest zwykłym polem.
- **Wysokość:** strzelcy na wyższym terenie sięgają dalej (do +${pct(ELEVATION.rangeBonus)} przy przewadze
  ${ELEVATION.fullRiseM} m); szarża w dół zboczu (różnica ponad ${ELEVATION.slopeM} m) jest mocniejsza ×${ELEVATION.downhillCharge},
  cios pod górę słabszy o ${ELEVATION.uphillAttack}.
- **Punkty do zajęcia** (kopalnia, kamieniołom, wieś): oddział w szyku stoi przy punkcie (do ${POINTS.radiusM} m)
  przez ${POINTS.holdS} s, a w promieniu ${POINTS.clearM} m nie ma wroga — punkt przechodzi na jego stronę i daje co minutę:
  ${POINTS.list.map((p) => `${POINT_PL[p.kind]} — ${goods(p.perMinute)}`).join('; ')}.
  Punkt zostaje przy właścicielu, aż zajmie go przeciwnik; dwie strony naraz — nikt nie zyskuje.

## 3. Miasto (skrót; szczegóły w ECONOMY.md i BUILDINGS.md)

- Każdy towar ktoś niesie: tragarze noszą surowce do warsztatów i na budowy, wyroby do zamku (i składów), jedzenie
  do chat. Przy zamku oddają towar na ${KEEP_BAYS.count} stanowiskach wokół murów; taczki i wozy trzymają odstęp
  (${CARTS.barrowGapM} m / ${CARTS.wagonGapM} m), czekając najwyżej ${CARTS.queueS} s.
- Budynek stoi w zasięgu zamku (${TOWN.territoryRadiusM} m na poziomie 1, dalej na wyższych), na suchym, równym
  terenie, nie bliżej niż ${TOWN.enemyKeepClearM} m od zamku wroga. Drwal przy lesie, kamieniołom i kopalnia przy
  złożu, rybak nad wodą, zagroda i winnica z ziemią za sobą (rezerwowaną od razu pod wszystkie poziomy).
- Zamek: poziomy 1–3 (${KEEP_UPGRADE_SECONDS} s rozbudowy): zasięg budowy ${KEEP_LEVELS.map((l) => l.territoryM).join(' / ')} m, wytrzymałość
  ${KEEP_LEVELS.map((l) => l.hp).join(' / ')}, koszary do poziomu ${KEEP_LEVELS.map((l) => l.barracks).join(' / ')}.
- Głód (brak racji): produkcja zwalnia, podatki ustają, a górna granica morale wojska spada o
  ${FOOD.starvingMoralePenalty}. Żołnierz zjada ${FOOD.soldierRationsPerMinute} racji na minutę.

## 4. Wojsko: werbunek i utrzymanie

- Limit: ${ARMY.maxSoldiersPerSide} żołnierzy na stronę (w kampanii ${CAMPAIGN.maxSoldiersPerSide}); liczą się żołnierze w polu, w wieżach i w
  kolejce. Kolejka szkolenia: najwyżej ${ARMY.maxRecruitQueue} oddziały.
- Werbunek zabiera wolnych mieszkańców; złoto i sprzęt schodzą z zamku od razu. Koszary poziomu N szkolą jednostki
  do poziomu N; milicja szkoli się przy zamku, działa w ludwisarni.
- **Milicja** to straż domowa: słucha rozkazów tylko do ${ARMY.homeGuardRadiusM} m od własnego zamku i nie atakuje budynków;
  przezbrojona staje się zwykłym wojskiem.
- **Żołd:** ${PAY.goldPerManPerMinute} złota na żołnierza na minutę, pobierany ze skarbca. Gdy zaległość przekroczy minutowy żołd
  (co najmniej ${PAY.minArrears}), wojsko jest nieopłacone: górna granica morale spada o ${PAY.unpaidMoralePenalty}, dopóki zaległość nie
  zostanie spłacona.
- **Łup:** za każdego zabitego wroga do skarbca wpada jego „cena głowy” (kolumna w UNITS.md).
- **Uzupełnianie:** oddział stojący do ${REINFORCE.radiusM} m od koszar (milicja — od zamku), ${REINFORCE.quietS} s bez walki, dostaje brakujących
  ludzi za złoto i sprzęt; nowi rozwadniają doświadczenie, a poległego kapitana zastępuje jeden z nich.
- **Przezbrajanie:** do ${REARM.radiusM} m od koszar, ${REARM.seconds} s; płaci się różnicę sprzętu. Drogi: ${Object.entries(REARM.paths).filter(([, to]) => to.length > 0).map(([from, to]) => `${name(from as UnitKind)} → ${to.map((k) => name(k)).join(', ')}`).join('; ')}.
- **Łączenie** (kampania): dwa oddziały tego samego rodzaju, do ${CAMPAIGN.mergeRadiusM} m od siebie, ${REINFORCE.quietS} s bez walki; ludzie
  przechodzą do liczniejszego, do ${CAMPAIGN.regimentMaxMen}; doświadczenie i morale — średnia ważona.

## 5. Ruch

- Oddział ma „kotwicę” (czoło) i miejsca w szyku; żołnierze idą do swoich miejsc nieco szybciej niż oddział
  (×${ARMY.catchUpFactor}). Gdy ludzie zostają w tyle średnio o ponad ${ARMY.cohesionLagM} m, oddział zwalnia do ${pct(ARMY.cohesionSlowFactor)} tempa.
- Marsz i bieg: tempo jednostki (UNITS.md); bieg męczy (§8). Do ataku podchodzi się biegiem w ostatnich ${ARMY.runWithinM} m.
- Woda, skała, cudze mury: oddział sam szuka drogi (bród, grobla, brama własnej strony) i idzie kolumną po
  ${ARMY.columnFiles}, trzymając się śladu czoła; rozwija się po przejściu ostatniego szeregu. Przez jedną przeprawę idzie naraz
  jeden oddział strony; najdłuższe czekanie 30 s.
- Żołnierz walczy z wrogiem w promieniu ${ARMY.engageRadiusM} m od siebie (przy rozkazie ataku ${ARMY.engageRadiusAttackingM} m), ale nie odchodzi dalej
  niż ${ARMY.leashM} m od swojego miejsca. W marszu i strzelcy w trakcie ostrzału bronią się tylko przed wrogiem bliżej niż
  ${ARMY.selfDefenceRadiusM} m.

## 6. Walka wręcz

Każdy żołnierz zadaje cios co tyle sekund, ile podaje jednostka (±15 %), gdy przeciwnik jest w zasięgu jego broni.

**Szansa trafienia** = ${COMBAT.baseHitChance} + ${COMBAT.hitChancePerPoint} × (atak − obrona) + premia kierunku, ograniczona do
${pct(COMBAT.minHitChance)}–${pct(COMBAT.maxHitChance)}.

- **Atak** = atak jednostki − ${FATIGUE.skillPenalty} × zmęczenie (0–1) + ${VETERANS.attackPerRank} za każdy stopień doświadczenia
  − ${CAPTAIN.attackWithout} bez kapitana; przeciw jeździe + premia przeciw jeździe (×${FORMATION.pikeWallVsHorse} w ścianie pik); w szarży + premia
  szarży; za tarczami (postawa) − ${FORMATION.shieldAttack}; cios pod górę − ${ELEVATION.uphillAttack}.
- **Obrona** = obrona jednostki − ${FATIGUE.skillPenalty} × zmęczenie + ${VETERANS.defencePerRank} za stopień; szyk luźny − ${FORMATION.looseDefence}, klin
  − ${FORMATION.wedgeDefence}; ściana pik od przodu + ${FORMATION.pikeWallDefence}; mała tarcza od przodu (${bucklers.map((k) => `${name(k)} +${UNITS[k].shieldDefence}`).join(', ')});
  oddział uciekający broni się ×${COMBAT.routingDefenceFactor}.
- **Kierunek ciosu** względem frontu celu: z przodu — bez premii; z boku + ${COMBAT.flankHitBonus} do szansy (i −${MORALE.flankHitShock}
  morale celu za trafienie); od tyłu + ${COMBAT.rearHitBonus} (−${MORALE.rearHitShock} morale); w uciekającego + ${COMBAT.routingHitBonus}.
- **Obrażenia** = obrażenia jednostki × (1 − pancerz celu) × losowo ${pct(1 - COMBAT.damageSpread)}–${pct(1 + COMBAT.damageSpread)}; w szarży
  ×${COMBAT.chargeDamageFactor}. Żołnierz ginie, gdy jego życie spadnie do zera.

**Szarża** (${chargers.map(name).join(', ')}): pierwszy cios oddziału, który w ostatnich ${COMBAT.chargeMemoryS} s biegł z co najmniej
${pct(COMBAT.chargeMinSpeedShare)} prędkości biegu (i od ${2} s nie zadał ciosu). Przez ${COMBAT.chargeSeconds} s ciosy mają premię szarży do ataku i
obrażenia ×${COMBAT.chargeDamageFactor}, a cel traci morale o „wstrząs szarży” jednostki. Klin jazdy: ×${FORMATION.wedgeCharge}. Szarża w czoło
**ściany pik** nie działa wcale; w czoło stojących włóczni (${braced.map(name).join(', ')}, w miejscu, przodem) — tylko ${pct(COMBAT.bracedChargeFactor)}.

## 7. Ostrzał

- Strzelcy (łucznicy, kusznicy, armaty, moździerze, załogi wież, łucznicy zamku) strzelają z miejsca w zasięgu
  (UNITS.md), co swój czas przeładowania. Pocisk leci torem balistycznym; rozrzut celowania ${MISSILE.spreadAtRangeM} m na pełnym
  zasięgu (moździerz ×3), do jednej trzeciej z bliska; trafia człowieka stojącego do ${MISSILE.hitRadiusM} m od miejsca upadku.
- **Szansa trafienia** = ${MISSILE.hitChance} × (szyk luźny ×${FORMATION.looseHitFactor}) × (1 + ${VETERANS.missileHitPerRank} za stopień strzelca) × (las
  ×${MISSILE.forestHitFactor}) × (1 − blok tarczą).
- **Blok tarczą:** jednostki z tarczą zatrzymują część pocisków (${shields.map((k) => `${name(k)} ${pct(UNITS[k].missileBlock)}`).join(', ')}); w postawie „Tarcze”
  dwa razy więcej, najwyżej ${pct(FORMATION.shieldBlockMax)}, ale oddział idzie ×${FORMATION.shieldSpeedFactor} i bije słabiej.
- **Obrażenia** = obrażenia pocisku × (1 − pancerz × (1 − przebicie)); przebicie zależy od broni (kusza i działa
  przebijają lepiej). Każde trafienie strzałą: −${MORALE.arrowHitShock} morale.
- **Kula armatnia** toczy się ${UNITS.cannon.missileRollM ?? 0} m przez szeregi: trafia ${pct(MISSILE.ballStrikeChance)} ludzi na swojej drodze, najwyżej
  ${MISSILE.ballMaxStruck}, z obrażeniami malejącymi do połowy; każdy trafiony oddział −${num(MORALE.arrowHitShock * 3)} morale.
- **Moździerz** strzela stromo nad murami (najmniej ${UNITS.mortar.missileMinRangeM} m), bardzo niecelnie; kula rani wszystkich w promieniu
  ${UNITS.mortar.missileSplashM} m (słabiej dalej od środka), a każdy oddział, w który spadnie, traci ${MORALE.stoneShock} morale.

## 8. Zmęczenie

- Rośnie od biegu (piechota wyczerpuje się po ${FATIGUE.footRunSecondsToExhaust} s, jazda po ${FATIGUE.horseRunSecondsToExhaust} s) i od walki (${FATIGUE.meleeSecondsToExhaust} s); spada w
  marszu (pełny odpoczynek ${FATIGUE.walkSecondsToRecover} s) i na postoju (${FATIGUE.restSecondsToRecover} s).
- Wyczerpany oddział: atak i obrona −${FATIGUE.skillPenalty}, bieg wolniejszy o ${pct(FATIGUE.runSpeedLoss)} (proporcjonalnie przy częściowym
  zmęczeniu). Widać to na cienkim pasku pod morale.

## 9. Morale, ucieczka, zbiórka

- **Górna granica morale** = morale jednostki + ${VETERANS.moralePerRank} za stopień − ${CAPTAIN.moraleWithout} bez kapitana − ${FOOD.starvingMoralePenalty} przy głodzie −
  ${PAY.unpaidMoralePenalty} bez żołdu + ${CHAPEL.morale} z kaplicą.
- **Spada:** za każdego poległego ${MORALE.casualtyShock} (dla oddziału 12 ludzi, proporcjonalnie dla innych), cios z boku
  ${MORALE.flankHitShock}, od tyłu ${MORALE.rearHitShock}, strzała ${MORALE.arrowHitShock}, kula armatnia ${num(MORALE.arrowHitShock * 3)}, moździerz ${MORALE.stoneShock}, szarża (wstrząs
  jednostki), śmierć kapitana ${CAPTAIN.fallShock}, ucieczka sąsiedniego oddziału własnej strony w promieniu ${MORALE.contagionRadiusM} m
  ${MORALE.friendRoutShock}.
- **Rośnie:** ${MORALE.recoverPerSecond}/s poza walką (bez kapitana o połowę wolniej), ${MORALE.killBoost} za każdego zabitego wroga, ${MORALE.enemyRoutBoost} gdy
  ucieka wróg w promieniu ${MORALE.contagionRadiusM} m.
- **Ucieczka:** morale 0 — oddział ucieka do zamku (zatrzymuje się w promieniu ${TOWN.refugeRadiusM} m od niego), nie słucha
  rozkazów, broni się słabo. Gdy w promieniu ${MORALE.safeFromEnemyM} m nie ma wroga, odzyskuje ${MORALE.routRecoverPerSecond} morale/s i przy ${MORALE.rallyAt}
  **zbiera się** do szyku.
- **Rozbicie:** oddział, który ma mniej niż ${pct(MORALE.shatteredShare)} początkowego składu albo ucieka trzeci raz, już się nie zbiera;
  ocaleli wracają do miasta jako mieszkańcy.

## 10. Doświadczenie i kapitan

- Doświadczenie = zabici wrogowie na człowieka. Stopnie: zaprawieni od ${VETERANS.ranksAt[0]}, weterani od ${VETERANS.ranksAt[1]}. Każdy stopień:
  +${VETERANS.attackPerRank} atak, +${VETERANS.defencePerRank} obrona, +${VETERANS.moralePerRank} górna granica morale, strzelcy +${pct(VETERANS.missileHitPerRank)} trafień.
- Kapitan to pierwszy człowiek oddziału (machiny go nie mają). Gdy padnie: −${CAPTAIN.fallShock} morale od razu, a do uzupełnienia
  atak −${CAPTAIN.attackWithout}, górna granica morale −${CAPTAIN.moraleWithout}, odzyskiwanie morale ×${CAPTAIN.recoverFactorWithout}.

## 11. Szyki i postawy

| | Działanie |
|---|---|
| Szeregi ${FORMATION.rankChoices.join(' / ')} | piechota: płytszy szyk — szerszy front, więcej ludzi walczy naraz; głębszy — wytrzymalszy, węższy |
| Szyk luźny | odstępy ×${FORMATION.looseSpacingFactor}: pociski trafiają ×${FORMATION.looseHitFactor}, obrona wręcz −${FORMATION.looseDefence} |
| Klin (jazda) | szarża ×${FORMATION.wedgeCharge}, obrona −${FORMATION.wedgeDefence} |
| Tarcze | blok pocisków ×${FORMATION.shieldBlockFactor} (najwyżej ${pct(FORMATION.shieldBlockMax)}), marsz ×${FORMATION.shieldSpeedFactor}, atak −${FORMATION.shieldAttack} |
| Ściana pik | oddział stoi; od przodu obrona +${FORMATION.pikeWallDefence}, premia przeciw jeździe ×${FORMATION.pikeWallVsHorse}, szarża w czoło nie działa |
| Strzelanie dowolne / na rozkaz | strzelcy sami wybierają cel w zasięgu / strzelają tylko w wyznaczony |

Komputer sam stawia ścianę pik, gdy wroga jazda podejdzie na ${AI.pikeWallAtM} m, i podnosi tarcze na ${AI.shieldsUnderFireS} s po trafieniu strzałą.

## 12. Mury, bramy, wieże, oblężenie

- **Mur:** ${WALLS.stonePerCell} kamienia na każde 2 m; komórka muru wytrzymuje ${WALLS.hp} (w twierdzy misji 5 ×${CAMPAIGN.fortress.wallHpFactor}). Zatrzymuje
  wszystkich; wróg bije w niego wręcz (${pct(WALLS.meleeFactor)} obrażeń ciosu) albo z machin. Pocisk o sile oblężniczej co najmniej
  ${WALLS.breakingShotMin} rozbija mur w promieniu ${WALLS.siegeRadiusM} m od upadku. Rozbita komórka to gruz, przez który się przechodzi (wyłom).
- **Brama:** ${GATE.cells * 2} m, ${GATE.cost.wood} drewna i ${GATE.cost.stone} kamienia, wytrzymałość ${GATE.hp}; własna strona przechodzi (skrzydła otwierają się,
  gdy ktoś swój jest do ${GATE.openRadiusM} m), dla wroga to mur.
- **Wieża:** do ${TOWER.maxGarrison} łuczników albo kuszników jednego rodzaju; strzelają z góry ${TOWER.rangeBonusM} m dalej. Gdy wieża padnie, załoga
  ginie razem z nią.
- **Budynki** wróg niszczy wręcz (${pct(COMBAT.siegeDamageFactor)} obrażeń ciosu) albo z machin; zburzony budynek znika (z załogą wieży).
- Machiny (armata, moździerz) strzelają z miejsca; rozkaz ostrzału muru (prawy klik w mur) trwa, aż powstanie wyłom.

## 13. Komputer (potyczka)

- Buduje miasto planistą (kwartały na siatce), werbuje, przezbraja milicję (najwyżej ${AI.maxGuardRegiments} oddziały straży), obsadza wieże,
  stawia mur na podejściu, sprzedaje nadwyżki na targu poniżej ${AI.marketSellBelowGold} złota, zajmuje punkty co ${AI.pointsLookS} s.
- Atakuje falami: pierwsza fala ${UNIT_KINDS.length > 0 ? `${AI_TUNING.easy.firstWaveMen} / ${AI_TUNING.normal.firstWaveMen} / ${AI_TUNING.hard.firstWaveMen}` : ''} ludzi (łatwy / normalny / trudny), każda kolejna
  o ${AI_TUNING.easy.waveGrowthMen} / ${AI_TUNING.normal.waveGrowthMen} / ${AI_TUNING.hard.waveGrowthMen} więcej; czeka na nią najwyżej ${AI_TUNING.easy.waveTimeoutS} / ${AI_TUNING.normal.waveTimeoutS} / ${AI_TUNING.hard.waveTimeoutS} s. Fala, która straciła ${pct(AI.retreatLossShare)}
  ludzi, wraca. Tempo pracy jego miasta ×${AI_TUNING.easy.productionFactor} / ×${AI_TUNING.normal.productionFactor} / ×${AI_TUNING.hard.productionFactor}.
- Charakter: budowniczy — fale ×${AI_CHARACTERS.builder.waveMen} ludzi, ×${AI_CHARACTERS.builder.waveWait} czasu; najeźdźca — ×${AI_CHARACTERS.raider.waveMen} ludzi, ×${AI_CHARACTERS.raider.waveWait} czasu i co
  ${AI_CHARACTERS.raider.raidEveryS} s oddział palący budynki na skraju miasta.
- Na wszystko, co podejdzie do jego zamku na ${AI.defendRadiusM} m, rzuca całe wojsko.

## 14. Kampania

- Limit ${CAMPAIGN.maxSoldiersPerSide} żołnierzy, oddziały dopełniane do ${CAMPAIGN.regimentMaxMen} przy koszarach i łączenie (§4).
- Do następnej misji idzie najwyżej ${CAMPAIGN.carryRegiments} najsilniejszych oddziałów (z doświadczeniem) i ${pct(CAMPAIGN.carryGoldShare)} złota, najwyżej ${CAMPAIGN.carryGoldMax}.
- Misja 1: trybut (${goods(CAMPAIGN.tribute)}) w ${sec(CAMPAIGN.tributeSeconds)}; po terminie atak najeźdźcy; wygrana także, gdy
  wszystkie jego oddziały uciekają ${sec(CAMPAIGN.routWinS)} bez przerwy.
- Misja 3: osada jak punkt (§2); odsiecz po ${sec(CAMPAIGN.reliefAtS)}, a gdy zastanie osadę wroga, po ${sec(CAMPAIGN.reliefStrikesAfterS)} wszyscy idą na miasto.
- Misja 4: ${CAMPAIGN.armyGoalMen} ludzi w ${CAMPAIGN.armyGoalRegiments} oddziałach i zamek ${CAMPAIGN.keepGoalLevel}; zagony w ${CAMPAIGN.raids.map((r) => sec(r.atS)).join(', ')}; ruiny odbudowywane za pół ceny.
- Misja 5: wypad, gdy działo gracza podejdzie na ${CAMPAIGN.sallyWithinM} m do bramy (najwyżej co ${sec(CAMPAIGN.sallyEveryS)}, wraca po ${CAMPAIGN.sallyForS} s); koszary
  twierdzy wystawiają oddział co ${sec(CAMPAIGN.fortressRecruitEveryS)}, dopóki stoją; odsiecz po ${sec(CAMPAIGN.fortressReliefAtS)}; przegrana także po ${CAMPAIGN.noArmyLostS} s
  bez żadnego oddziału; gwiazdka za wyłom w ${sec(CAMPAIGN.breachStarS)} bez straty dział.
`;
}
