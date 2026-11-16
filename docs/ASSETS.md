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
| Rycerz w zbroi płytowej (miecznicy, halabardnicy) | „Rigged Knight in Armor”, Xali, Blendswap | CC0 | w grze (`public/soldiers/knight.json`) |
| Rycerz ciężki, szkielet Mixamo, ~9 tys. tr. | „knight for game project (old)”, Thost, Sketchfab | CC BY 4.0 | w grze: miecznicy (`swordsman.json`) i halabardnicy z halabardą (`halberdier.json`) |
| Wojownik w skórze/przeszywanicy, szkielet Mixamo | „.Fuse Warrior”, Leonardo Carvalho, Sketchfab | CC BY 4.0 | w grze: pikinierzy (`pikeman.json`) |
| Rycerz w płycie z płaszczem (bez szkieletu) | „Medieval knight”, 3dUVpro, Sketchfab | CC BY 4.0 | dowódca / jeździec |
| Koń w zbroi (bez szkieletu) | „Armored Horse”, naminoff, Sketchfab | CC BY 4.0 | w grze: jazda (`public/soldiers/horse.json`), jeździec to rycerz Xali w siodle (`rider.json`) |
| Jeździec i koń w zbroi (posąg, 120 tys. tr.) | „1964.88 Armor for Man and Horse”, Cleveland Museum of Art | CC0 | ciężka jazda po uproszczeniu |
| Zbroje Svend / Revna (szkielet Unreal) | ChamberSu1996, Sketchfab | CC BY 4.0 | do sprawdzenia |
| Animacje miecz i tarcza: cięcie, blok, postawa, marsz, bieg, trafienie, śmierć ×2 | Mixamo | Mixamo | w grze (miecznicy, halabardnicy) |
| Upward Thrust (pchnięcie) | Mixamo | Mixamo | w grze: cios halabardników |
| Stabbing, Double Dagger Stab, Standing Aim Walk Forward/Right, Idle 1–2, Block (drugi) | Mixamo | Mixamo | w zapasie (pikinierzy, łucznicy) |

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
| „Horse” (szkielet, chód, galop, postój, skubanie trawy) | MAXDESIGN-3D (Sketchfab) | CC BY 4.0 | **w grze**: konie jazdy (`warhorse.json`) |
| Armata, moździerz, kula | Lyskilde, ViktorKom, Uğur Yakışık (Sketchfab) | CC BY 4.0 | **w grze**: armata i moździerz (kula rysowana własna); obsługa to mieszczanie ze szkieletem |
| Kusza | iedalton, Sketchfab | CC BY 4.0 | broń kuszników |
| Świnia | iRahulRajput, Sketchfab | CC BY 4.0 | **w grze**: świnie w chlewni |
| Medieval Gatehouse, Medieval castle (wieża), Saxon warrior | Daniel74 i in., Blendswap | CC0 | w zapasie: brama i wieża bez tekstur (do pomalowania skanem kamienia), wojownik bez szkieletu |

Odrzucone: „Hafsid Horse General (Machiavello Mod)” (z moda do gry komercyjnej), „Knight Face Reval”
(postać Paladin z Mixamo wrzucona ponownie przez kogoś innego), „Knight medieval no textures”
(zostaje w zapasie: bez szkieletu, 38 tys. tr.).

## Szukamy — lista dla właściciela projektu

### Animacje (Mixamo: FBX, **Without Skin**, 30 kl./s, przy ruchu zaznaczyć **In Place**)

Wspólne dla żołnierzy:
1.–5. ~~Idle, Walk, Run, Death ×2, Impact (miecz i tarcza)~~ — są, w grze

Broń drzewcowa (pikinierzy, halabardnicy, milicja):
6. ~~Pchnięcie~~ — jest (Upward Thrust); przydałoby się jeszcze pchnięcie oburącz z biodra (pikinierzy)
7. Spear Walk albo Rifle Walk / Two-handed Walk (marsz z drzewcem)

Łucznicy i kusznicy:
8. Standing Draw Arrow, Standing Aim Recoil (łuk)
9. ~~Rifle Down To Aim~~ — jest, w grze (kusznicy); przydałby się jeszcze strzał z odrzutem („Shooting”)

Tragarze, rzemieślnicy, rolnicy (ludzie w mieście):
10. ~~Box Walk, Box Idle, Walking~~ — są, w grze
11. ~~Pick Up / Put Down~~ — są, w grze
12. ~~Digging~~, ~~Fishing Cast~~, ~~Great Sword Attack (rąbanie), Heavy Weapon Swing (młot)~~ — są, w grze; ~~Harvesting~~ — jest, w grze

Jazda:
13. Horse Riding (jeździec w siodle) — jeśli Mixamo ma; inaczej poza siedząca

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

### Postacie (ze szkieletem Mixamo, CC0/CC BY)
14. Chłop / chłopka (tunika, kaptur, fartuch) — tragarze, rolnicy
15. Rzemieślnik (kowal w fartuchu, cieśla) — może być ten sam chłop z innym ubraniem
16. Łucznik w kapturze i przeszywanicy
17. Pikinier / włócznik w kolczudze lub skórze, z hełmem (kapalin, łebka)
18. Kusznik (przeszywanica, hełm)

### Konie i machiny
19. Koń ze szkieletem i animacjami chodu/kłusu/galopu (CC0/CC BY) — najlepiej; bez szkieletu też się przyda
20. Wóz konny / wózek ręczny (transport poziom 2–3)
21. Działo / bombarda (jeśli wchodzą armaty zamiast balist)
