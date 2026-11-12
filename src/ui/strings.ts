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
  play: string;
  resume: string;
  restart: string;
  paused: string;
  quality: string;
  qualityHigh: string;
  qualityLow: string;
  difficultyLabel: string;
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
  pause: string;
  unpause: string;
  recruit: string;
  queue: string;
  halt: string;
  selectAll: string;
  men: string;
  morale: string;
  fatigue: string;
  emptyPlot: string;
  underConstruction: string;
  working: string;
  waiting: string;
  pausedBuilding: string;
  maxLevel: string;
  needsBarracksLevel: string;
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
  helpTitle: string;
  menu: string;
  speed: string;
  makes: string;
  from: string;
  taxes: string;
  rations: string;
  trains: string;
}

const pl: Strings = {
  title: 'Marchland',
  subtitle: 'Średniowieczna strategia: miasto, szyki, bitwa',
  resources: { gold: 'Złoto', wood: 'Drewno', stone: 'Kamień', grain: 'Zboże', bread: 'Chleb', meat: 'Mięso', sausage: 'Kiełbasy', hide: 'Skóry', leatherArmor: 'Zbroje sk.', ironOre: 'Ruda', weapon: 'Broń', mailArmor: 'Kolczugi', bow: 'Łuki', horse: 'Konie' },
  buildings: {
    house: { name: 'Chata', about: 'Mieszkańcy płacą podatek w złocie, o ile miasto ma co jeść.' },
    woodcutter: { name: 'Drwal', about: 'Drewno na budowę, do kuźni i dla łuczarza.' },
    quarry: { name: 'Kamieniołom', about: 'Kamień na murowane budynki.' },
    farm: { name: 'Pole', about: 'Zboże: na chleb, dla trzody i dla koni.' },
    bakery: { name: 'Piekarnia', about: 'Piecze chleb ze zboża. Bochenek to jedna racja.' },
    pigFarm: { name: 'Chlewnia', about: 'Trzoda zjada zboże, daje mięso i skóry.' },
    butcher: { name: 'Masarnia', about: 'Robi kiełbasy z mięsa. Kiełbasa to dwie racje.' },
    tannery: { name: 'Garbarnia', about: 'Szyje ze skór zbroje dla pikinierów, strzelców i lekkiej jazdy.' },
    ironMine: { name: 'Kopalnia', about: 'Ruda żelaza dla kuźni i płatnerza.' },
    smithy: { name: 'Kuźnia', about: 'Kuje broń z rudy, pali drewnem.' },
    armourer: { name: 'Płatnerz', about: 'Kolczugi dla mieczników, halabardników i rycerstwa.' },
    fletcher: { name: 'Łuczarz', about: 'Łuki i kusze z drewna.' },
    stable: { name: 'Stajnia', about: 'Hoduje konie; karmi je zbożem.' },
    barracks: { name: 'Koszary', about: 'Szkolą wojsko. Wyższy poziom to lepsze oddziały.' },
  },
  units: {
    militia: { name: 'Milicja', about: 'Mieszczanie z tarczą i włócznią. Tani, pod tarczą trzymają się nieźle, szybko uciekają.' },
    pikemen: { name: 'Pikinierzy', about: 'Las pik. Stojąc w szyku, zatrzymują szarżę jazdy; bez tarcz giną od strzał.' },
    archers: { name: 'Łucznicy', about: 'Strzelają na 80 m. W zwarciu giną.' },
    swordsmen: { name: 'Miecznicy', about: 'Miecz, tarcza i kolczuga: wygrywają prostą walkę piechoty.' },
    halberdiers: { name: 'Halabardnicy', about: 'Biją mocniej niż miecznicy i zatrzymują konie, ale nie mają tarcz.' },
    crossbowmen: { name: 'Kusznicy', about: 'Wolno napinają, strzelają płasko na 70 m; bełt przebija kolczugę.' },
    lightCavalry: { name: 'Lekka jazda', about: 'Szybka. Na łuczników, machiny i w pościg; nie na piki.' },
    heavyCavalry: { name: 'Ciężka jazda', about: 'Rycerstwo. Szarża, która łamie szyk.' },
    ballista: { name: 'Balisty', about: 'Dwie machiny. Bełt na 110 m przebija każdą zbroję; z bliska bezbronne.' },
    trebuchet: { name: 'Trebusz', about: 'Miota kamienie na 135 m: rozbija szyk i burzy mury. Nie strzela bliżej niż 35 m.' },
  },
  results: {
    cannotAfford: 'Za mało zasobów.',
    plotTaken: 'Działka jest zajęta.',
    plotEmpty: 'Tu nic nie stoi.',
    maxLevel: 'To już najwyższy poziom.',
    underConstruction: 'Budowa jeszcze trwa.',
    needsBarracks: 'Potrzebne koszary wyższego poziomu.',
    armyFull: 'Armia w komplecie: 100 ludzi.',
    queueFull: 'Kolejka werbunku jest pełna.',
    noSuchRegiment: 'Nie ma takiego oddziału.',
    routing: 'Ten oddział ucieka i nie słucha rozkazów.',
    gameOver: 'Gra skończona.',
  },
  difficulty: { easy: 'Łatwy', normal: 'Normalny', hard: 'Trudny' },
  keep: 'Zamek',
  play: 'Graj',
  resume: 'Wróć do gry',
  restart: 'Nowa gra',
  paused: 'Pauza',
  quality: 'Grafika',
  qualityHigh: 'Wysoka',
  qualityLow: 'Niska',
  difficultyLabel: 'Przeciwnik',
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
  pause: 'Wstrzymaj',
  unpause: 'Wznów',
  recruit: 'Werbunek',
  queue: 'W szkoleniu',
  halt: 'Stój (H)',
  selectAll: 'Całe wojsko (Ctrl+A)',
  men: 'ludzi',
  morale: 'Morale',
  fatigue: 'Zmęczenie',
  emptyPlot: 'Wolna działka',
  underConstruction: 'Budowa',
  working: 'Pracuje',
  waiting: 'Czeka na surowiec',
  pausedBuilding: 'Wstrzymany',
  maxLevel: 'Najwyższy poziom',
  needsBarracksLevel: 'koszary poz.',
  hintIdle: 'Kliknij działkę w mieście, żeby budować. Kliknij oddział, żeby wydać rozkaz.',
  hintArmy: 'Prawy przycisk: marsz. Dwa kliknięcia: bieg. Przeciągnij: ustaw front. Na wroga: atak.',
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
    'Kółko myszy: zoom · Q / E: obrót · środkowy przycisk: przeciąganie mapy',
    'Lewy przycisk: zaznacz · przeciągnij: ramka · Shift: dodaj',
    'Prawy przycisk: marsz / atak · dwa kliknięcia: bieg · przeciągnij: front',
    'H: stój · Ctrl+A: całe wojsko · Esc: odznacz / pauza · F3: pomiar',
    'Dotyk: palec przesuwa, dwa palce przybliżają, stuknięcie zaznacza i rozkazuje',
  ],
  menu: 'Menu',
  speed: 'Tempo',
  makes: 'daje',
  from: 'z',
  taxes: 'podatek',
  rations: 'racji/min',
  trains: 'Szkoli',
};

