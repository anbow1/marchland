import type { WorkState } from '../sim/economy.ts';
import type { BuildingKind, CommandResult, Difficulty, ResourceId, UnitKind } from '../sim/types.ts';

// Every word the player reads, in Polish and English. The language follows
// `?lang=pl|en`, else the browser. Names are invented or generic (rules §11).

export type Lang = 'pl' | 'en';

interface Strings {
  title: string;
  subtitle: string;
  resources: Record<ResourceId, string>;
  buildings: Record<BuildingKind, { name: string; about: string }>;
  units: Record<UnitKind, { name: string; about: string }>;
  results: Record<Exclude<CommandResult, 'ok'>, string>;
  difficulty: Record<Difficulty, string>;
  keep: string;
  /** The keep's panel. */
  keepAbout: string;
  keepUpgrade: string;
  keepRaising: string;
  keepHp: string;
  keepReach: string;
  barracksUpTo: string;
  keepRaised: string;
  play: string;
  /** Before the build stamp in the menus. */
  version: string;
  /** March or run (the selected regiments, and the next orders). */
  paceLabel: string;
  paceWalk: string;
  paceRun: string;
  paceTip: string;
  paceWalkNow: string;
  paceRunNow: string;
  runningState: string;
  /** A newer version was fetched for offline play: it starts next time, or now. */
  updateReady: string;
  updateNow: string;
  resume: string;
  restart: string;
  paused: string;
  quality: string;
  qualityHigh: string;
  qualityLow: string;
  difficultyLabel: string;
  /** The choice of where the keeps stand, and the names of the three places. */
  startLabel: string;
  modeLabel: string;
  modes: Record<'skirmish' | 'defence' | 'tutorial' | 'campaign', string>;
  /** The campaign: its five missions, the menu, the line at the top, the end of a mission. */
  missions: { title: string; briefing: string }[];
  campaignTitle: string;
  missionLabel: string;
  missionLocked: string;
  missionSoon: string;
  missionStart: string;
  tributeTitle: string;
  tributeLeft: string;
  tributePay: string;
  tributeTip: string;
  hostComing: string;
  campLeft: string;
  foragersBack: string;
  missionWon: string;
  missionLost: string;
  missionNext: string;
  missionRetry: string;
  missionList: string;
  starsLabel: string;
  carriedNote: string;
  mergeLabel: string;
  mergeTip: string;
  merged: string;
  characterLabel: string;
  characters: Record<'balanced' | 'builder' | 'raider', string>;
  tutorialTitle: string;
  tutorialSteps: string[];
  tutorialDone: string;
  defenceLeft: string;
  wave: string;
  nextWave: string;
  startSites: readonly [string, string, string];
  mapLabel: string;
  layouts: Record<'field' | 'river' | 'forest', string>;
  loading: string;
  victory: string;
  defeat: string;
  victoryText: string;
  defeatText: string;
  kills: string;
  losses: string;
  time: string;
  army: string;
  level: string;
  build: string;
  upgrade: string;
  demolish: string;
  turnSite: string;
  sell: string;
  buy: string;
  marketNote: string;
  pause: string;
  unpause: string;
  recruit: string;
  /** The production screen: its tab, its columns, the list of hold-ups, and the alarms that point at a place. */
  production: string;
  prodStock: string;
  prodMade: string;
  prodNet: string;
  holdUps: string;
  allWorking: string;
  prodYards: string;
  priority: string;
  priorityTip: string;
  kindPriorityTip: string;
  orderHead: string;
  orderTip: string;
  orderArms: string;
  ordered: string;
  pauseTip: string;
  pausedBanner: string;
  fromKeep: string;
  fromBuilding: string;
  orderLess: string;
  orderMore: string;
  orderInf: string;
  transport: string;
  transportTip: string;
  transportLevels: [string, string, string];
  carries: string;
  faster: string;
  transportRaising: string;
  transportRaised: string;
  needsKeepLevel: string;
  buildingsTab: string;
  listTip: string;
  underConstructionShort: string;
  idleShort: string;
  count: string;
  levels: string;
  inYards: string;
  usesPerMin: string;
  noBuildings: string;
  lacks: string;
  show: string;
  raid: string;
  yardFullAlarm: string;
  noTreesAlarm: string;
  queue: string;
  halt: string;
  selectAll: string;
  men: string;
  morale: string;
  fatigue: string;
  underConstruction: string;
  working: string;
  waiting: string;
  pausedBuilding: string;
  maxLevel: string;
  needsBarracksLevel: string;
  needsFoundryLevel: string;
  hintIdle: string;
  hintArmy: string;
  starving: string;
  fed: string;
  routed: string;
  rallied: string;
  shattered: string;
  enemyRouted: string;
  built: string;
  recruited: string;
  lost: string;
  attackWarning: string;
  state: { hold: string; move: string; attack: string; siege: string; routing: string; fighting: string };
  help: string[];
  groupKept: string;
  formationKept: string;
  ranksLabel: string;
  formationLabel: string;
  formations: { line: string; wedge: string; loose: string };
  stanceLabel: string;
  stances: { normal: string; shields: string; pikeWall: string };
  fireLabel: string;
  fireAtWill: string;
  fireOnOrder: string;
  formationTips: { wedge: string; loose: string; shields: string; pikeWall: string; fire: string };
  saveGame: string;
  loadGame: string;
  saved: string;
  saveFailed: string;
  volumeLabel: string;
  edgeScrollLabel: string;
  on: string;
  off: string;
  viewKept: string;
  /** What each kind of regiment is good and poor against, shown when recruiting. */
  counters: Record<UnitKind, string>;
  helpTitle: string;
  menu: string;
  speed: string;
  makes: string;
  from: string;
  taxes: string;
  rations: string;
  trains: string;
  road: string;
  roadAbout: string;
  people: string;
  free: string;
  residents: string;
  stores: string;
  yard: string;
  fields: string;
  hintBuild: string;
  grid: string;
  gridTip: string;
  gridOn: string;
  gridOff: string;
  hintRoadStart: string;
  hintRoadEnd: string;
  roadCost: string;
  turnLeft: string;
  turnRight: string;
  work: Record<WorkState, string>;
  recruits: string;
  rearm: string;
  rearmed: string;
  rearmingState: string;
  reinforce: string;
  reinforceTip: string;
  reinforced: string;
  reinforcingState: string;
  ranks3: [string, string, string];
  rankTip: string;
  captain: string;
  noCaptain: string;
  captainFell: string;
  promoted: string;
  unpaid: string;
  paid: string;
  payTip: string;
  atKeep: string;
  wall: string;
  wallAbout: string;
  hintWallStart: string;
  hintWallEnd: string;
  gate: string;
  gateAbout: string;
  hintGate: string;
  garrison: string;
  ungarrison: string;
  garrisoned: string;
  wallBroken: string;
  /** The places in the middle: names, and what is said when one changes hands. */
  points: Record<'mine' | 'quarry' | 'village', string>;
  pointAbout: string;
  pointTaken: string;
  pointLost: string;
  nobodys: string;
  taking: string;
  hover: { stone: string; ore: string; forest: string; lake: string; mountain: string; crag: string; enemy: string; yours: string };
}

