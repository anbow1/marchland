# Marchland — modele i animacje: co jest, czego szukamy

Aktualizowane przy każdej zmianie. Warunki dla każdego pliku: licencja **CC0** albo **CC BY**
(Sketchfab, Blendswap, Quaternius, KayKit, Poly Haven) lub animacje z **Mixamo** (pobierane przez
właściciela projektu; w repozytorium tylko przeliczone ruchy kości). Nie bierzemy modeli wyciągniętych
z gier ani modów (np. „… Mod” do Total War) ani cudzych postaci wrzuconych ponownie pod inną licencją.
Postać najlepiej **ze szkieletem humanoida Mixamo** (nazwy kości `mixamorig:*`), do ~20 tys. trójkątów
(i tak upraszczamy do 2–3 tys.), ze stopami na ziemi.

Jak assety trafiają do gry i jak są rysowane: `PLAYBOOK.md`. Formaty plików: `../asset-pack/FORMATS.md`.
Paczka wszystkich gotowych assetów do nowej gry: `node tools/pack-assets.mjs` (`../asset-pack/README.md`).

## Jest (w grze albo gotowe do użycia)

| Co | Źródło | Licencja | Gdzie |
|---|---|---|---|
| Rycerz w zbroi płytowej | „Rigged Knight in Armor”, Xali, Blendswap | CC0 | zapas: gdy brak postaci ze szkieletem (`public/soldiers/knight.json`) |
| Rycerz ciężki, szkielet Mixamo, ~9 tys. tr. | „knight for game project (old)”, Thost, Sketchfab | CC BY 4.0 | w grze: halabardnicy z halabardą (`halberdier.json`) |
| Wojownik w skórze/przeszywanicy, szkielet Mixamo | „.Fuse Warrior”, Leonardo Carvalho, Sketchfab | CC BY 4.0 | w grze: pikinierzy (`pikeman.json`) |
| Rycerz w płycie z płaszczem (bez szkieletu) | „Medieval knight”, 3dUVpro, Sketchfab | CC BY 4.0 | dowódca / jeździec |
| Koń w zbroi (bez szkieletu) | „Armored Horse”, naminoff, Sketchfab | CC BY 4.0 | zapas: gdy brak `warhorse.json` (`public/soldiers/horse.json`) |
| Paladin J Nordstrom (postać ze skórą, przy klipie „Stabbing”) | Mixamo | Mixamo | **w grze**: jeździec jazdy w siodle (`rider.json`, `rigged.py --seated`) |
| Jeździec i koń w zbroi (posąg, 120 tys. tr.) | „1964.88 Armor for Man and Horse”, Cleveland Museum of Art | CC0 | ciężka jazda po uproszczeniu |
| Zbroje Svend / Revna (szkielet Unreal) | ChamberSu1996, Sketchfab | CC BY 4.0 | sprawdzone; w grze ich tuniki (niżej) |
| Piechur napoleoński, szkielet Unreala, ~134 tys. tr. | „Infantry - rigged for UE4/5 - free download”, Andy woodhead, Sketchfab | CC BY 4.0 | **w grze**: piechota liniowa (`lineman.json`, płaszcz w barwie strony, muszkiet z bagnetem) i strzelcy (`rifleman.json`, spodnie w barwie strony, muszkiet) |
| Kirasjer szeregowy / sierżant (jeździec na koniu, bez szkieletu, ~130 tys. tr.) | „Private of the Order Cuirassier Regiment”, „Sergeant Cuirassier of the Grand Army”, 1812panorama, Sketchfab | CC0 | sprawdzone 27.11: statyczne, jeździec zrośnięty z koniem — do jeźdźca kirasjerów po wycięciu i ułożeniu w siodle |
| Piechur brytyjski spod Waterloo (bez szkieletu, poza A) | „Waterloo British Infantry - for animation”, Andy woodhead | CC BY 4.0 | sprawdzone: ten sam żołnierz co wersja ze szkieletem — niepotrzebny |
| Muszkieter elżbietański (bez szkieletu, w pozie celowania) | „Elizabethan Musketeer”, Binkley-Spacetrucker | CC BY 4.0 | sprawdzone: poza celowania, bez szkieletu — do muszkieterów po osadzeniu na szkielecie (Mixamo Auto-Rigger nie przyjmie pozy innej niż T/A) |
| Żołnierz Unii (figura na skale, 386 tys. tr.) | „American Union Army - Infantry - free”, Andy woodhead | CC BY 4.0 | sprawdzone: figura w ruchu z podstawą — nie do animacji |
| Zbroja husarska (skan muzealny), husarz na koniu (figura) | Wirtualne Muzea Małopolski | CC0 / CC BY 4.0 | sprawdzone: sama zbroja i figura z cokołem — wzór do huzarów, nie postać |
| Huzar napoleoński, szkielet Unreala, ~61 tys. tr. | „Hussar - rigged for UE4/5”, Andy woodhead, Sketchfab | CC BY 4.0 | **w grze**: jeździec huzarów (`hussar_rider.json`, `rigged.py --seated`, dolman w barwie strony) |
| Joannita (szkielet Unreala, klip rozmowy) | „Hospitaler Talking”, putns, Sketchfab | CC BY 4.0 | sprawdzony 27.11: do rycerzy / ciężkiej jazdy (krzyż zakonu zakryty barwą strony) |
| „Armor Set” | gimora | **CC BY-NC-SA** | odrzucony: licencja niekomercyjna |
| „Hafsid Horse General (Machiavello Mod)” | mylae | CC BY 4.0 | odrzucony: model z moda do gry |
| Żołnierz europejski XVII w. (poza A, bez szkieletu) | „European Soldier 17th Century”, haiphucpham221102, Sketchfab | CC BY 4.0 | **w grze**: muszkieterowie (`musketeer.json`; szkielet z `autorig.py`) |
| Żołnierz ok. 1700 r. (poza T, bez szkieletu) | „1700th-ish century Soldier”, Christoffer Eriksson | CC BY 4.0 | **w grze**: jeździec dragonów (`dragoon_rider.json`; `autorig.py`, `rigged.py --seated`) |
| Żołnierz Unii (poza A, bez szkieletu; karabin w osobnej siatce z oporządzeniem) | „Union soldier - free game asset”, Andy woodhead | CC BY 4.0 | w zapasie: gotowy do `autorig.py` |
| Artylerzysta 1815 (szkielet Unreala) | „Artillery crew 1815 - rigged for UE4/5”, Andy woodhead | CC BY 4.0 | w zapasie: obsługa dział |
| Działo polowe 1815 | „British field cannon - 1815”, Andy woodhead | CC BY 4.0 | **w grze**: armaty polowe i działa konne epoki 3 (`props/fieldgun.json`) |
| Husarz węgierski XV–XVI w. (figura na koniu, bez tekstur, 600 tys. tr.) | Ded Makar | CC BY 4.0 | odrzucony: figura bez tekstur |
| Kirasjer pułku głuchowskiego (figura stojąca, ręce wzdłuż ciała) | „Private soldier of the Glukhovsky cuirassier reg”, 1812panorama | CC BY 4.0 | **w grze**: jeździec kirasjerów (`cuirassier_rider.json`; `autorig.py` z rękami opuszczonymi, `rigged.py --seated`) |
| Oficer gwardii konnej, szeregowy gwardii litewskiej (figury stojące) | 1812panorama | CC BY 4.0 | w zapasie: do `autorig.py` (np. dragoni pieszo) |
| Hełmy: burgonet (XVI w.), zischägge (XVII w.) | ernst52, Sketchfab | CC BY 4.0 | w zapasie: hełm muszkieterów / kirasjerów zamiast kapelusza |
| „Hussar of Xth regiment” | rkgalery, Blendswap | **CC BY-SA 3.0** | odrzucony: licencja „na tych samych warunkach” (przyjmujemy CC0 i CC BY) |
| Animacje miecz i tarcza: cięcie, blok, postawa, marsz, bieg, trafienie, śmierć ×2 | Mixamo | Mixamo | w grze (miecznicy, halabardnicy) |
| Upward Thrust (pchnięcie) | Mixamo | Mixamo | w grze: cios halabardników |
| Bayonet Stab | Mixamo | Mixamo | w grze: cios pikinierów (oburącz z biodra) |
| Stabbing | Mixamo | Mixamo | w zapasie (dawny cios pikinierów, znad głowy) |
| Double Dagger Stab, Standing Aim Walk Forward/Right, Idle 1–2, Block (drugi) | Mixamo | Mixamo | w zapasie |

