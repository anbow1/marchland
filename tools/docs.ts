// Writes the reference documents of the game from the numbers the game itself
// runs on (src/config.ts), so the documents cannot drift from the rules:
//
//   docs/BUILDINGS.md   every building: what it needs, makes and costs (English)
//   docs/ECONOMY.md     people, logistics, food, roads, placement (Polish)
//   docs/UNITS.md       every unit: price, equipment, statistics, use (Polish)
//
//   npm run docs        rewrite them after any change to the rules (tools/write-docs.ts)
//
// tests/docs.test.ts fails while a document on disk is not what this produces.
import { ARMY, BUILDINGS, DEMOLISH_REFUND, FIELDS, FOOD, GATHER, LEVEL_COST, LEVEL_SPEED, MAX_LEVEL, PEOPLE, ROADS, TOWN, UNITS, UPGRADE_SECONDS } from '../src/config.ts';
import { BUILDING_KINDS, type BuildingKind, type Cost, RESOURCE_IDS, type ResourceId, SITE_NEED, UNIT_KINDS, type UnitKind } from '../src/sim/types.ts';

const GOOD_EN: Record<ResourceId, string> = {
  gold: 'gold',
  wood: 'timber',
  stone: 'stone',
  grain: 'grain',
  flour: 'flour',
  bread: 'bread',
  fish: 'fish',
  meat: 'meat',
  sausage: 'sausages',
  hide: 'hides',
  leatherArmor: 'leather armour',
  ironOre: 'iron ore',
  iron: 'iron',
  weapon: 'weapons',
  mailArmor: 'mail',
  bow: 'bows',
  horse: 'horses',
};

const GOOD_PL: Record<ResourceId, string> = {
  gold: 'złoto',
  wood: 'drewno',
  stone: 'kamień',
  grain: 'zboże',
  flour: 'mąka',
  bread: 'chleb',
  fish: 'ryby',
  meat: 'mięso',
  sausage: 'kiełbasy',
  hide: 'skóry',
  leatherArmor: 'zbroja skórzana',
  ironOre: 'ruda żelaza',
  iron: 'żelazo',
  weapon: 'broń',
  mailArmor: 'kolczuga',
  bow: 'łuk',
  horse: 'koń',
};

const BUILDING_EN: Record<BuildingKind, { name: string; role: string }> = {
  house: { name: 'House', role: 'Homes for townspeople. Fed residents pay tax and newcomers move in; every worker, carrier, builder and recruit comes from a house.' },
  woodcutter: { name: "Woodcutter's Lodge", role: 'The woodcutter walks into the trees and comes back with timber: the material of every building, of bows and of siege engines. An open shed of stacked logs, fresh trunks by the track, a chopping block and a sawhorse in the yard.' },
  quarry: { name: 'Quarry', role: 'Cuts building stone from an outcrop: stone for workshops, the barracks and roads.' },
  farm: { name: 'Farm', role: 'The farmer breaks, sows and reaps strips of land behind the farm. The farmland grows with the farm level, so farms want open ground: build them as a village.' },
  fisher: { name: "Fisher's Hut", role: 'The fisher works the shore of the lake: food that needs no mill or oven.' },
  windmill: { name: 'Windmill', role: 'A post mill: grinds grain into flour. The tallest thing in a village; its sails turn while it works.' },
  bakery: { name: 'Bakery', role: 'Bakes flour into bread, the staple ration of town and army. A domed oven by the house and a pretzel over the door.' },
  pigFarm: { name: 'Pig Farm', role: 'Fattens pigs on grain: meat for the butcher, hides for the tanner.' },
  butcher: { name: 'Butcher', role: 'Turns meat into sausages; a sausage feeds two.' },
  tannery: { name: 'Tannery', role: 'Turns hides into leather armour for the lower tiers of the army.' },
  ironMine: { name: 'Iron Mine', role: 'Digs iron ore from an ore outcrop. A timbered adit in a knoll of rock, rails, an ore tub and the ore heap.' },
  smelter: { name: 'Smelter', role: 'A bloomery: smelts iron ore into iron, burning timber as charcoal. A squat stone furnace, bellows, smoking charcoal and heaps of slag.' },
  smithy: { name: 'Smithy', role: 'Forges weapons from iron, burning timber. Open to the street: the glowing hearth and the anvil are seen from afar.' },
  armourer: { name: 'Armourer', role: 'Makes mail from iron for swordsmen, halberdiers and knights. Armour stands, a rack of polearms and shields in the town\'s colour outside.' },
  fletcher: { name: 'Fletcher', role: 'Makes bows and crossbows from timber.' },
  stable: { name: 'Stable', role: 'Raises war horses on grain.' },
  barracks: { name: 'Barracks', role: 'Townspeople called up walk here, take their equipment and form a regiment. Its level decides which units can be trained.' },
};