const pl: Strings = {
  title: 'Marchland',
  subtitle: 'Średniowieczna strategia: miasto, szyki, bitwa',
  resources: { gold: 'Złoto', wood: 'Drewno', planks: 'Deski', stone: 'Kamień', grain: 'Zboże', flour: 'Mąka', grapes: 'Winogrona', wine: 'Wino', ale: 'Piwo', bread: 'Chleb', fish: 'Ryby', meat: 'Mięso', sausage: 'Kiełbasy', hide: 'Skóry', leatherArmor: 'Zbroje sk.', ironOre: 'Ruda', iron: 'Żelazo', weapon: 'Broń', mailArmor: 'Kolczugi', bow: 'Łuki', horse: 'Konie' },
  buildings: {
    house: { name: 'Chata', about: 'Tu mieszkają ludzie: pracownicy, tragarze, budowniczowie i rekruci. Najedzeni płacą podatek.' },
    foundry: { name: 'Ludwisarnia', about: 'Odlewa działa z żelaza: armaty (poziom 1) i moździerze (poziom 2). Obsługa przychodzi z miasta jak rekruci.' },
    tavern: { name: 'Karczma', about: 'Karczmarz sprzedaje piwo z browaru: złoto poza podatkiem (1 piwo → 2 złota).' },
    chapel: { name: 'Kaplica', about: 'Dopóki stoi, każdy oddział strony walczy z większym sercem (+6 morale).' },
    well: { name: 'Studnia', about: 'Do chat w promieniu 40 m nowi ludzie wprowadzają się o czwartą część szybciej.' },
    brewery: { name: 'Browar', about: 'Warzy piwo ze zboża (2 zboża → 2 piwa) dla karczmy.' },
    market: { name: 'Targ', about: 'Sprzedaje nadwyżki za złoto i kupuje braki — drogo: sprzedaż za 60% wartości, zakup za 160%. Wyjście z zatoru, nie sposób na bogactwo.' },
    storehouse: { name: 'Skład', about: 'Drugi magazyn miasta: tragarze odnoszą towary do najbliższego magazynu i stamtąd je biorą. Postaw przy oddalonej wsi.' },
    sawmill: { name: 'Tartak', about: 'Tnie kłody na deski. Deski idą na wyższe poziomy budynków (połowa drewna).' },
    forester: { name: 'Leśnik', about: 'Doogląda młodego lasu wokół chaty: sadzi przy pniakach i pielęgnuje sadzonki, które rosną szybciej. Musi stać przy lesie.' },
    hunter: { name: 'Myśliwy', about: 'Poluje w lesie: mięso i skóry, zanim stać cię na chlewnię. Musi stać przy lesie.' },
    woodcutter: { name: 'Drwal', about: 'Drewno na budowę, do kuźni i dla łuczarza. Musi stać przy lesie.' },
    quarry: { name: 'Kamieniołom', about: 'Kamień na murowane budynki i drogi. Musi stać przy skale.' },
    farm: { name: 'Zagroda', about: 'Rolnik orze, sieje i żnie pasy pola za zagrodą. Zboże: na chleb, dla trzody i dla koni. Potrzebuje wolnej ziemi za plecami.' },
    fisher: { name: 'Rybak', about: 'Łowi ryby w jeziorze. Ryba to jedna racja. Musi stać nad wodą.' },
    windmill: { name: 'Młyn', about: 'Wiatrak miele zboże na mąkę dla piekarni. Skrzydła kręcą się, gdy pracuje.' },
    bakery: { name: 'Piekarnia', about: 'Piecze chleb z mąki. Bochenek to jedna racja.' },
    vineyard: { name: 'Winnica', about: 'Winiarz sadzi krzewy w rzędach za domem: raz posadzone rodzą winogrona co sezon. Zajmuje teren jak pola zagrody.' },
    winery: { name: 'Winiarnia', about: 'Tłoczy wino z winogron. Chata z winem płaci wyższy podatek i szybciej się zaludnia.' },
    pigFarm: { name: 'Chlewnia', about: 'Trzoda zjada zboże, daje mięso i skóry.' },
    butcher: { name: 'Masarnia', about: 'Robi kiełbasy z mięsa. Kiełbasa to dwie racje.' },
    tannery: { name: 'Garbarnia', about: 'Szyje ze skór zbroje dla pikinierów, strzelców i lekkiej jazdy.' },
    ironMine: { name: 'Kopalnia', about: 'Ruda żelaza dla huty. Musi stać przy rudonośnej skale.' },
    smelter: { name: 'Huta', about: 'Wytapia żelazo z rudy w dymarce, paląc drewno.' },
    smithy: { name: 'Kuźnia', about: 'Kuje broń z żelaza, pali drewnem.' },
    armourer: { name: 'Płatnerz', about: 'Kolczugi dla mieczników, halabardników i rycerstwa.' },
    fletcher: { name: 'Łuczarz', about: 'Łuki i kusze z drewna.' },
    stable: { name: 'Stajnia', about: 'Hoduje konie; karmi je zbożem.' },
    tower: { name: 'Wieża strażnicza', about: 'Kamienna wieża na najwyżej 4 łuczników albo kuszników: strzelają z góry dalej niż z ziemi. Zaznacz strzelców i kliknij wieżę prawym przyciskiem. Można ją postawić wszędzie, np. przy dalekiej kopalni.' },
    barracks: { name: 'Koszary', about: 'Wezwani mieszkańcy biorą tu ekwipunek i stają w szyku. Wyższy poziom to lepsze oddziały.' },
  },
  units: {
    militia: { name: 'Milicja', about: 'Mieszczanie z włócznią i drewnianą tarczą, bez zbroi. Werbowani w zamku, zanim staną koszary. Tylko do obrony miasta i okolic; po przezbrojeniu przy koszarach — wojsko do ataku.' },
    pikemen: { name: 'Pikinierzy', about: 'Las pik. Stojąc w szyku, zatrzymują szarżę jazdy; bez tarcz giną od strzał.' },
    archers: { name: 'Łucznicy', about: 'Strzelają na 80 m. W zwarciu giną.' },
    swordsmen: { name: 'Miecznicy', about: 'Miecz, tarcza i kolczuga: wygrywają prostą walkę piechoty.' },
    halberdiers: { name: 'Halabardnicy', about: 'Biją mocniej niż miecznicy i zatrzymują konie, ale nie mają tarcz.' },
    crossbowmen: { name: 'Kusznicy', about: 'Wolno napinają, strzelają płasko na 70 m; bełt przebija kolczugę.' },
    lightCavalry: { name: 'Lekka jazda', about: 'Szybka. Na łuczników, machiny i w pościg; nie na piki.' },
    heavyCavalry: { name: 'Ciężka jazda', about: 'Rycerstwo. Szarża, która łamie szyk.' },
    cannon: { name: 'Armaty', about: 'Dwa działa z ludwisarni. Kula na 120 m przebija każdą zbroję i wybija dziury w murach; z bliska bezbronne.' },
    mortar: { name: 'Moździerz', about: 'Ciężka kula stromym torem na 150 m: rozbija szyk, burzy mury, wieże i zamek. Nie strzela bliżej niż 40 m.' },
  },
  results: {
    cannotAfford: 'Za mało zasobów.',
    tooFar: 'Za daleko: buduj w zasięgu zamku albo do 70 m od własnego budynku (także w budowie).',
    offMap: 'Poza mapą: za ciemniejszą granicą terenu budować nie wolno.',
    apart: 'Za daleko od siebie: łączone oddziały muszą stać najwyżej 30 m od siebie.',
    needsWoods: 'Leśnik i myśliwy muszą stać przy lesie: najwyżej 40 m od jego skraju.',
    blocked: 'Miejsce jest zajęte albo zalane.',
    tooSteep: 'Teren jest zbyt stromy.',
    needsForest: 'Drwal musi stać przy lesie, z co najmniej 20 dorosłymi drzewami w zasięgu.',
    needsWater: 'Rybak musi stać nad jeziorem.',
    needsStone: 'Kamieniołom musi stać przy skale.',
    needsOre: 'Kopalnia musi stać przy rudonośnej skale.',
    needsLand: 'Za zagrodą brakuje wolnej ziemi na pola.',
    townFull: 'Miasto ma już komplet budynków.',
    noPeople: 'Brak wolnych ludzi: zbuduj chaty albo poczekaj na mieszkańców.',
    plotEmpty: 'Tu nic nie stoi.',
    alreadyBuilt: 'Obrócić można tylko budynek w budowie.',
    maxLevel: 'To już najwyższy poziom.',
    underConstruction: 'Budowa jeszcze trwa.',
    needsBarracks: 'Potrzebne koszary wyższego poziomu.',
    needsFoundry: 'Potrzebna ludwisarnia (moździerz: poziom 2).',
    needsMarket: 'Potrzebny targ.',
    armyFull: 'Armia w komplecie: 100 ludzi.',
    queueFull: 'Kolejka werbunku jest pełna.',
    noSuchRegiment: 'Nie ma takiego oddziału.',
    routing: 'Ten oddział ucieka i nie słucha rozkazów.',
    cannotRearm: 'Tego oddziału nie da się tak przezbroić.',
    notAtBarracks: 'Oddział musi stać przy własnych koszarach (pospolite ruszenie: przy zamku).',
    inCombat: 'Oddział walczy: poczekaj, aż walka ucichnie.',
    fullStrength: 'Oddział ma pełny skład.',
    reinforcing: 'Uzupełnienie już idzie.',
    rearming: 'Oddział jest właśnie przezbrajany.',
    cannotGarrison: 'Wieżę obsadzają tylko łucznicy albo kusznicy, jednego rodzaju naraz.',
    towerFull: 'Wieża ma już pełną załogę.',
    notThisUnit: 'Ten oddział tego nie umie.',
    needsKeep: 'Najpierw rozbuduj zamek: koszary nie mogą być wyższe niż on pozwala.',
    needsWall: 'Bramę stawia się we własnym murze: wskaż prosty odcinek co najmniej 6 m.',
    defenceOnly: 'Milicja broni tylko miasta i okolic. Przezbrój ją przy koszarach, żeby ruszyła dalej.',
    gameOver: 'Gra skończona.',
  },
  difficulty: { easy: 'Łatwy', normal: 'Normalny', hard: 'Trudny' },
  keep: 'Zamek',
  keepAbout: 'Serce miasta: skład, łucznicy na murach. Wyższy poziom: dalszy zasięg budowy, mocniejsze mury, szybsze strzały i wyższe koszary.',
  keepUpgrade: 'Rozbuduj zamek',
  keepRaising: 'Rozbudowa',
  keepHp: 'wytrzymałość',
  keepReach: 'zasięg budowy',
  barracksUpTo: 'koszary do poziomu',
  keepRaised: 'Zamek rozbudowany!',
  play: 'Graj',
  version: 'Wersja',
  resume: 'Wróć do gry',
  restart: 'Nowa gra',
  paused: 'Pauza',
  quality: 'Grafika',
  qualityHigh: 'Wysoka',
  qualityLow: 'Niska',
  difficultyLabel: 'Przeciwnik',
  startLabel: 'Zamek',
  modeLabel: 'Tryb',
  modes: { skirmish: 'Potyczka', defence: 'Obrona', tutorial: 'Samouczek', campaign: 'Kampania' },
  missions: [
    {
      title: 'Trybut',
      briefing:
        'Najeźdźca stanął obozem za rzeką: dwieście ludzi, ciężka jazda, miecznicy i kusznicy. Żąda trybutu: 600 złota, 200 chleba i 40 sztuk broni w ciągu 15 minut. Zapłać, a odejdzie. Jeśli nie zapłacisz, uderzy na miasto, a jego armii nie zatrzymasz. Broń trzeba zamówić w zakładce Produkcja, bo kuźnia czeka na zamówienie. Trybut wpłacasz przyciskiem na pasku u góry. Druga gwiazdka: w chwili zapłaty masz co najmniej 4 oddziały.',
    },
    {
      title: 'Obóz za rzeką',
      briefing:
        'Najeźdźca wziął trybut i nie odszedł, ale rozpuścił ludzi po wsiach. W obozie zostały trzy oddziały, dwa zagony grabią wioski po obu stronach i co pięć minut jeden z nich wraca do obozu. Przejdź rzekę brodem i rozbij ich, zanim się zbiorą. Wygrana: nie zostaje żaden oddział wroga. Druga gwiazdka: straty poniżej 30 %.',
    },
    { title: 'Odbicie osady', briefing: 'W czasie wojny wróg zajął Twoją osadę w dolinie. Zbierz wojsko i odbij ją, zanim nadejdzie odsiecz.' },
    { title: 'Odbudowa i wielka armia', briefing: 'Osada jest Twoja, ale w ruinach. Odbuduj ją i wystaw armię, jakiej marchia jeszcze nie widziała.' },
    { title: 'Twierdza', briefing: 'Czas zakończyć tę wojnę pod murami jego zamku: działa na mury, a on uderzy wypadami i odsieczą.' },
  ],
  campaignTitle: 'Kampania',
  missionLabel: 'Misja',
  missionLocked: 'najpierw wygraj poprzednią',
  missionSoon: 'wkrótce',
  missionStart: 'Do boju',
  tributeTitle: 'Trybut',
  tributeLeft: 'zostało',
  tributePay: 'Zapłać trybut',
  tributeTip: 'Wpłać trybut, gdy wszystko leży w zamku.',
  hostComing: 'Najeźdźca nadciąga! Jego armii nie zatrzymasz w polu: broń zamku.',
  campLeft: 'oddziały wroga',
  foragersBack: 'następny zagon wraca za',
  missionWon: 'Misja wygrana',
  missionLost: 'Misja przegrana',
  missionNext: 'Następna misja',
  missionRetry: 'Spróbuj jeszcze raz',
  missionList: 'Lista misji',
  starsLabel: 'Gwiazdki',
  carriedNote: 'Do następnej misji idzie najwyżej 8 najsilniejszych oddziałów i połowa złota (do 800).',
  mergeLabel: 'Połącz',
  mergeTip: 'Łączy zaznaczone oddziały tego rodzaju stojące blisko siebie (do 30 m), poza walką: ludzie przechodzą do najliczniejszego, do 20 w oddziale.',
  merged: 'Oddziały połączone',
  characterLabel: 'Przeciwnik gra',
  characters: { balanced: 'z umiarem', builder: 'jak budowniczy', raider: 'jak najeźdźca' },
  tutorialTitle: 'Samouczek',
  tutorialSteps: [
    'Postaw drwala przy skraju lasu: zakładka Buduj → Drwal, kliknij przy drzewach.',
    'Postaw zagrodę (pola) i chatę (ludzie): zboże i nowi mieszkańcy.',
    'Postaw młyn i piekarnię: zboże → mąka → chleb, którym żyje miasto.',
    'Postaw kamieniołom przy szarej wychodni kamienia za zamkiem.',
    'Zwerbuj milicję: zakładka Werbunek → Milicja (szkoli się przy zamku).',
    'Zaznacz oddział lewym przyciskiem i kliknij prawym w teren, żeby go przesunąć.',
    'Postaw koszary: tam szkolą się piechurzy, łucznicy i jazda.',
  ],
  tutorialDone: 'Gotowe! Teraz potyczka z komputerem albo obrona przed falami.',
  defenceLeft: 'Obrona: do końca',
  wave: 'fal',
  nextWave: 'następna za',
  startSites: ['Róg', 'Zachód', 'Południe'],
  mapLabel: 'Mapa',
  layouts: { field: 'Otwarte pole', river: 'Przeprawa', forest: 'Bór' },
  loading: 'Wczytywanie',
  victory: 'Zwycięstwo',
  defeat: 'Porażka',
  victoryText: 'Zamek przeciwnika padł.',
  defeatText: 'Twój zamek padł.',
  kills: 'Pokonani wrogowie',
  losses: 'Straty własne',
  time: 'Czas',
  army: 'Wojsko',
  level: 'poziom',
  build: 'Buduj',
  upgrade: 'Ulepsz',
  demolish: 'Rozbierz',
  turnSite: 'Obróć (R)',
  sell: 'Sprzedaj',
  buy: 'Kup',
  marketNote: 'Przy każdym towarze: sprzedaj 10 (−10, +złoto) albo kup 10 (+10, −złoto).',
  pause: 'Wstrzymaj',
  unpause: 'Wznów',
  recruit: 'Werbunek',
  production: 'Produkcja',
  prodStock: 'w zamku',
  prodMade: 'wytwarza /min',
  prodNet: 'bilans /min',
  holdUps: 'Zatory',
  allWorking: 'Wszystkie warsztaty pracują.',
  prodYards: 'na podwórzach',
  priority: 'priorytet',
  kindPriorityTip: 'Kto pierwszy dostaje surowiec, gdy kilka warsztatów chce tego samego: ▲ ten rodzaj pierwszy, ▼ ostatni. Kliknij, by zmienić.',
  priorityTip: 'Priorytet tragarzy dla tego towaru: ▲ wysoki (noszą go najpierw), · zwykły, ▼ niski. Kliknij, by zmienić.',
  orderHead: 'zamówione',
  orderTip: 'Zamówienie: warsztaty robią tyle i stają (∞ = bez limitu, 0 = wstrzymane). Warsztaty uzbrojenia startują z zerem: pracują dopiero po zamówieniu.',
  orderArms: 'Zamów uzbrojenie',
  ordered: 'Zamówione do zrobienia',
  pauseTip: 'Pauza (Spacja): bitwa staje, rozkazy można wydawać dalej',
  pausedBanner: '<b>Pauza</b> · wydawaj rozkazy (Shift + prawy: do kolejki) · Spacja wznawia',
  fromKeep: 'od zamku',
  fromBuilding: 'od budynku',
  orderLess: 'Mniej',
  orderMore: 'Więcej',
  orderInf: 'Kliknij: bez limitu (∞)',
  transport: 'Transport',
  transportTip: 'Ile tragarz niesie za jednym razem i jak szybko idzie. Wyższy poziom: wózki ręczne, potem wozy konne.',
  transportLevels: ['na plecach', 'wózki ręczne', 'wozy konne'],
  carries: 'ładunek',
  faster: 'szybciej',
  transportRaising: 'Ulepszanie transportu',
  transportRaised: 'Transport ulepszony',
  needsKeepLevel: 'wymaga zamku poziomu',
  buildingsTab: 'Budynki',
  listTip: 'Kliknij: pokaż następny budynek tego rodzaju i otwórz jego panel.',
  underConstructionShort: 'w budowie',
  idleShort: 'stoi',
  count: 'liczba',
  levels: 'poziomy',
  inYards: 'na podwórzach',
  usesPerMin: 'zużywa /min (pełna praca)',
  noBuildings: 'Jeszcze nic nie zbudowano.',
  lacks: 'brak',
  show: 'pokaż',
  raid: 'Wróg w osadzie!',
  yardFullAlarm: 'Pełne podwórze, tragarze nie nadążają:',
  noTreesAlarm: 'Drwal nie ma dorosłych drzew w zasięgu:',
  queue: 'W szkoleniu',
  halt: 'Stój (H)',
  selectAll: 'Całe wojsko (Ctrl+A)',
  men: 'ludzi',
  morale: 'Morale',
  fatigue: 'Zmęczenie',
  underConstruction: 'Budowa',
  working: 'Pracuje',
  waiting: 'Czeka na surowiec',
  pausedBuilding: 'Wstrzymany',
  maxLevel: 'Najwyższy poziom',
  needsBarracksLevel: 'koszary poz.',
  needsFoundryLevel: 'ludwisarnia poz.',
  hintIdle: 'Wybierz budynek z listy i wskaż miejsce na mapie. Kliknij oddział, żeby wydać rozkaz.',
  hintArmy: 'Prawy przycisk: marsz. Dwa kliknięcia albo B: bieg. Przytrzymaj prawy i przeciągnij: linia i kierunek. Na wroga: atak. Shift: do kolejki. Spacja: pauza. Ctrl+cyfra: grupa i jej szyk.',
  starving: 'Głód! Produkcja zwalnia, podatki ustają, morale spada.',
  fed: 'Miasto znów ma co jeść.',
  routed: 'Nasz oddział ucieka!',
  rallied: 'Oddział zebrał się i wraca do szyku.',
  shattered: 'Nasz oddział został rozbity.',
  enemyRouted: 'Wróg ucieka!',
  built: 'Budowa ukończona',
  recruited: 'Nowy oddział gotów',
  lost: 'Straciliśmy budynek',
  attackWarning: 'Wróg pod miastem!',
  state: { hold: 'stoi', move: 'maszeruje', attack: 'atakuje', siege: 'szturmuje', routing: 'ucieka', fighting: 'walczy' },
  helpTitle: 'Sterowanie',
  help: [
    'WASD / strzałki / krawędź ekranu: przesuwanie mapy',
    'Kółko myszy: zoom (do widoku całej mapy) · środkowy przycisk: przesuwanie mapy · prawy przycisk przeciągnięty albo Q / E: obrót',
    'Budowa: wybierz budynek, R obraca, lewy przycisk stawia, prawy anuluje · G: droga',
    'Lewy przycisk: zaznacz · przeciągnij: ramka · Shift: dodaj',
    'Prawy przycisk (klik): marsz / atak · dwa kliknięcia: bieg · B: marsz albo bieg · Ctrl + przeciągnięcie prawym: front',
    'H: stój · Ctrl+A: całe wojsko · Esc: odznacz / pauza · F3: pomiar',
    'Ctrl+1…9: zapamiętaj grupę · 1…9: zaznacz (dwa razy: kamera do niej) · dwuklik oddziału: wszystkie tego rodzaju na ekranie · Ctrl+F5…F8: zapamiętaj widok, F5…F8: wróć',
    'Dotyk: palec przesuwa, dwa palce przybliżają i obracają, stuknięcie zaznacza, stawia i rozkazuje',
  ],
  groupKept: 'Zapamiętano grupę',
  formationKept: 'Zapamiętano szyk (oddziały idą razem w tym ustawieniu) pod klawiszem',
  ranksLabel: 'Szeregi',
  formationLabel: 'Szyk',
  formations: { line: 'Prostokąt', wedge: 'Klin', loose: 'Luźny' },
  stanceLabel: 'Postawa',
  stances: { normal: 'Zwykła', shields: 'Tarcze', pikeWall: 'Ściana pik' },
  fireLabel: 'Strzelanie',
  fireAtWill: 'Dowolne',
  fireOnOrder: 'Na rozkaz',
  formationTips: {
    wedge: 'Klin (jazda): szarża mocniejsza o 60 %, obrona słabsza.',
    loose: 'Szyk luźny: strzały trafiają o połowę rzadziej, wręcz słabiej.',
    shields: 'Za tarczami: dwa razy mniej trafień strzał, marsz wolniejszy, cios słabszy.',
    pikeWall: 'Ściana pik: oddział stoi; szarża z przodu nic nie daje, jazda obrywa podwójnie.',
    fire: 'Dowolne: strzelcy sami wybierają cel w zasięgu. Na rozkaz: tylko w to, na co ich poślesz.',
  },
  saveGame: 'Zapisz grę',
  loadGame: 'Wczytaj grę',
  saved: 'Zapisano',
  saveFailed: 'Przeglądarka nie przyjęła zapisu',
  volumeLabel: 'Głośność',
  edgeScrollLabel: 'Krawędź ekranu',
  on: 'przesuwa',
  off: 'nie',
  viewKept: 'Zapamiętano widok',
  counters: {
    militia: 'Tania obrona domu. Słaba na każde regularne wojsko.',
    pikemen: 'Dobrzy na: jazdę. Słabi na: łuczników, kuszników, mieczników.',
    archers: 'Dobrzy na: piechotę bez tarcz z daleka. Słabi na: jazdę, kuszników.',
    swordsmen: 'Dobrzy na: pikinierów, łuczników wręcz. Słabi na: halabardników, kuszników.',
    halberdiers: 'Dobrzy na: jazdę, mieczników. Słabi na: łuczników i kuszników.',
    crossbowmen: 'Dobrzy na: opancerzonych (kolczuga). Słabi na: lekką jazdę.',
    lightCavalry: 'Dobra na: strzelców, machiny, uciekających. Słaba na: pikinierów, halabardników.',
    heavyCavalry: 'Dobra na: mieczników, strzelców. Słaba na: pikinierów, halabardników, kuszników.',
    cannon: 'Dobre na: oddziały z daleka, mury i budynki. Słabe na: każdego, kto podejdzie blisko.',
    mortar: 'Dobry na: mury, budynki, zbite szyki. Słaby na: wszystko z bliska.',
  },
  paceLabel: 'Tempo',
  paceWalk: 'Marsz',
  paceRun: 'Bieg',
  paceTip: 'Marsz albo bieg (B): od razu dla zaznaczonych w drodze i dla kolejnych rozkazów. Bieg jest szybszy, ale męczy (cienki pasek pod morale), a zmęczeni walczą słabiej. Dwa kliknięcia zawsze wysyłają biegiem; do ataku podchodzi się biegiem.',
  paceWalkNow: 'Rozkazy: marszem',
  paceRunNow: 'Rozkazy: biegiem',
  runningState: 'biegnie',
  updateReady: 'Pobrano nową wersję gry — włączy się przy następnym uruchomieniu.',
  updateNow: 'Uruchom teraz',
  menu: 'Menu',
  speed: 'Tempo',
  makes: 'daje',
  from: 'z',
  taxes: 'podatek',
  rations: 'racji/min',
  trains: 'Szkoli',
  road: 'Droga (G)',
  roadAbout: 'Ludzie chodzą drogą szybciej i sami ją wybierają. Kosztuje kamień.',
  people: 'Ludzie',
  free: 'wolni',
  residents: 'mieszkańców',
  stores: 'Skład',
  yard: 'Podwórze',
  fields: 'Pola',
  hintBuild: 'Lewy przycisk: postaw · R: obróć · T: siatka · prawy przycisk / Esc: anuluj · Shift: stawiaj kolejne',
  grid: 'Siatka',
  gridTip: 'Budynki przyciągają się do siatki co 16 m, równoległej do dróg, drzwiami w jednym z czterech kierunków (R obraca o 90°): miasto w kwartałach. Pusta kratka między rzędami mieści ulicę.',
  gridOn: 'wł.',
  gridOff: 'wył.',
  hintRoadStart: 'Droga: wskaż początek. Prawy przycisk / Esc: koniec.',
  hintRoadEnd: 'Droga: wskaż koniec odcinka.',
  roadCost: 'kamienia',
  turnLeft: 'Obróć mapę w lewo (Q)',
  turnRight: 'Obróć mapę w prawo (E)',
  work: { working: 'Pracuje', building: 'Budowa', paused: 'Wstrzymany', noWorker: 'Brak pracownika', noInput: 'Czeka na surowiec', yardFull: 'Podwórze pełne — czeka na tragarzy', noTrees: 'Brak dorosłych drzew w zasięgu — czeka, aż sadzonki urosną', orderDone: 'Zamówienie wykonane — czeka na następne', waiting: 'Czeka' },
  recruits: 'rekrutów w drodze',
  rearm: 'Przezbrój',
  rearmed: 'Oddział przezbrojony',
  rearmingState: 'przezbraja się',
  reinforce: 'Uzupełnij',
  reinforceTip: 'Uzupełnia oddział do pełnego składu: złoto i broń za każdego nowego, ludzie przychodzą z miasta. Nowi rozwadniają doświadczenie; poległego kapitana zastępuje jeden z nich.',
  reinforced: 'Oddział uzupełniony',
  reinforcingState: 'czeka na uzupełnienie',
  ranks3: ['zieloni', 'zaprawieni', 'weterani'],
  rankTip: 'Doświadczenie rośnie z każdym zabitym wrogiem: zaprawieni i weterani lepiej walczą, celniej strzelają i trudniej ich złamać.',
  captain: 'kapitan',
  noCaptain: 'bez kapitana',
  captainFell: 'Poległ kapitan oddziału',
  promoted: 'Oddział zyskał doświadczenie',
  unpaid: 'Brak złota na żołd: wojsko traci ducha',
  paid: 'Żołd znów wypłacany',
  payTip: 'żołd',
  atKeep: 'w zamku, bez koszar',
  wall: 'Mur',
  wallAbout: 'Kamienny mur rysowany od punktu do punktu. Zatrzymuje wszystkich; wróg go rozbija, machiny szybciej. Twoi przechodzą przez bramy.',
  hintWallStart: 'Mur: wskaż początek. Prawy przycisk / Esc: koniec.',
  hintWallEnd: 'Mur: wskaż koniec odcinka.',
  gate: 'Brama',
  gateAbout: 'Brama w twoim murze (6 m): twoi ludzie i żołnierze przez nią przechodzą, dla wroga to mur — mocniejszy niż zwykły. Kliknij we własny mur.',
  hintGate: 'Brama: kliknij we własny mur. Prawy przycisk / Esc: koniec.',
  garrison: 'Załoga',
  ungarrison: 'Wyprowadź załogę',
  garrisoned: 'Strzelcy weszli do wieży',
  wallBroken: 'Mur przebity!',
  points: { mine: 'Bogata kopalnia', quarry: 'Kamieniołom w polu', village: 'Wieś' },
  pointAbout: 'postaw przy niej oddział na 20 s bez wroga w pobliżu, a da dochód',
  pointTaken: 'Zajęliśmy:',
  pointLost: 'Wróg zajął:',
  nobodys: 'niczyja',
  taking: 'zajmuje',
  hover: { stone: 'Wychodnia kamienia — postaw obok kamieniołom', ore: 'Ruda żelaza — postaw obok kopalnię', forest: 'Las — drwal przy jego skraju', lake: 'Jezioro — rybak na brzegu', mountain: 'Góry — nie do przejścia', crag: 'Skały — trzeba je obejść', enemy: 'wroga', yours: 'twój' },
};

