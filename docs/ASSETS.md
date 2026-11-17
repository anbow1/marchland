# Marchland — modele i animacje: co jest, czego szukamy

Aktualizowane przy każdej zmianie. Warunki dla każdego pliku: licencja **CC0** albo **CC BY**
(Sketchfab, Blendswap, Quaternius, KayKit, Poly Haven) lub animacje z **Mixamo** (pobierane przez
właściciela projektu; w repozytorium tylko przeliczone ruchy kości). Nie bierzemy modeli wyciągniętych
z gier ani modów (np. „… Mod” do Total War) ani cudzych postaci wrzuconych ponownie pod inną licencją.
Postać najlepiej **ze szkieletem humanoida Mixamo** (nazwy kości `mixamorig:*`), do ~20 tys. trójkątów
(i tak upraszczamy do 2–3 tys.), ze stopami na ziemi.

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
| „Virtual model wool tunic & twintail & slim Revna”, „… wool tunic Svend”, „… linen tunic Svend” (szkielet Unreal) | ChamberSu1996, Sketchfab | CC BY 4.0 | **w grze**: mieszczanka (`townswoman.json`), mieszczanie (`townsman-wool.json`, `townsman-linen.json`) |
| „.Fuse Civilian 1” (szkielet Mixamo) | Leonardo Carvalho, Sketchfab | CC BY 4.0 | **w grze**: mieszczanin z brodą (`townsman-beard.json`) |
| „Medieval Knight (Sculpture)” (szkielet Mixamo) | by__Rx, Sketchfab | CC BY 4.0 | **w grze**: miecznicy (`swordsman.json`) |
| „Hospitalier Knight” (szkielet Mixamo) | everlasting17th, Sketchfab | CC BY 4.0 | sprawdzony jako halabardnicy — **nie**: bez hełmu, białe nogawice, wygląda współcześnie |
| „Bandit Armor and Clothes” (szkielet MakeHuman) | wolkoed, Sketchfab | CC BY 4.0 | czeka: potrzebne mapowanie kości MakeHuman |
| „Medieval Civilian 3” | Leonardo Carvalho, Sketchfab | Sketchfab Standard | **nie**: licencja nie pozwala udostępniać siatki w repozytorium |
| „Parameswara Chronicles: Portugese Knight” | (Sketchfab) | „CC BY” | **nie**: ponowne wrzucenie postaci Paladin J Nordstrom z Mixamo — pobrana wprost z Mixamo, w grze jako jeździec |
| „Horse” (szkielet, chód, galop, postój, skubanie trawy) | MAXDESIGN-3D (Sketchfab) | CC BY 4.0 | **w grze**: konie jazdy (`warhorse.json`) |
| „Horse” (drugi: galop, postój, upadek; 70 kości bez nazw) | MAXDESIGN-3D (Sketchfab) | CC BY 4.0 | **w grze**: tylko upadek, przeniesiony na konia jazdy (`horsefall.py`) |
| Armata, moździerz, kula | Lyskilde, ViktorKom, Uğur Yakışık (Sketchfab) | CC BY 4.0 | **w grze**: armata i moździerz (kula rysowana własna); obsługa to mieszczanie ze szkieletem |
| Kusza | iedalton, Sketchfab | CC BY 4.0 | broń kuszników |
| Świnia | iRahulRajput, Sketchfab | CC BY 4.0 | **w grze**: świnie w chlewni |
| Medieval Gatehouse, Medieval castle (wieża), Saxon warrior | Daniel74 i in., Blendswap | CC0 | w zapasie: brama i wieża bez tekstur (do pomalowania skanem kamienia), wojownik bez szkieletu |

Odrzucone: „Hafsid Horse General (Machiavello Mod)” (z moda do gry komercyjnej), „Knight Face Reval”
(postać Paladin z Mixamo wrzucona ponownie przez kogoś innego), „Knight medieval no textures”
(zostaje w zapasie: bez szkieletu, 38 tys. tr.).

## Szukamy — lista dla właściciela projektu

Stan na 17.11: wszystko, co niezbędne, już jest w grze — żołnierze każdego rodzaju, ludzie w mieście (mężczyźni
i kobieta), koń z chodem i galopem, jeździec, budynki, wozy, działa. Zostały rzeczy **opcjonalne**:

1. ~~Upadek konia~~ — jest (drugi koń MAXDESIGN-3D, przeniesiony).
2. **Druga kobieta w innym stroju** (szkielet Mixamo albo Unreal, CC0/CC BY) — dziś wszystkie mieszczanki to
   jedna postać.
3. ~~Pchnięcie oburącz z biodra dla pikinierów~~ — jest (Bayonet Stab).
4. Towary do obejść w stylu KayKit: ryby w koszu, winogrona w koszu, sztabki żelaza, ruda, snopki zboża.

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