### Zasoby i towary (pobrane z GitHuba KayKit, CC0) — w grze

Deski, kamień, worek, beczka, skrzynia, kubeł strzał (Medieval Hexagon Pack), skrzynia bułek i szynki
(Restaurant Bits): niesione ładunki i stosy w obejściach (`public/props/goods/`). Do znalezienia:
ryby w koszu, winogrona w koszu, sztabki żelaza, ruda, zbroje/broń na stojaku, snopki zboża — w tym
samym stylu albo realistyczne CC0/CC BY.

### Dostarczone 16.11 — do wpięcia (licencje sprawdzone)

| Co | Źródło | Licencja | Plan |
|---|---|---|---|
| „.Fuse Civilian 2” (szkielet Mixamo) | Leonardo Carvalho, Sketchfab | CC BY 4.0 | **w grze**: łucznicy (`archer.json`), ludzie w mieście (`townsman.json`) |
| Longbow Aiming Pack (naciąganie, celowanie, chód z celowaniem ×4, idle) | Mixamo | Mixamo | **w grze**: naciąganie, odrzut, postawa łuczników |
| Walk With Rifle, Rifle Walk | Mixamo | Mixamo | **w grze**: Rifle Walk = marsz pikinierów |
| „Archer Shooting Arrow from Bow in Battle” (szkielet + animacja) | LasquetiSpice, Sketchfab | CC BY 4.0 | łucznik, porównanie |
| „Archer's clothes”, „English archer” | ArtLeaving / count_zero, Sketchfab | CC BY 4.0 | ubiór łucznika |
| „Peasant”, „Farmer”, „Medieval Villager Render”, „Medieval woman figure” (bez szkieletu) | jubabuba2512 / samsikua / Quatrilion / mikurban, Sketchfab | CC BY 4.0 | ludzie w mieście (po dopięciu szkieletu) |
| „Blacksmith” (szkielet, animacja pracy) | celestin.bitternose, Sketchfab | CC BY 4.0 | **w grze**: kowal przy hucie, kuźni, płatnerzu |
| „Blacksmith” (bez szkieletu) | XiaoBuBu80, Sketchfab | CC BY 4.0 | rzemieślnik |
| Wózek ręczny, 4 wozy | 3dAssetsForGames, AspectStudios, rakutin, NoodlePoodle, Cinnamine3D (Sketchfab) | CC BY 4.0 | **w grze**: taczka (poziom 2, 3dAssetsForGames), wóz (poziom 3, NoodlePoodle); reszta w zapasie |
| „Virtual model wool tunic & twintail & slim Revna”, „… wool tunic Svend”, „… linen tunic Svend” (szkielet Unreal) | ChamberSu1996, Sketchfab | CC BY 4.0 | **w grze**: mieszczanka (`townswoman.json`), mieszczanie (`townsman-wool.json`, `townsman-linen.json`), milicja z włócznią i małą tarczą (`militia.json`) |
| „.Fuse Woman 1” (szkielet Mixamo) | Leonardo Carvalho, Sketchfab | CC BY 4.0 | **w grze**: mieszczanka w sukience (`townswoman-dress.json`) |
| „Girl with clothes. Worker set” (szkielet z przedrostkiem `girlBone_`) | cattleya, Sketchfab | CC BY 4.0 | **w grze**: robotnica w lnie (`townswoman-worker.json`) |
| „.Fuse Civilian 1” (szkielet Mixamo) | Leonardo Carvalho, Sketchfab | CC BY 4.0 | **w grze**: mieszczanin z brodą (`townsman-beard.json`) |
| „Medieval Knight (Sculpture)” (szkielet Mixamo) | by__Rx, Sketchfab | CC BY 4.0 | **w grze**: miecznicy (`swordsman.json`) |
| „Hospitalier Knight” (szkielet Mixamo) | everlasting17th, Sketchfab | CC BY 4.0 | sprawdzony jako halabardnicy — **nie**: bez hełmu, białe nogawice, wygląda współcześnie |
| „Bandit Armor and Clothes” (szkielet MakeHuman) | wolkoed, Sketchfab | CC BY 4.0 | czeka: potrzebne mapowanie kości MakeHuman |
| „Medieval Civilian 3” | Leonardo Carvalho, Sketchfab | Sketchfab Standard | **nie**: licencja nie pozwala udostępniać siatki w repozytorium |
| „Parameswara Chronicles: Portugese Knight” | (Sketchfab) | „CC BY” | **nie**: ponowne wrzucenie postaci Paladin J Nordstrom z Mixamo — pobrana wprost z Mixamo, w grze jako jeździec |
| „Impact Sounds” (metal, zbroja, ciosy, upadki, skała) | Kenney (kenney.nl), przez github.com/Boyquotes | CC0 1.0 | **w grze**: odgłosy walki, trafień, kul i kruszonego muru (`public/sounds`, 18 plików MP3, 116 kB) |
| „Horse” (szkielet, chód, galop, postój, skubanie trawy) | MAXDESIGN-3D (Sketchfab) | CC BY 4.0 | **w grze**: konie jazdy, konie w stajni i konie zaprzężone do wozów (`warhorse.json`, `animalsView.ts`) |
| „Horse” (drugi: galop, postój, upadek; 70 kości bez nazw) | MAXDESIGN-3D (Sketchfab) | CC BY 4.0 | **w grze**: tylko upadek, przeniesiony na konia jazdy (`horsefall.py`) |
| „Medieval Castle” (mury z basztami, brama z barbakanem nad fosą, donżon na dużym dziedzińcu; 64 tys. tr., Draco + Meshopt) | Uğur Yakışık (Sketchfab) | CC BY 4.0 | **w grze**: donżon twierdzy w misji 5 kampanii, wycięty z modelu przy wczytaniu (`fortress_1.glb`, 30 tys. tr., 130 × 112 m; jego mury i wieże zastępują mury i wieże gry, które da się burzyć) |
| Armata, moździerz, kula | Lyskilde, ViktorKom, Uğur Yakışık (Sketchfab) | CC BY 4.0 | **w grze**: armata i moździerz (kula rysowana własna); obsługa to mieszczanie ze szkieletem |
| Kusza | iedalton, Sketchfab | CC BY 4.0 | broń kuszników |
| Świnia | iRahulRajput, Sketchfab | CC BY 4.0 | **w grze**: świnie chodzące po zagrodzie chlewni (`animalsView.ts`) |
| Medieval Gatehouse, Medieval castle (wieża), Saxon warrior | Daniel74 i in., Blendswap | CC0 | w zapasie: brama i wieża bez tekstur (do pomalowania skanem kamienia), wojownik bez szkieletu |