const NEED_EN: Record<string, string> = {
  none: 'any level ground',
  forest: `within ${TOWN.forestReachM} m of forest`,
  water: `within ${TOWN.waterReachM} m of a lake`,
  stone: `within ${TOWN.depositReachM} m of a stone outcrop`,
  ore: `within ${TOWN.depositReachM} m of an ore outcrop`,
  fields: 'open ground behind it for its fields',
};

function cost(c: Cost, names: Record<ResourceId, string>, times = 1): string {
  const parts = RESOURCE_IDS.filter((id) => (c[id] ?? 0) > 0).map((id) => `${Math.round((c[id] ?? 0) * times)} ${names[id]}`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

function fixed(n: number, digits = 1): string {
  return Number(n.toFixed(digits)).toString();
}

function makes(kind: BuildingKind): string {
  const recipe = BUILDINGS[kind].recipe;
  if (kind === 'house') return `${PEOPLE.houseResidents.join(' / ')} residents (levels 1–${MAX_LEVEL}); tax ${fixed(PEOPLE.taxGoldPerSecond * 60)} gold a minute from each fed resident`;
  if (kind === 'barracks') return 'regiments (see UNITS.md)';
  if (kind === 'woodcutter') return `${GATHER.woodcutter.amount} timber a trip (${GATHER.woodcutter.seconds} s of felling + the walk)`;
  if (kind === 'fisher') return `${GATHER.fisher.amount} fish a trip (${GATHER.fisher.seconds} s at the water + the walk)`;
  if (kind === 'farm') return `${FIELDS.grainPerHarvest} grain a harvest from each strip; ${FIELDS.stripsPerLevel.join(' / ')} strips (levels 1–${MAX_LEVEL}), ${FIELDS.growSeconds} s to ripen`;
  if (!recipe) return '—';
  const inputs = cost(recipe.inputs, GOOD_EN);
  return `${inputs === '—' ? '' : `${inputs} → `}${cost(recipe.outputs, GOOD_EN)} every ${recipe.cycleSeconds} s`;
}

export function buildingsDoc(): string {
  const rows = BUILDING_KINDS.map((kind, i) => {
    const def = BUILDINGS[kind];
    const en = BUILDING_EN[kind];
    return `| ${i + 2} | **${en.name}** | ${cost(def.cost, GOOD_EN)} | ${NEED_EN[SITE_NEED[kind]]} | ${makes(kind)} | ${kind === 'house' || kind === 'barracks' ? '—' : '1'} | ${def.hp} |`;
  });
  const roles = BUILDING_KINDS.map((kind) => `- **${BUILDING_EN[kind].name}** — ${BUILDING_EN[kind].role}`);
  return `# Marchland — buildings

*Generated by \`npm run docs\` from \`src/config.ts\`. Do not edit by hand: change the
config (or the text in \`tools/docs.ts\`) and regenerate.*

## 1. In the game now

| # | Building | Price (level 1) | Ground it needs | What it gives | Workers | Hit points |
|---|---|---|---|---|---|---|
| 1 | **Keep** | — (each side starts with one) | — | the town's storehouse; ${PEOPLE.keepResidents} residents; ${fixed(TOWN.keepGoldPerSecond * 60)} gold a minute; archers who shoot ${TOWN.keepRangeM} m. Lose it and the game is lost | — | ${TOWN.keepHp} |
${rows.join('\n')}
| ${BUILDING_KINDS.length + 2} | **Road** | ${fixed(ROADS.stonePerCell * (10 / ROADS.cellM), 1)} stone for 10 m | own land, not water | people walk ${fixed(ROADS.roadSpeedFactor)}× as fast on it and prefer it when finding their way | — | — |

What each is for:

- **Keep** — the heart of the town: storehouse, first household, last defence.
${roles.join('\n')}
- **Road** — drawn from point to point; carriers, workers and builders take it whenever it shortens the walk.

Rules common to all buildings:

- **Free placement.** A building goes anywhere within ${TOWN.territoryRadiusM} m of its side's keep (and no nearer
  than ${TOWN.enemyKeepClearM} m to the enemy's) where the ground under it rises no more than ${TOWN.maxFootprintRiseM} m, is not
  water, and is ${TOWN.buildingGapM} m clear of other buildings and of farm strips. A side may have ${TOWN.maxBuildings} buildings.
- **Three levels.** Level ${MAX_LEVEL} is the top. A level costs ×${LEVEL_COST.join(' / ×')} of the base price and works
  ×${LEVEL_SPEED.join(' / ×')} as fast; an upgrade takes ${UPGRADE_SECONDS} builder-seconds once its timber and stone are on site.
- **Built by hand.** Gold is paid at once; timber and stone are carried from the keep to the site, and
  up to ${PEOPLE.maxBuildersPerSite} builders raise the building only as far as the materials delivered allow.
- **One worker each.** A workshop works only while its worker is there; a hungry worker works at half speed.
- **Own stores.** Carriers fill a workshop's inputs up to ${PEOPLE.inputTarget}; outputs pile in its yard up to ${PEOPLE.outputCap}, then
  work stops until carriers clear them (they come once ${PEOPLE.clearOutputAt} lie there).
- **Demolition** returns ${Math.round(DEMOLISH_REFUND * 100)} % of the base price and whatever lay in the yard.

## 2. Production chains

\`\`\`
Farm ──grain──► Windmill ──flour──► Bakery ──bread──► houses, keep, army
     ├─grain──► Pig Farm ──meat──► Butcher ──sausages──► houses, keep, army
     │                   └─hides─► Tannery ──leather armour──► pikemen, archers, crossbowmen, light cavalry
     └─grain──► Stable ──horses──► light and heavy cavalry
Fisher's Hut ──fish──► houses, keep, army
Woodcutter's Lodge ──timber──► buildings, Smithy, Fletcher, militia shields, siege engines
Quarry ──stone──► buildings, roads, trebuchet
Iron Mine ──ore──► Smelter (+ timber) ──iron──► Smithy (+ timber) ──weapons──► every armed regiment, ballista
                                         └─► Armourer ──mail──► swordsmen, halberdiers, heavy cavalry
Fletcher ──bows──► archers, crossbowmen
\`\`\`

## 3. Still needed for the full game

Not built yet; listed in the order they are worth adding. Names are final, numbers are not.

| Priority | Building | Why it is needed |
|---|---|---|
| A | **Storehouse** | A second place to store goods: carriers bring and fetch from the nearest one, so a village far from the keep stops costing long walks. |
| A | **Watchtower** | Archers on a tower: protects an outlying village or a quarry from raids. |
| A | **Palisade** and **Gate** | Walls drawn like roads; soldiers must break a section or the gate. Gives siege engines their purpose. |
| A | **Siege Workshop** | Builds ballistae and trebuchets instead of the barracks (timber, weapons, stone), so engines are a separate investment. |
| B | **Sawmill** | Logs → planks: higher levels of buildings and engines ask for planks, so timber gets a second tier. |
| B | **Market** | Sells surplus for gold and buys what is short, at a poor rate: a way out of a stalled chain. |
| B | **Hunter's Lodge** | Meat and hides from the forest before the town can afford pigs. |
| B | **Forester's Hut** | Replants what woodcutters fell (once trees are felled for real). |
| C | **Tavern** | Uses sausages (later ale): fed and merry houses grow faster and pay more tax. |
| C | **Brewery** | Grain → ale for the tavern and for the army's morale on campaign. |
| C | **Chapel** | Raises the morale soldiers start with; a place people gather after a lost battle. |
| C | **Well** | Puts out fires once buildings can burn; cosmetic until then. |
| C | **Keep, levels 2 and 3** | Stone tower, then castle: more household, stronger garrison, wider land to build on. |
`;
}

export function economyDoc(): string {
  const rationsTown = (people: number): string => fixed(people * PEOPLE.rationsPerMinute);
  return `# Marchland — ekonomia

*Plik generowany przez \`npm run docs\` z \`src/config.ts\`. Nie poprawiaj ręcznie:
zmień konfigurację (albo tekst w \`tools/docs.ts\`) i wygeneruj ponownie.*

## 1. Zasada

Miasto to ludzie, towary i drogi między nimi. Nic nie pojawia się w magazynie
samo: zboże trzeba zebrać z pola, przynieść do piekarni, upiec i roznieść po
domach. Im dłuższa droga, tym wolniej działa cały łańcuch — dlatego układ miasta
i drogi są decyzją gracza, a nie ozdobą.

## 2. Ludzie

- Zamek ma własną załogę: ${PEOPLE.keepResidents} osób na start. Chata mieści ${PEOPLE.houseResidents.join(' / ')} osób (poziomy 1–${MAX_LEVEL}).
- Najedzona chata z wolnym miejscem przyjmuje nowego mieszkańca co ${PEOPLE.growSeconds} s.
- Każdy człowiek ma jedną rolę naraz, przydzielaną automatycznie co sekundę:
  1. **pracownik** — po jednym na każdy czynny budynek produkcyjny (najbliższy wolny człowiek),
  2. **budowniczy** — ${Math.round(PEOPLE.builderShare * 100)} % wolnych rąk, gdy cokolwiek się buduje (najwyżej ${PEOPLE.maxBuildersPerSite} na budowę),
  3. **tragarz** — wszyscy pozostali,
  4. **rekrut** — wezwany do koszar; po dojściu staje się żołnierzem.
- **Wspólna ludność**: regiment zabiera z miasta tylu ludzi, ilu ma żołnierzy (machiny: obsługa).
  Żołnierze mieszkają w obozie, więc chaty z czasem zapełniają się na nowo — armia kosztuje
  miasto czas i ręce do pracy, nie miejsce w domach. Miasto zawsze zostawia co najmniej
  ${PEOPLE.minFreeAfterCallUp} wolnych ludzi; bez nich werbunek jest odrzucany („brak ludzi”).
- Rozwiązany oddział wraca do miasta jako mieszkańcy.
- Podatek: ${fixed(PEOPLE.taxGoldPerSecond * 60)} złota na minutę od każdej najedzonej osoby; zamek daje stałe ${fixed(TOWN.keepGoldPerSecond * 60)} złota na minutę.
- Gdy wrogi oddział w szyku zbliży się na ${PEOPLE.fleeRadiusM} m, ludzie rzucają pracę i biegną do zamku;
  wracają ${PEOPLE.calmSeconds} s po odejściu wroga.
- Człowiek idzie ${PEOPLE.walkSpeedMs} m/s; po drodze ${fixed(ROADS.roadSpeedFactor)}× szybciej, w lesie ${fixed(ROADS.forestSpeedFactor)}×.

## 3. Logistyka

- **Zamek jest magazynem.** Każdy budynek ma własne składy: wejściowy (tragarze uzupełniają
  do ${PEOPLE.inputTarget} sztuk) i wyjściowy na podwórzu (do ${PEOPLE.outputCap} sztuk; pełny zatrzymuje pracę).
- Tragarz niesie do ${PEOPLE.carryCapacity} sztuk jednego towaru; podniesienie i odłożenie trwa ${PEOPLE.handlingSeconds} s.
- Wolny tragarz bierze najpilniejsze zlecenie, a przy równej pilności najbliższe:
  1. jedzenie do chaty z pustą spiżarnią,
  2. drewno i kamień na plac budowy,
  3. jedzenie do chaty poniżej ${PEOPLE.houseFoodTarget} racji,
  4. towar z podwórza do zamku, gdy zamek ma go mało,
  5. surowiec do warsztatu (pusty skład przed niepełnym; nie nosi się do warsztatu z pełnym podwórzem),
  6. pozostały towar z podwórzy do zamku (gdy leży tam co najmniej ${PEOPLE.clearOutputAt} sztuk).
- Towar bierze się stamtąd, skąd wychodzi najkrótsza trasa: z podwórza producenta albo z zamku.
- Towar znika z ksiąg źródła w chwili przyjęcia zlecenia i pojawia się u celu, gdy tragarz dojdzie;
  po drodze jest na jego plecach (i widać go).
- **Budowa**: złoto płaci się od razu, drewno i kamień czekają w zamku na tragarzy. Budowniczowie
  wznoszą budynek tylko do takiej części, jaka odpowiada dostarczonym materiałom.

## 4. Jedzenie

- Mieszkaniec zjada ${PEOPLE.rationsPerMinute} racji na minutę, żołnierz ${FOOD.soldierRationsPerMinute}.
  Chleb to ${FOOD.breadRations} racja, ryba ${FOOD.fishRations}, kiełbasa ${FOOD.sausageRations} (dlatego opłaca się rzeźnik).
- Chaty jedzą ze swoich spiżarni (cel: ${PEOPLE.houseFoodTarget} racji), załoga zamku i wojsko — z magazynu zamku.
- Głodny dom: jego ludzie pracują o połowę wolniej, nie płacą podatku i nikt nowy się nie wprowadza.
  Pusty magazyn zamku: wojsko traci ${FOOD.starvingMoralePenalty} punktów morale.
- Rachunek dla orientacji: 30 mieszkańców zjada ${rationsTown(30)} racji/min, 60 — ${rationsTown(60)};
  armia ${ARMY.maxSoldiersPerSide} ludzi — ${fixed(ARMY.maxSoldiersPerSide * FOOD.soldierRationsPerMinute)} racji/min.

## 5. Pola, las, jezioro, skała

- **Pole**: rolnik karczuje pas ziemi (${FIELDS.establishSeconds} s, raz), sieje (${FIELDS.sowSeconds} s), zboże rośnie ${FIELDS.growSeconds} s,
  potem żniwa (${FIELDS.harvestSeconds} s) i ${FIELDS.grainPerHarvest} zboża wraca do zagrody. Pas ma ${FIELDS.stripLengthM} × ${FIELDS.stripWidthM} m;
  zagroda uprawia ${FIELDS.stripsPerLevel.join(' / ')} pasów na poziomach 1–${MAX_LEVEL}. Pasy leżą za zagrodą, w stronę przeciwną
  do drzwi, i nic nie można na nich postawić — rolnictwo zużywa teren, więc zagrody buduje się
  jako wieś na otwartej przestrzeni, a rzemiosło przy zamku.
- **Drwal** musi stać do ${TOWN.forestReachM} m od lasu: kurs to ${GATHER.woodcutter.seconds} s rąbania i ${GATHER.woodcutter.amount} drewna.
- **Rybak** musi stać do ${TOWN.waterReachM} m od jeziora: kurs to ${GATHER.fisher.seconds} s łowienia i ${GATHER.fisher.amount} ryby.
- **Kamieniołom i kopalnia** muszą stać do ${TOWN.depositReachM} m od wychodni kamienia albo rudy. Każda strona
  ma po jednej za miastem; druga, bogatsza, leży na flance bliżej środka mapy.

## 6. Stawianie budynków i drogi

- Budynek stawia się **w dowolnym miejscu** w promieniu ${TOWN.territoryRadiusM} m od własnego zamku (i nie bliżej niż
  ${TOWN.enemyKeepClearM} m od wrogiego): teren pod nim może się wznosić najwyżej o ${TOWN.maxFootprintRiseM} m, nie może to być woda,
  a od innych budynków i pól dzieli go co najmniej ${TOWN.buildingGapM} m. Budynek można obrócić przed postawieniem;
  drzwi wyznaczają, gdzie podchodzą ludzie. Limit: ${TOWN.maxBuildings} budynków na stronę.
- **Droga** to linia od punktu do punktu na siatce ${ROADS.cellM} m; kosztuje ${fixed(ROADS.stonePerCell * (10 / ROADS.cellM))} kamienia za 10 m.
  Ludzie sami wybierają najszybszą trasę (drogą idą ${fixed(ROADS.roadSpeedFactor)}× szybciej) i omijają budynki oraz wodę.
- Komputer stawia według tych samych reguł: rzemiosło i chaty w pierścieniach wokół zamku, zagrody
  w wiosce z polami za plecami, drwala przy najbliższej ścianie lasu, rybaka nad jeziorem,
  kamieniołom i kopalnię przy skale; od każdych drzwi kładzie drogę do bramy zamku.

## 7. Poziomy budynków

- Poziom kosztuje ×${LEVEL_COST.join(' / ×')} ceny podstawowej i daje ×${LEVEL_SPEED.join(' / ×')} tempa pracy.
- Rozbudowa to ${UPGRADE_SECONDS} sekund pracy budowniczych po dostarczeniu materiałów; budynek w tym czasie stoi.
- Rozbiórka zwraca ${Math.round(DEMOLISH_REFUND * 100)} % ceny podstawowej.

## 8. Start partii

Każda strona zaczyna z zamkiem, ${PEOPLE.keepResidents} ludźmi i zapasem: ${cost(TOWN.startingStock, GOOD_PL)}.
Sensowna kolejność: drwal → zagroda → chata → młyn → piekarnia → drugi drwal → chaty, kamieniołom, rybak →
chlewnia, kopalnia, koszary → garbarnia, huta, kuźnia → rzeźnik, łuczarz → stajnia, płatnerz.
`;
}

const UNIT_PL: Record<UnitKind, { name: string; use: string }> = {
  militia: { name: 'Milicja z tarczami', use: 'Tania zapora: trzyma linię za tarczą, szybko ucieka. Do obrony miasta i wiązania wroga.' },
  pikemen: { name: 'Pikinierzy', use: 'Las pik zatrzymuje jazdę, zwłaszcza szarżę od czoła. Bezbronni wobec strzelców.' },
  archers: { name: 'Łucznicy', use: 'Daleki, szybki ostrzał lekko zbrojnych. W zwarciu giną; trzymać za linią.' },
  swordsmen: { name: 'Miecznicy', use: 'Miecz, tarcza, kolczuga: wygrywają zwykłą walkę pieszą i znoszą ostrzał.' },
  halberdiers: { name: 'Halabardnicy', use: 'Biją mocniej niż miecznicy i zatrzymują konie, ale bez tarczy cierpią od strzał.' },
  crossbowmen: { name: 'Kusznicy', use: 'Wolno ładują, bełt przebija kolczugę: odpowiedź na ciężkozbrojnych.' },
  lightCavalry: { name: 'Lekka jazda', use: 'Najszybsza: zagony na wsie, strzelców i machiny, pościg za uciekającymi.' },
  heavyCavalry: { name: 'Ciężka jazda', use: 'Rycerstwo: szarża, która łamie linię. Nie na piki od czoła.' },
  ballista: { name: 'Balisty', use: 'Dwie machiny: daleki bełt, który ignoruje pancerz. Bezradne, gdy wróg dojdzie.' },
  trebuchet: { name: 'Trebusz', use: 'Jedna machina: kamienie rozbijają szyk i burzą mury oraz zamek.' },
};

export function unitsDoc(): string {
  const table = UNIT_KINDS.map((kind) => {
    const d = UNITS[kind];
    const people = d.men * d.crew;
    return `| **${UNIT_PL[kind].name}** | ${d.barracksLevel} | ${d.men}${d.engine ? ` (${people} ludzi)` : ''} | ${d.goldCost} zł + ${cost(d.equipment, GOOD_PL, d.men)} | ${d.hp} | ${d.attack} / ${d.defence} | ${Math.round(d.armour * 100)} % | ${d.damage} | ${d.morale} | ${fixed(d.walkSpeedMs)} / ${fixed(d.runSpeedMs)} |`;
  });
  const shooters = UNIT_KINDS.filter((kind) => UNITS[kind].missileRangeM > 0).map((kind) => {
    const d = UNITS[kind];
    return `| **${UNIT_PL[kind].name}** | ${d.missileMinRangeM > 0 ? `${d.missileMinRangeM}–` : ''}${d.missileRangeM} m | ${d.missileDamage} | ${Math.round(d.missilePierce * 100)} % | ${d.reloadS} s | ${d.missileSplashM > 0 ? `${d.missileSplashM} m` : '—'} | ${d.missileSiegeDamage} |`;
  });
  const special = UNIT_KINDS.map((kind) => {
    const d = UNITS[kind];
    const notes: string[] = [];
    if (d.bonusVsCavalry > 0) notes.push(`+${d.bonusVsCavalry} do ataku przeciw jeździe`);
    if (d.chargeBonus >= 5) notes.push(`szarża +${d.chargeBonus} do ataku, wstrząs ${d.chargeShock}`);
    if (d.missileBlock > 0) notes.push(`${Math.round(d.missileBlock * 100)} % szans zatrzymania pocisku`);
    if (d.reachM >= 2.3) notes.push(`zasięg broni ${d.reachM} m`);
    return `- **${UNIT_PL[kind].name}** — ${UNIT_PL[kind].use}${notes.length > 0 ? ` *(${notes.join('; ')})*` : ''}`;
  });
  return `# Marchland — jednostki

*Plik generowany przez \`npm run docs\` z \`src/config.ts\`. Nie poprawiaj ręcznie:
zmień konfigurację (albo tekst w \`tools/docs.ts\`) i wygeneruj ponownie.*

## 1. Zasady wspólne

- Limit: ${ARMY.maxSoldiersPerSide} żołnierzy na stronę (200 na polu). W kolejce koszar najwyżej ${ARMY.maxRecruitQueue} rozkazy.
- Regiment powstaje z mieszkańców: tylu ludzi, ilu żołnierzy (machiny: obsługa), idzie do koszar,
  bierze ekwipunek z magazynu zamku i dopiero wtedy staje w szyku przed miastem.
- Poziom koszar decyduje, kogo można szkolić (kolumna „Koszary”).
- Żołnierz zjada ${FOOD.soldierRationsPerMinute} racji na minutę z magazynu zamku; głodne wojsko ma morale niższe o ${FOOD.starvingMoralePenalty}.
- Walka: szyk, zmęczenie, morale, flanka i tył, szarża, ucieczka i zbiórka — jak w grach Total War,
  w skali regimentów po 8–12 ludzi. Liczby w \`src/config.ts\` (COMBAT, FATIGUE, MORALE, MISSILE).

## 2. Tabela

Cena obejmuje cały regiment. Atak / obrona to punkty; pancerz to część ciosu, którą zbiera zbroja.

| Jednostka | Koszary | Ludzi | Cena regimentu | Życie | Atak / obrona | Pancerz | Obrażenia | Morale | Marsz / bieg (m/s) |
|---|---|---|---|---|---|---|---|---|---|
${table.join('\n')}

## 3. Strzelcy i machiny

| Jednostka | Zasięg | Obrażenia | Przebicie pancerza | Przeładowanie | Rozprysk | Obrażenia budynków |
|---|---|---|---|---|---|---|
${shooters.join('\n')}

Zamek strzela sam: zasięg ${TOWN.keepRangeM} m, strzała co ${TOWN.keepShotIntervalS} s, ${TOWN.keepArrowDamage} obrażeń.

## 4. Do czego służą

${special.join('\n')}

## 5. Kto kogo bije

- **Piki i halabardy** zatrzymują **jazdę**; jazda nie szarżuje na nie od czoła.
- **Jazda** rozjeżdża **strzelców** i **machiny** oraz dobija uciekających.
- **Strzelcy** wykrwawiają **pikinierów** i **halabardników** (brak tarcz); **kusze** biją **kolczugi**.
- **Miecznicy** wygrywają z każdą piechotą w zwarciu i znoszą ostrzał za tarczą.
- **Trebusz** rozbija zwarty szyk i mury; **balista** zdejmuje pojedynczych ciężkozbrojnych z daleka.
- Atak z **flanki** i od **tyłu** trafia łatwiej i łamie morale szybciej niż jakakolwiek przewaga punktów.

## 6. Łańcuchy ekwipunku

- zbroja skórzana ← garbarnia ← skóry ← chlewnia ← zboże
- broń ← kuźnia ← żelazo + drewno ← huta ← ruda + drewno
- kolczuga ← płatnerz ← żelazo ← huta ← ruda + drewno
- łuk ← łuczarz ← drewno
- koń ← stajnia ← zboże
`;
}

export const DOCS: readonly { path: string; render: () => string }[] = [
  { path: 'docs/BUILDINGS.md', render: buildingsDoc },
  { path: 'docs/ECONOMY.md', render: economyDoc },
  { path: 'docs/UNITS.md', render: unitsDoc },
];
