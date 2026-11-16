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
| Wojownik w skórze/przeszywanicy, szkielet Mixamo | „.Fuse Warrior”, Leonardo Carvalho, Sketchfab | CC BY 4.0 | do wpięcia (lekka piechota) |
| Rycerz w płycie z płaszczem (bez szkieletu) | „Medieval knight”, 3dUVpro, Sketchfab | CC BY 4.0 | dowódca / jeździec |
| Koń w zbroi (bez szkieletu) | „Armored Horse”, naminoff, Sketchfab | CC BY 4.0 | w grze: jazda (`public/soldiers/horse.json`), jeździec to rycerz Xali w siodle (`rider.json`) |
| Jeździec i koń w zbroi (posąg, 120 tys. tr.) | „1964.88 Armor for Man and Horse”, Cleveland Museum of Art | CC0 | ciężka jazda po uproszczeniu |
| Zbroje Svend / Revna (szkielet Unreal) | ChamberSu1996, Sketchfab | CC BY 4.0 | do sprawdzenia |
| Animacje miecz i tarcza: cięcie, blok, postawa, marsz, bieg, trafienie, śmierć ×2 | Mixamo | Mixamo | w grze (miecznicy, halabardnicy) |
| Upward Thrust (pchnięcie) | Mixamo | Mixamo | w grze: cios halabardników |
| Stabbing, Double Dagger Stab, Standing Aim Walk Forward/Right, Idle 1–2, Block (drugi) | Mixamo | Mixamo | w zapasie (pikinierzy, łucznicy) |

### Dostarczone 16.11 — do wpięcia (licencje sprawdzone)

| Co | Źródło | Licencja | Plan |
|---|---|---|---|
| „.Fuse Civilian 2” (szkielet Mixamo) | Leonardo Carvalho, Sketchfab | CC BY 4.0 | łucznicy / kusznicy, tragarze |
| Longbow Aiming Pack (naciąganie, celowanie, chód z celowaniem ×4, idle) | Mixamo | Mixamo | łucznicy |
| Walk With Rifle, Rifle Walk | Mixamo | Mixamo | marsz z drzewcem (pikinierzy) |
| „Archer Shooting Arrow from Bow in Battle” (szkielet + animacja) | LasquetiSpice, Sketchfab | CC BY 4.0 | łucznik, porównanie |
| „Archer's clothes”, „English archer” | ArtLeaving / count_zero, Sketchfab | CC BY 4.0 | ubiór łucznika |
| „Peasant”, „Farmer”, „Medieval Villager Render”, „Medieval woman figure” (bez szkieletu) | jubabuba2512 / samsikua / Quatrilion / mikurban, Sketchfab | CC BY 4.0 | ludzie w mieście (po dopięciu szkieletu) |
| „Blacksmith” (szkielet, animacja pracy) | celestin.bitternose, Sketchfab | CC BY 4.0 | kowal przy kuźni |
| „Blacksmith” (bez szkieletu) | XiaoBuBu80, Sketchfab | CC BY 4.0 | rzemieślnik |
| Wózek ręczny, 4 wozy | 3dAssetsForGames, AspectStudios, rakutin, NoodlePoodle, Cinnamine3D (Sketchfab) | CC BY 4.0 | transport poziom 2–3 |
| Armata, moździerz, kula | Lyskilde, ViktorKom, Uğur Yakışık (Sketchfab) | CC BY 4.0 | jeśli armaty zamiast balist |
| Kusza | iedalton, Sketchfab | CC BY 4.0 | broń kuszników |
| Świnia | iRahulRajput, Sketchfab | CC BY 4.0 | chlewnia |
| Medieval Gatehouse, Medieval castle (wieża), Saxon warrior | Daniel74 i in., Blendswap | CC0 | brama zamku, wieże, milicja |

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
9. Crossbow / Rifle Aim + Shoot (kusza, jeśli jest)

Tragarze, rzemieślnicy, rolnicy (ludzie w mieście):
10. Walking (zwykły chód), Carrying / Box Walk (chód z ładunkiem), Idle
11. Pick Up / Put Down (podnoszenie i odkładanie)
12. Hammering / Building, Chopping (rąbanie), Digging / Pick Axe (kopanie), Harvesting / Plant (żniwa, sadzenie), Sitting (opcjonalnie)

Jazda:
13. Horse Riding (jeździec w siodle) — jeśli Mixamo ma; inaczej poza siedząca

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