Odrzucone: „Hafsid Horse General (Machiavello Mod)” (z moda do gry komercyjnej), „Knight Face Reval”
(postać Paladin z Mixamo wrzucona ponownie przez kogoś innego), „Knight medieval no textures”
(zostaje w zapasie: bez szkieletu, 38 tys. tr.).

## Szukamy — lista dla właściciela projektu

Stan na 17.11: wszystko, co niezbędne, już jest w grze — żołnierze każdego rodzaju, ludzie w mieście (mężczyźni
i kobieta), koń z chodem i galopem, jeździec, budynki, wozy, działa. Zostały rzeczy **opcjonalne**:

1. ~~Upadek konia~~ — jest (drugi koń MAXDESIGN-3D, przeniesiony).
2. ~~Druga kobieta w innym stroju~~ — są dwie (.Fuse Woman 1, Girl with clothes. Worker set).
3. ~~Pchnięcie oburącz z biodra dla pikinierów~~ — jest (Bayonet Stab).
4. Towary do obejść w stylu KayKit: ryby w koszu, winogrona w koszu, sztabki żelaza, ruda, snopki zboża.

5. **Epoki 2 i 3** (zasady już w grze, wygląd zastępczy): muszkieter, kirasjer, dragon, piechota liniowa,
   strzelec, huzar z animacjami; broń i tarcze (mała tarcza pikiniera, długa pika i duża tarcza halabardnika,
   kopia, muszkiet, szabla); budynki: rusznikarnia, prochownia, katedra, ratusz, manufaktura i domy w wyglądzie
   epok; kłus konia. Pełna lista z wymaganiami: [AGES.md §4](AGES.md).