const en: Strings = {
  title: 'Marchland',
  subtitle: 'Medieval strategy: a town, formations, a battle',
  resources: { gold: 'Gold', wood: 'Wood', stone: 'Stone', grain: 'Grain', bread: 'Bread', meat: 'Meat', sausage: 'Sausages', hide: 'Hides', leatherArmor: 'Leather', ironOre: 'Ore', weapon: 'Weapons', mailArmor: 'Mail', bow: 'Bows', horse: 'Horses' },
  buildings: {
    house: { name: 'House', about: 'Townsfolk pay tax in gold, as long as the town has food.' },
    woodcutter: { name: 'Woodcutter', about: 'Wood for building, for the smithy and the fletcher.' },
    quarry: { name: 'Quarry', about: 'Stone for masonry buildings.' },
    farm: { name: 'Field', about: 'Grain: for bread, for pigs and for horses.' },
    bakery: { name: 'Bakery', about: 'Bakes bread from grain. A loaf is one ration.' },
    pigFarm: { name: 'Pig farm', about: 'Pigs eat grain and give meat and hides.' },
    butcher: { name: 'Butcher', about: 'Makes sausages from meat. A sausage is two rations.' },
    tannery: { name: 'Tannery', about: 'Turns hides into armour for pikemen, shooters and light cavalry.' },
    ironMine: { name: 'Iron mine', about: 'Ore for the smithy and the armourer.' },
    smithy: { name: 'Smithy', about: 'Forges weapons from ore, burning wood.' },
    armourer: { name: 'Armourer', about: 'Mail for swordsmen, halberdiers and knights.' },
    fletcher: { name: 'Fletcher', about: 'Bows and crossbows from wood.' },
    stable: { name: 'Stable', about: 'Breeds horses on grain.' },
    barracks: { name: 'Barracks', about: 'Trains soldiers. A higher level trains better ones.' },
  },
  units: {
    militia: { name: 'Militia', about: 'Townsmen with shield and spear. Cheap, steady behind the shield, quick to run.' },
    pikemen: { name: 'Pikemen', about: 'A hedge of pikes. Standing in formation they stop a cavalry charge; with no shields they die to arrows.' },
    archers: { name: 'Archers', about: 'Shoot to 80 m. Die in melee.' },
    swordsmen: { name: 'Swordsmen', about: 'Sword, shield and mail: they win a straight fight on foot.' },
    halberdiers: { name: 'Halberdiers', about: 'Hit harder than swordsmen and stop horses, but carry no shield.' },
    crossbowmen: { name: 'Crossbowmen', about: 'Slow to span, flat-shooting to 70 m; a bolt goes through mail.' },
    lightCavalry: { name: 'Light cavalry', about: 'Fast. For archers, engines and pursuit; not for pikes.' },
    heavyCavalry: { name: 'Heavy cavalry', about: 'Knights. A charge that breaks a line.' },
    ballista: { name: 'Ballistae', about: 'Two engines. A bolt to 110 m goes through any armour; helpless up close.' },
    trebuchet: { name: 'Trebuchet', about: 'Hurls stones to 135 m: scatters a formation and brings down walls. Cannot shoot closer than 35 m.' },
  },
  results: {
    cannotAfford: 'Not enough resources.',
    plotTaken: 'The plot is taken.',
    plotEmpty: 'Nothing stands here.',
    maxLevel: 'Already at the highest level.',
    underConstruction: 'Still under construction.',
    needsBarracks: 'Needs a barracks of a higher level.',
    armyFull: 'The army is full: 100 men.',
    queueFull: 'The recruiting queue is full.',
    noSuchRegiment: 'No such regiment.',
    routing: 'That regiment is running and takes no orders.',
    gameOver: 'The game is over.',
  },
  difficulty: { easy: 'Easy', normal: 'Normal', hard: 'Hard' },
  keep: 'Keep',
  play: 'Play',
  resume: 'Back to the game',
  restart: 'New game',
  paused: 'Paused',
  quality: 'Graphics',
  qualityHigh: 'High',
  qualityLow: 'Low',
  difficultyLabel: 'Opponent',
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
  pause: 'Pause',
  unpause: 'Resume',
  recruit: 'Recruit',
  queue: 'In training',
  halt: 'Halt (H)',
  selectAll: 'Whole army (Ctrl+A)',
  men: 'men',
  morale: 'Morale',
  fatigue: 'Fatigue',
  emptyPlot: 'Empty plot',
  underConstruction: 'Building',
  working: 'Working',
  waiting: 'Waiting for input',
  pausedBuilding: 'Paused',
  maxLevel: 'Highest level',
  needsBarracksLevel: 'barracks lvl',
  hintIdle: 'Click a plot in the town to build. Click a regiment to give orders.',
  hintArmy: 'Right button: march. Double click: run. Drag: set the front. On an enemy: attack.',
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
    'Mouse wheel: zoom · Q / E: turn · middle button: drag the map',
    'Left button: select · drag: box · Shift: add',
    'Right button: march / attack · double click: run · drag: set the front',
    'H: halt · Ctrl+A: whole army · Esc: deselect / pause · F3: measurements',
    'Touch: one finger moves, two fingers zoom, a tap selects and orders',
  ],
  menu: 'Menu',
  speed: 'Speed',
  makes: 'makes',
  from: 'from',
  taxes: 'tax',
  rations: 'rations/min',
  trains: 'Trains',
};

function pickLang(): Lang {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'pl' || asked === 'en') return asked;
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export const LANG: Lang = pickLang();
export const T: Strings = LANG === 'pl' ? pl : en;