const en: Strings = {
  title: 'Marchland',
  subtitle: 'Medieval strategy: a town, formations, a battle',
  resources: { gold: 'Gold', wood: 'Wood', planks: 'Planks', stone: 'Stone', grain: 'Grain', flour: 'Flour', grapes: 'Grapes', wine: 'Wine', ale: 'Ale', bread: 'Bread', fish: 'Fish', meat: 'Meat', sausage: 'Sausages', hide: 'Hides', leatherArmor: 'Leather', ironOre: 'Ore', iron: 'Iron', weapon: 'Weapons', mailArmor: 'Mail', bow: 'Bows', horse: 'Horses' },
  buildings: {
    house: { name: 'House', about: 'People live here: workers, carriers, builders and recruits. Fed, they pay tax.' },
    foundry: { name: 'Gun Foundry', about: 'Casts guns from iron: cannon (level 1) and mortars (level 2). Their crews come from the town like recruits.' },
    tavern: { name: 'Tavern', about: 'The innkeeper sells the ale from the brewery: gold besides the tax (1 ale → 2 gold).' },
    chapel: { name: 'Chapel', about: 'While it stands every regiment of the side fights with more heart (+6 morale).' },
    well: { name: 'Well', about: 'Houses within 40 m take in newcomers a quarter sooner.' },
    brewery: { name: 'Brewery', about: 'Brews ale from grain (2 grain → 2 ale) for the tavern.' },
    market: { name: 'Market', about: 'Sells surplus for gold and buys what is short — at a poor rate: sold for 60% of worth, bought for 160%. A way out of a stalled chain, not a way to get rich.' },
    storehouse: { name: 'Storehouse', about: "A second store of the town's goods: carriers bring to and fetch from the nearest store. Build it by a far village." },
    sawmill: { name: 'Sawmill', about: 'Saws logs into planks. Higher levels of buildings take planks for half their timber.' },
    forester: { name: 'Forester', about: 'Tends the young wood round his lodge: plants by bare stumps and looks after saplings so they grow faster. Must stand by the forest.' },
    hunter: { name: 'Hunter', about: 'Hunts in the woods: meat and hides before you can afford pigs. Must stand by the forest.' },
    woodcutter: { name: 'Woodcutter', about: 'Wood for building, for the smithy and the fletcher. Must stand by the forest.' },
    quarry: { name: 'Quarry', about: 'Stone for masonry buildings and roads. Must stand by a stone outcrop.' },
    farm: { name: 'Farm', about: 'The farmer breaks, sows and reaps strips of land behind the farm. Grain: for bread, pigs and horses. Needs open land behind it.' },
    fisher: { name: 'Fisher', about: 'Catches fish in the lake. A fish is one ration. Must stand by the water.' },
    windmill: { name: 'Windmill', about: 'Grinds grain into flour for the bakery. Its sails turn while it works.' },
    bakery: { name: 'Bakery', about: 'Bakes bread from flour. A loaf is one ration.' },
    vineyard: { name: 'Vineyard', about: 'The vintner plants rows of vines behind the house: once planted they bear grapes every season. Takes up land like a farm\'s fields.' },
    winery: { name: 'Winery', about: 'Presses grapes into wine. A house with wine pays more tax and fills faster.' },
    pigFarm: { name: 'Pig farm', about: 'Pigs eat grain and give meat and hides.' },
    butcher: { name: 'Butcher', about: 'Makes sausages from meat. A sausage is two rations.' },
    tannery: { name: 'Tannery', about: 'Turns hides into armour for pikemen, shooters and light cavalry.' },
    ironMine: { name: 'Iron mine', about: 'Ore for the smelter. Must stand by an ore outcrop.' },
    smelter: { name: 'Smelter', about: 'Smelts iron from ore in a bloomery, burning wood.' },
    smithy: { name: 'Smithy', about: 'Forges weapons from iron, burning wood.' },
    armourer: { name: 'Armourer', about: 'Mail for swordsmen, halberdiers and knights.' },
    fletcher: { name: 'Fletcher', about: 'Bows and crossbows from wood.' },
    stable: { name: 'Stable', about: 'Breeds horses on grain.' },
    tower: { name: 'Watchtower', about: 'A stone tower for up to 4 archers or crossbowmen, who shoot further from its top. Select shooters and right-click the tower. It can stand anywhere, by a far mine for one.' },
    barracks: { name: 'Barracks', about: 'Townspeople called up take their equipment here and form up. A higher level trains better regiments.' },
  },
  units: {
    militia: { name: 'Militia', about: 'Townsmen with a spear and a wooden shield, no armour. Raised at the keep before there is a barracks. Defends the town and its land only; re-armed at the barracks it becomes an army that can attack.' },
    pikemen: { name: 'Pikemen', about: 'A hedge of pikes. Standing in formation they stop a cavalry charge; with no shields they die to arrows.' },
    archers: { name: 'Archers', about: 'Shoot to 80 m. Die in melee.' },
    swordsmen: { name: 'Swordsmen', about: 'Sword, shield and mail: they win a straight fight on foot.' },
    halberdiers: { name: 'Halberdiers', about: 'Hit harder than swordsmen and stop horses, but carry no shield.' },
    crossbowmen: { name: 'Crossbowmen', about: 'Slow to span, flat-shooting to 70 m; a bolt goes through mail.' },
    lightCavalry: { name: 'Light cavalry', about: 'Fast. For archers, engines and pursuit; not for pikes.' },
    heavyCavalry: { name: 'Heavy cavalry', about: 'Knights. A charge that breaks a line.' },
    cannon: { name: 'Cannon', about: 'Two guns from the foundry. A ball to 120 m goes through any armour and holes walls; helpless up close.' },
    mortar: { name: 'Mortar', about: 'A heavy ball on a high arc to 150 m: scatters a formation, brings down walls, towers and the keep. Cannot shoot closer than 40 m.' },
  },
  results: {
    cannotAfford: 'Not enough resources.',
    tooFar: 'Too far: build within the keep\'s reach or up to 70 m from a building of yours.',
    offMap: 'Off the map: no building beyond the darker edge of the land.',
    apart: 'Too far apart: regiments to merge must stand within 30 m of each other.',
    needsWoods: 'A forester or a hunter must stand by the woods: within 40 m of their edge.',
    blocked: 'The place is taken or under water.',
    tooSteep: 'The ground is too steep.',
    needsForest: 'A woodcutter must stand by the forest, with at least 20 grown trees in reach.',
    needsWater: 'A fisher must stand by the lake.',
    needsStone: 'A quarry must stand by a stone outcrop.',
    needsOre: 'A mine must stand by an ore outcrop.',
    needsLand: 'No open land behind the farm for its fields.',
    townFull: 'The town has all the buildings it may.',
    noPeople: 'No free people: build houses or wait for newcomers.',
    plotEmpty: 'Nothing stands here.',
    alreadyBuilt: 'Only a building still going up can be turned.',
    maxLevel: 'Already at the highest level.',
    underConstruction: 'Still under construction.',
    needsBarracks: 'Needs a barracks of a higher level.',
    needsFoundry: 'Needs a gun foundry (mortar: level 2).',
    needsMarket: 'Needs a market.',
    armyFull: 'The army is full: 100 men.',
    queueFull: 'The recruiting queue is full.',
    noSuchRegiment: 'No such regiment.',
    routing: 'That regiment is running and takes no orders.',
    cannotRearm: 'That regiment cannot be re-armed so.',
    notAtBarracks: 'The regiment must stand by its own barracks (militia: by the keep).',
    inCombat: 'The regiment is fighting: wait until the fight dies down.',
    fullStrength: 'The regiment is at full strength.',
    reinforcing: 'New men are already on their way.',
    rearming: 'The regiment is being re-armed.',
    cannotGarrison: 'Only archers or crossbowmen man a tower, one kind at a time.',
    towerFull: 'The tower is fully manned.',
    notThisUnit: 'This regiment cannot do that.',
    needsKeep: 'Raise the keep first: the barracks may rise no higher than it allows.',
    needsWall: 'A gate goes into your own wall: point at a straight stretch at least 6 m long.',
    defenceOnly: 'Militia only defends the town and its land. Re-arm it at the barracks to take it further.',
    gameOver: 'The game is over.',
  },
  difficulty: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  keep: 'Keep',
  keepAbout: 'The heart of the town: its store, archers on its walls. A higher level: a wider reach to build in, stronger walls, quicker arrows and taller barracks.',
  keepUpgrade: 'Raise the keep',
  keepRaising: 'Raising',
  keepHp: 'strength',
  keepReach: 'building reach',
  barracksUpTo: 'barracks up to level',
  keepRaised: 'The keep is raised!',
  play: 'Play',
  version: 'Build',
  resume: 'Back to the game',
  restart: 'New game',
  paused: 'Paused',
  quality: 'Graphics',
  qualityHigh: 'High',
  qualityLow: 'Low',
  difficultyLabel: 'Opponent',
  startLabel: 'Keep',
  modeLabel: 'Mode',
  modes: { skirmish: 'Skirmish', defence: 'Defence', tutorial: 'Tutorial', campaign: 'Campaign' },
  missions: [
    {
      title: 'Tribute',
      briefing:
        'The invader has camped across the river: two hundred men, knights, swordsmen and crossbowmen. He demands a tribute: 600 gold, 200 bread and 40 weapons within 15 minutes. Pay, and he goes. If you do not, he falls on the town, and his host cannot be stopped. Weapons must be ordered on the Production tab: the smithy waits for an order. Pay with the button on the bar at the top. Second star: four regiments or more when you pay.',
    },
    {
      title: 'The camp across the river',
      briefing:
        'The invader took the tribute and stayed, but sent his men off to plunder. Three regiments hold the camp, two bands of foragers raid the villages on either side, and every five minutes one of them comes back. Cross at a ford and break them before they gather. Won when no enemy regiment is left. Second star: losses under 30 %.',
    },
    { title: 'The settlement retaken', briefing: 'In the war the enemy took your settlement in the valley. Raise an army and take it back before his relief comes.' },
    { title: 'Rebuilding and a great army', briefing: 'The settlement is yours again, in ruins. Rebuild it and raise an army such as the march has never seen.' },
    { title: 'The fortress', briefing: 'End this war under the walls of his castle: guns on the walls, while he strikes back with sallies and a relief army.' },
  ],
  campaignTitle: 'Campaign',
  missionLabel: 'Mission',
  missionLocked: 'win the one before first',
  missionSoon: 'coming soon',
  missionStart: 'To battle',
  tributeTitle: 'Tribute',
  tributeLeft: 'left',
  tributePay: 'Pay the tribute',
  tributeTip: 'Pay the tribute once it all lies in the keep.',
  hostComing: 'The invader is coming! His host cannot be stopped in the field: defend the keep.',
  campLeft: 'enemy regiments',
  foragersBack: 'next foragers back in',
  missionWon: 'Mission won',
  missionLost: 'Mission lost',
  missionNext: 'Next mission',
  missionRetry: 'Try again',
  missionList: 'Missions',
  starsLabel: 'Stars',
  carriedNote: 'Up to the 8 strongest regiments and half the gold (at most 800) go on to the next mission.',
  mergeLabel: 'Merge',
  mergeTip: 'Merges the selected regiments of this kind standing close together (within 30 m), out of the fight: the men join the largest, up to 20 a regiment.',
  merged: 'Regiments merged',
  characterLabel: 'The enemy plays',
  characters: { balanced: 'steadily', builder: 'as a builder', raider: 'as a raider' },
  tutorialTitle: 'Tutorial',
  tutorialSteps: [
    'Put a woodcutter by the edge of the forest: Build tab → Woodcutter, click by the trees.',
    'Put down a farm (fields) and a house (people): grain and newcomers.',
    'Put down a mill and a bakery: grain → flour → the bread the town lives on.',
    'Put a quarry by the grey stone outcrop behind the keep.',
    'Recruit militia: Recruit tab → Militia (it trains by the keep).',
    'Select the regiment with the left button and right-click the ground to move it.',
    'Put down barracks: foot, archers and horse are trained there.',
  ],
  tutorialDone: 'Done! Now a skirmish against the computer, or the defence against waves.',
  defenceLeft: 'Defence: to go',
  wave: 'waves',
  nextWave: 'next in',
  startSites: ['Corner', 'West', 'South'],
  mapLabel: 'Map',
  layouts: { field: 'Open field', river: 'Crossing', forest: 'Forest road' },
  loading: 'Loading',
  victory: 'Victory',
  defeat: 'Defeat',
  victoryText: 'The enemy keep has fallen.',
  defeatText: 'Your keep has fallen.',
  kills: 'Enemies brought down',
  losses: 'Own losses',
  time: 'Time',
  army: 'Army',
  level: 'level',
  build: 'Build',
  upgrade: 'Upgrade',
  demolish: 'Demolish',
  turnSite: 'Turn (R)',
  sell: 'Sell',
  buy: 'Buy',
  marketNote: 'For each good: sell ten (−10, +gold) or buy ten (+10, −gold).',
  pause: 'Pause',
  unpause: 'Resume',
  recruit: 'Recruit',
  production: 'Production',
  prodStock: 'in the keep',
  prodMade: 'made /min',
  prodNet: 'change /min',
  holdUps: 'Hold-ups',
  allWorking: 'Every workshop is working.',
  prodYards: 'in yards',
  priority: 'priority',
  kindPriorityTip: 'Who gets an input first when several workshops want the same: ▲ this kind first, ▼ last. Click to change.',
  priorityTip: 'Carriers\' priority for this good: ▲ high (carried first), · normal, ▼ low. Click to change.',
  orderHead: 'ordered',
  orderTip: 'Order: the workshops make this much and stop (∞ = no limit, 0 = stopped).',
  orderArms: 'Order arms',
  ordered: 'On order',
  pauseTip: 'Pause (Space): the battle stops, orders can still be given',
  pausedBanner: '<b>Paused</b> · give orders (Shift + right: queue them) · Space resumes',
  fromKeep: 'from the keep',
  fromBuilding: 'from a building',
  orderLess: 'Less',
  orderMore: 'More',
  orderInf: 'Click: no limit (∞)',
  transport: 'Transport',
  transportTip: 'How much a carrier takes in one trip and how fast he goes. Higher levels: handcarts, then horse and wagon.',
  transportLevels: ['on their backs', 'handcarts', 'horse wagons'],
  carries: 'load',
  faster: 'faster',
  transportRaising: 'Improving transport',
  transportRaised: 'Transport improved',
  needsKeepLevel: 'needs keep level',
  buildingsTab: 'Buildings',
  listTip: 'Click: go to the next building of this kind and open its panel.',
  underConstructionShort: 'building',
  idleShort: 'idle',
  count: 'count',
  levels: 'levels',
  inYards: 'in yards',
  usesPerMin: 'uses /min (full work)',
  noBuildings: 'Nothing built yet.',
  lacks: 'lacks',
  show: 'show',
  raid: 'The enemy is in the town!',
  yardFullAlarm: 'Yard full, the carriers cannot keep up:',
  noTreesAlarm: 'No grown trees in reach of:',
  queue: 'In training',
  halt: 'Halt (H)',
  selectAll: 'Whole army (Ctrl+A)',
  men: 'men',
  morale: 'Morale',
  fatigue: 'Fatigue',
  underConstruction: 'Building',
  working: 'Working',
  waiting: 'Waiting for input',
  pausedBuilding: 'Paused',
  maxLevel: 'Highest level',
  needsBarracksLevel: 'barracks lvl',
  needsFoundryLevel: 'foundry lvl',
  hintIdle: 'Pick a building from the list and point at the map. Click a regiment to give orders.',
  hintArmy: 'Right click: march. Double click or B: run. Hold right and drag: line and facing. On an enemy: attack. Shift: queue. Space: pause. Ctrl+digit: group and its formation.',
  starving: 'Hunger! Production slows, taxes stop, morale falls.',
  fed: 'The town has food again.',
  routed: 'Our regiment is running!',
  rallied: 'The regiment has rallied.',
  shattered: 'Our regiment has been shattered.',
  enemyRouted: 'The enemy is running!',
  built: 'Building finished',
  recruited: 'A new regiment is ready',
  lost: 'We have lost a building',
  attackWarning: 'The enemy is at the town!',
  state: { hold: 'holding', move: 'marching', attack: 'attacking', siege: 'storming', routing: 'routing', fighting: 'fighting' },
  helpTitle: 'Controls',
  help: [
    'WASD / arrows / screen edge: move the map',
    'Mouse wheel: zoom (out to the whole map) · middle button: move the map · right drag or Q / E: turn',
    'Building: pick a building, R turns it, left button places, right button cancels · G: road',
    'Left button: select · drag: box · Shift: add',
    'Right click: march / attack · double click: run · B: march or run · Ctrl + right drag: set the front',
    'H: halt · Ctrl+A: whole army · Esc: deselect / pause · F3: measurements',
    'Ctrl+1…9: keep a group · 1…9: select it (twice: camera to it) · double-click a regiment: all of its kind on screen · Ctrl+F5…F8: keep a view, F5…F8: go back to it',
    'Touch: one finger moves, two fingers zoom and turn, a tap selects, places and orders',
  ],
  groupKept: 'Group kept',
  formationKept: 'Formation kept (the regiments march together in this shape) on key',
  ranksLabel: 'Ranks',
  formationLabel: 'Formation',
  formations: { line: 'Block', wedge: 'Wedge', loose: 'Open' },
  stanceLabel: 'Stance',
  stances: { normal: 'Normal', shields: 'Shields', pikeWall: 'Pike wall' },
  fireLabel: 'Shooting',
  fireAtWill: 'At will',
  fireOnOrder: 'On order',
  formationTips: {
    wedge: 'Wedge (horse): the charge 60 % harder, the defence weaker.',
    loose: 'Open order: arrows hit half as often, hand to hand it is weaker.',
    shields: 'Behind shields: half the arrow hits, a slower march, weaker blows.',
    pikeWall: 'Pike wall: the regiment stands; a charge into its front gets nothing, horse are struck twice as hard.',
    fire: 'At will: the shooters pick targets in range. On order: only what you send them against.',
  },
  saveGame: 'Save game',
  loadGame: 'Load game',
  saved: 'Saved',
  saveFailed: 'The browser would not take the save',
  volumeLabel: 'Volume',
  edgeScrollLabel: 'Screen edge',
  on: 'moves',
  off: 'no',
  viewKept: 'View kept',
  counters: {
    militia: 'Cheap home defence. Poor against any regular troops.',
    pikemen: 'Good against: horse. Poor against: archers, crossbowmen, swordsmen.',
    archers: 'Good against: foot without shields, from afar. Poor against: horse, crossbowmen.',
    swordsmen: 'Good against: pikemen, archers in melee. Poor against: halberdiers, crossbowmen.',
    halberdiers: 'Good against: horse, swordsmen. Poor against: archers and crossbowmen.',
    crossbowmen: 'Good against: armoured men (mail). Poor against: light horse.',
    lightCavalry: 'Good against: shooters, engines, men running away. Poor against: pikemen, halberdiers.',
    heavyCavalry: 'Good against: swordsmen, shooters. Poor against: pikemen, halberdiers, crossbowmen.',
    cannon: 'Good against: regiments from afar, buildings. Poor against: anyone who comes close.',
    mortar: 'Good against: walls, buildings, packed ranks. Poor against: anything close.',
  },
  paceLabel: 'Pace',
  paceWalk: 'March',
  paceRun: 'Run',
  paceTip: 'March or run (B): at once for the selected regiments on the move, and for the next orders. Running is faster but tires the men (the thin bar under morale), and tired men fight worse. Two quick clicks always run; an attack closes at the run.',
  paceWalkNow: 'Orders: at the march',
  paceRunNow: 'Orders: at the run',
  runningState: 'running',
  updateReady: 'A new version of the game is downloaded — it starts next time.',
  updateNow: 'Restart now',
  menu: 'Menu',
  speed: 'Speed',
  makes: 'makes',
  from: 'from',
  taxes: 'tax',
  rations: 'rations/min',
  trains: 'Trains',
  road: 'Road (G)',
  roadAbout: 'People walk faster on a road and take it by themselves. Costs stone.',
  people: 'People',
  free: 'free',
  residents: 'residents',
  stores: 'Stores',
  yard: 'Yard',
  fields: 'Fields',
  hintBuild: 'Left button: place · R: turn · T: grid · right button / Esc: cancel · Shift: place more',
  grid: 'Grid',
  gridTip: 'Buildings snap to a 16 m grid square with the roads, doors facing one of four ways (R turns by 90°): a town in blocks. An empty cell between rows holds a street.',
  gridOn: 'on',
  gridOff: 'off',
  hintRoadStart: 'Road: point at the start. Right button / Esc: done.',
  hintRoadEnd: 'Road: point at the end of the stretch.',
  roadCost: 'stone',
  turnLeft: 'Turn the map left (Q)',
  turnRight: 'Turn the map right (E)',
  work: { working: 'Working', building: 'Building', paused: 'Paused', noWorker: 'No worker', noInput: 'Waiting for input', yardFull: 'Yard full — waiting for carriers', noTrees: 'No grown trees in reach — waiting for the saplings', orderDone: 'Order filled — waiting for the next', waiting: 'Waiting' },
  recruits: 'recruits on their way',
  rearm: 'Re-arm',
  rearmed: 'Regiment re-armed',
  rearmingState: 're-arming',
  reinforce: 'Reinforce',
  reinforceTip: 'Fills the regiment to full strength: gold and arms for every new man, the men come from the town. They dilute its experience; a fallen captain is replaced by one of them.',
  reinforced: 'Regiment reinforced',
  reinforcingState: 'awaiting new men',
  ranks3: ['green', 'seasoned', 'veterans'],
  rankTip: 'Experience grows with every enemy brought down: seasoned men and veterans fight better, shoot straighter and are harder to break.',
  captain: 'captain',
  noCaptain: 'no captain',
  captainFell: 'A regiment\'s captain has fallen',
  promoted: 'A regiment has gained experience',
  unpaid: 'No gold for pay: the army loses heart',
  paid: 'Pay is being met again',
  payTip: 'pay',
  atKeep: 'at the keep, no barracks needed',
  wall: 'Wall',
  wallAbout: 'A stone wall drawn from point to point. It stops everyone; the enemy batters it down, engines faster. Your men pass through its gates.',
  hintWallStart: 'Wall: point at the start. Right button / Esc: done.',
  hintWallEnd: 'Wall: point at the end of the stretch.',
  gate: 'Gate',
  gateAbout: 'A gate in your wall (6 m): your people and soldiers pass through it; to the enemy it is wall, and stronger. Click your own wall.',
  hintGate: 'Gate: click your own wall. Right button / Esc: done.',
  garrison: 'Garrison',
  ungarrison: 'Bring the garrison out',
  garrisoned: 'Shooters have manned the tower',
  wallBroken: 'The wall is breached!',
  points: { mine: 'Rich mine', quarry: 'Field quarry', village: 'Village' },
  pointAbout: 'stand a regiment by it for 20 s with no enemy near and it pays',
  pointTaken: 'We took:',
  pointLost: 'The enemy took:',
  nobodys: 'no one\'s',
  taking: 'taking',
  hover: { stone: 'Stone outcrop — put a quarry beside it', ore: 'Iron ore — put a mine beside it', forest: 'Forest — a woodcutter at its edge', lake: 'Lake — a fisher on the bank', mountain: 'Mountains — impassable', crag: 'Crags — go round them', enemy: 'enemy', yours: 'yours' },
};

function pickLang(): Lang {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'pl' || asked === 'en') return asked;
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export const LANG: Lang = pickLang();
export const T: Strings = LANG === 'pl' ? pl : en;