Animacje z Mixamo: FBX, **Without Skin** (albo ze skórą, jeśli chodzi też o postać), 30 kl./s, przy ruchu
zaznaczone **In Place**.

### Dostarczone 16.11 wieczorem — do sprawdzenia
„bar patrons outfits”, „5 piece scalemail armor (metahuman rigged)”, „medieval clothing free”: ubrania
i zbroja do dopasowania na szkielet (MetaHuman to inny szkielet niż Mixamo) — w kolejce.

### Sprawdzone 16.11, nie do użycia od ręki
- „Horse Rigged (Game Ready)” (abhayexe, CC BY 4.0): szkielet Biped, ale jedna 60-sekundowa ścieżka
  sklejona z pojedynczych ruchów (stanie, kilka kroków różnej długości, zryw, upadek, stanie dęba) —
  bez zapętlonego chodu, kłusu ani galopu. Potrzebny koń z osobnymi pętlami (np. CC0 „Ultimate Animated
  Animal Pack” Quaterniusa: Walk, Gallop, Idle).
- „Medieval woman figure” (oba pliki, mikurban, CC BY 4.0): bez szkieletu. Potrzebna kobieta ze
  szkieletem Mixamo (np. z serii .Fuse albo z samego Mixamo).

### Zrealizowane z dawnej listy
Chłopi i rzemieślnicy (.Fuse Civilian 1–2, Svend, Revna, kowal), łucznik, pikinier i kusznik (.Fuse),
koń ze szkieletem i pętlami (MAXDESIGN-3D), wozy (NoodlePoodle, 3dAssetsForGames), działa (Lyskilde,
ViktorKom), jazda bez klipu jazdy (jeździec kołysze się w takt konia).

## Spis plików w grze (`public/`)

Stan z 18.11, ze wszystkimi klipami. Źródło każdego pliku: tabela wyżej i `public/*/CREDITS.md`; tekstury
powierzchni: `src/assets/photo/LICENSE.md` (18 skanów Poly Haven, CC0; w grze jako KTX2 w `public/surfaces/`,
robione z nich przez `tools/encode_surfaces.mjs`).

| Plik | Rodzaj | Trójkąty | Kości | Klipy (klatki) |
|---|---|---|---|---|
| `people/smith.json` | szkielet | 2994 | 40 | work (193) |
| `people/townsman-beard.json` | szkielet | 1643 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townsman-linen.json` | szkielet | 1646 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townsman-wool.json` | szkielet | 1647 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townsman.json` | szkielet | 1244 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townswoman-dress.json` | szkielet | 1645 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townswoman-worker.json` | szkielet | 1641 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `people/townswoman.json` | szkielet | 1645 | 24 | boxwalk (19), boxidle (95), walk (16), idle (77), pickup (144), putdown (156), digging (73), fishing (132), chop (19), swing (79), harvest (37) |
| `props/cannon.json` | bryła (prop) | 1494 | — | — |
| `props/goods/arrows.json` | bryła (prop) | 260 | — | — |
| `props/goods/barrel.json` | bryła (prop) | 240 | — | — |
| `props/goods/bread.json` | bryła (prop) | 400 | — | — |
| `props/goods/crate.json` | bryła (prop) | 132 | — | — |
| `props/goods/lumber.json` | bryła (prop) | 220 | — | — |
| `props/goods/meat.json` | bryła (prop) | 400 | — | — |
| `props/goods/sack.json` | bryła (prop) | 92 | — | — |
| `props/goods/stone.json` | bryła (prop) | 220 | — | — |
| `props/handcart.json` | bryła (prop) | 522 | — | — |
| `props/mortar.json` | bryła (prop) | 1185 | — | — |
| `props/pig.json` | bryła (prop) | 320 | — | — |
| `props/wagon.json` | bryła (prop) | 1200 | — | — |
| `soldiers/archer.json` | szkielet | 3477 | 24 | recoil (22), draw (31), block_1 (18), idle (154), walk (32), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/crossbowman.json` | szkielet | 3443 | 24 | recoil (36), draw (27), block_1 (18), idle (154), walk (40), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/lineman.json` | szkielet | 3453 | 24 | recoil (36), draw (27), block_1 (18), idle (227), walk (40), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/rifleman.json` | szkielet | 3441 | 24 | jak wyżej |
| `soldiers/halberdier.json` | szkielet | 3449 | 24 | upward_thrust (71), chop (37), greatslash (56), block_1 (18), idle (227), walk (34), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/horse.json` | koń bez szkieletu (części) | 3591 | — | — |
| `soldiers/knight.json` | ciało z częściami (limbs) | 3189 | — | jedna poza |
| `soldiers/militia.json` | szkielet | 1683 | 24 | stab (99), block_1 (18), idle (227), walk (40), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/pikeman.json` | szkielet | 3551 | 24 | stab (99), block_1 (18), idle (227), walk (40), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/rider.json` | ciało z częściami (limbs) | 3199 | — | jedna poza |
| `soldiers/swordsman.json` | szkielet | 3523 | 24 | slash (46), block_1 (18), idle (227), walk (34), run (22), impact (22), death (118), death_1 (70) |
| `soldiers/warhorse.json` | szkielet + siodło | 2999 | 40 | idle (62), walk (33), gallop (16), graze (151), fall (25) |

| Budynek (`buildings/<nazwa>_<poziom>.glb`) | Poziomy | Trójkąty |
|---|---|---|
| `armourer` | 1, 2, 3 | 4690 / 4858 / 4858 |
| `bakery` | 1, 2, 3 | 8220 / 8828 / 8916 |
| `barracks` | 1, 2, 3 | 4768 / 4944 / 4944 |
| `butcher` | 1, 2, 3 | 3748 / 3924 / 3968 |
| `farm` | 1, 2, 3 | 3036 / 3152 / 3152 |
| `fisher` | 1, 2, 3 | 2612 / 3432 / 4252 |
| `fletcher` | 1, 2, 3 | 3484 / 3512 / 3540 |
| `fortress` | 1 | 29999 |
| `house` | 1, 2, 3 | 4936 / 5368 / 8124 |
| `ironMine` | 1, 2, 3 | 2628 / 2788 / 2788 |
| `keep` | 1 | 21790 |
| `pigFarm` | 1, 2, 3 | 756 / 756 / 756 |
| `quarry` | 1, 2, 3 | 1764 / 1896 / 2028 |
| `smelter` | 1, 2, 3 | 2132 / 2168 / 2168 |
| `smithy` | 1, 2, 3 | 2566 / 11991 / 11991 |
| `stable` | 1, 2, 3 | 952 / 952 / 952 |
| `tannery` | 1, 2, 3 | 1460 / 1644 / 1644 |
| `tower` | 1, 2, 3 | 6620 / 6700 / 7016 |
| `vineyard` | 1, 2, 3 | 1764 / 1820 / 1876 |
| `windmill` | 1, 2, 3 | 4788 / 4876 / 4964 |
| `winery` | 1, 2, 3 | 2740 / 3012 / 3012 |
| `woodcutter` | 1, 2, 3 | 2900 / 3140 / 3392 |
| `wall.glb`, `gate.glb` | — | odcinek muru 2 m, brama z dwoma skrzydłami |
