# Marchland — dziennik wyników

Najnowsze na górze. Liczby z `tools/measure` na programowym GPU (SwiftShader):
**liczniki są dokładne** (potoki, wywołania, pamięć), **sekundy tylko
porównują przebiegi** na tej samej maszynie — telefonu ani karty graficznej
jeszcze nie mierzyłem.

## 2026-11-14 · Nowy zamek główny: Buckstone

- Z dziewięciu przesłanych zamków wybrany **Buckstone Castle** (Peter Leban, CC BY 4.0):
  tynk, mur pruski, rudy dach i baszta pasują do stylu D; pozostałe były albo
  prostą bryłą (Fougères, UV Castle), albo białą makietą fantasy (Environmental),
  albo samymi murami (tower and castle walls).
- `tools/blender/keep.py` zamienia tekstury na powierzchnie gry (jak pozostałe
  budynki), usuwa płytę gruntu i bluszcz, przerzedza 59 → 22 tys. trójkątów,
  skaluje do 24 × 15,7 m (22 m z flagą) i stawia flagę w barwie strony.
- Promień zamku 8 → 11 m (kliknięcia, zasięg walki wręcz, wyjście ludzi z bramy).
- Testy: 60 / 60.

## 2026-11-14 · Jezioro: postrzępiony brzeg, woda z Field Line

- Brzeg: do kilku wolnych fal dołożony szum obiegający okrąg (zamyka się sam
  na sobie), więc promień zmienia się od 18 do 36 m, z zatoczkami i cyplami.
  Ten sam kształt mają symulacja (woda, omijanie, planowanie zabudowy) i widok.
- Woda przeniesiona z Field Line: powierzchnia fizyczna (ior 1,333), odbicie
  z Fresnela, dno widziane przez zmarszczki i barwione wodą wzdłuż drogi
  światła (Beer–Lambert), torfowa zieleń w głębi.
- Ziarno na płyciznach: było grudami skanu błota widzianymi przez wodę; dno
  jest teraz rozmyte (cztery próbki, szerzej im głębiej), a zmarszczki
  wygładzają się w ostatnich centymetrach wody i z odległością.
- Brzeg z błota: zamiast równego pasa kilku metrów jest wąski, przerwany pas,
  miejscami poszerzony w wydeptane placki; tam, gdzie go nie ma, trawa sięga wody.
- Testy: 60 / 60.

## 2026-11-13 · Wieża i mur, większa mapa, żywsze kolory

- **Wieża strażnicza** (40 zł, 15 drewna, 60 kamienia): do 4 łuczników albo kuszników
  jednego rodzaju; strzelają z 9 m, zasięg broni + 12 m; liczą się do limitu i
  jedzenia armii; padają z wieżą. **Mur**: 3 kamienie za 2 m, 260 ciosów na
  odcinek, zatrzymuje ludzi i żołnierzy obu stron; wrogowie, którzy na niego
  wejdą, rozbijają go; kamienie z machin też.
- **Zasięgi budowy**: drwal, kamieniołom, kopalnia, wieża — cała mapa (poza
  okolicą wrogiego zamku); zagroda i winnica 260 m; reszta 180 m. Drogi i mury
  można kłaść wszędzie poza okolicą wrogiego zamku.
- **Mapa** 400 → 560 m, zamki 353 → 550 m od siebie; dawna droga między zamkami
  usunięta. Komputer zdobywa zamek bezczynnego gracza ok. 39.–41. minuty — za
  późno wobec planu (25–35); do skrócenia (mniejsza pierwsza fala, zagony).
- **Kolory**: mapowanie tonów ACES → Khronos PBR Neutral (nie odbarwia),
  nasycenie ×1,35 i kontrast ×1,14 przed krzywą, słabsze światło nieba
  (30 → 24 tys. lx) dla wyraźniejszych cieni, rzadsza mgła; wychodnie skał z
  postrzępionym brzegiem zamiast okręgów.
- **Mysz**: środkowy przycisk przesuwa mapę, prawy przeciągnięty obraca, prawy
  klik — rozkaz; Ctrl + przeciągnięcie prawym — front oddziału.
- **Koszt animacji i efektów na klatkę** (przeglądarka): ludzie 0,07 ms, wojsko
  0,02 ms, miasto 0,04 ms, dym 0,15 ms przy 24 kominach (do ~1,4 ms przy
  maksymalnych 220), mury 0. Po zmianie na mapie: przerysowanie dróg i pól
  7,5 ms, wycinka drzew 5,3 ms (większa mapa) — najwyżej 2 razy na sekundę.
- Testy 60/60.

## 2026-11-13 · Wszystkie budynki z Blendera, dym

- Dziewięć nowych modeli: kamieniołom, zagroda, rybak, chlewnia, masarnia,
  garbarnia, łuczarz, stajnia, koszary (1–5 tys. trójkątów). Razem 19 budynków
  × 3 poziomy = 57 plików, 11 MB (bez kompresji). Lista znaków rozpoznawczych:
  `docs/BLENDER.md`.
- Dym z kominów chat z mieszkańcami, warsztatów przy pracy, pieca i mielerza
  huty (do 220 źródeł × 7 kłębów, jeden obiekt instancjonowany).
- Testy 57/57.

## 2026-11-13 · Wydajność: symulacja, pamięć, rysowanie

Jak mierzone: symulacja w Node (bez GPU, liczby wiarygodne); strona w Chromium na
programowym GPU (SwiftShader) — **liczniki dokładne, czasy rysowania nie**: ten
kontener nie ma karty graficznej, a czekanie na nią dolicza się do odcinków po
rysowaniu (licznik gry pokazywał np. „hud 13 ms”, a sam interfejs mierzony osobno
to 0,09 ms).

**Symulacja** (60 kroków na sekundę, budżet 2 ms na krok; partia komputer–komputer
do 35. minuty, potem bitwa obok miast po 31 budynków i 64 mieszkańców):

| | przed | po |
|---|---|---|
| bitwa, średnio / najgorszy krok | 0,45 / 9,0 ms | 0,28 / 1,4 ms |
| kroki powyżej 2 ms w całej partii | 386 | 59 |
| alokacje na 5 minut gry | 612 MB | 111 MB |
| odśmiecania pamięci w partii | 344 | 91 |

Przyczyny: `Math.hypot` alokuje przy każdym wywołaniu (55 % alokacji) — zastąpiony;
jedzenie zwracało nową tablicę co krok dla każdego domu; żołnierze liczyli
odległość do każdego budynku obu miast w każdym kroku (17 % czasu) — teraz test
siatki zabudowy; szukanie drogi do celu w wodzie przeszukiwało całą mapę (8,4 ms)
— cel przesuwany na najbliższe wolne pole, limit 12 000 pól na wyszukanie,
budżet 8 000 pól na krok.

**Przeglądarka** (High, 1280 × 720):

| | przed | po |
|---|---|---|
| sterta JS | 292 MB | 91 MB |
| widok miasta: trójkąty / wywołania | 864 k / 100 | 532 k / 179 |
| cała mapa z góry: trójkąty / wywołania | ~1 M / ~100 | 974 k / 369 |
| bitwa 182 żołnierzy z bliska | — | 558 k / 185 |

Kopie skanów (226 MB) są zwalniane po pierwszej klatce, gdy karta je ma. Las,
kamienie i krzaki są podzielone na kwadraty 150 m, więc niewidoczne kwadraty
pomija i obraz, i cienie. Co klatkę: widoki miasta, ludzi, winorośli, armii,
znaczników razem ok. 0,1 ms; interfejs 0,09 ms; przerysowanie dróg i pól
3,6 ms, a wycinka drzew 2,7 ms tylko po zmianie na mapie (najwyżej 2 razy na
sekundę).

Wczytywanie: 83 potoki graficzne, 106 modułów shaderów; tekstury na karcie
291 MB (High; na Low ¼ i bez map normalnych). **Do zrobienia**: tekstury KTX2
(kamień milowy M6) — największa pozostała pozycja pamięci na telefonie; pomiar na
prawdziwym telefonie i karcie graficznej.

## 2026-11-13 · Milicja tylko do obrony; strojenie po zmianie

- **Milicja = straż domowa**: rozkazy tylko do 115 m od własnego zamku, bez ataku
  na budynki; w rozkazie grupowym zostaje, reszta idzie; zapędzona za daleko
  wraca. Po przezbrojeniu przy koszarach — zwykłe wojsko.
- **Komputer**: najwyżej 2 oddziały milicji, nie bierze ich do fal, przezbraja je,
  gdy ma broń; naprawiony błąd, przez który po upływie czasu wysyłał pustą falę.
  Kolejność budowy: kopalnia, koszary, huta i kuźnia wcześniej; dwóch drwali
  więcej, drugi młyn z piekarnią; pierwsza fala 24 ludzi (było 36).
- **Ekonomia**: chata mieści 8 / 12 / 16 osób (było 6 / 10 / 14), żniwa dają 10
  zboża (było 7) — bez tego miasta z dłuższymi łańcuchami głodowały i nie miały
  kogo powołać.
- **Czasy** (`npm run timeline`, trzy ziarna): pierwszy regularny regiment ok.
  20. minuty; komputer zdobywa zamek bezczynnego gracza w 33.–35. minucie
  (górna granica planu 25–35). Komputer przeciw komputerowi: pierwsze starcia
  ok. 28. minuty, ok. 30 poległych do 35. minuty. **Do poprawy**: wcześniejsze
  starcia (np. zagony lekkiej jazdy na wsie, mniejsza pierwsza fala).
- Testy 57/57 (nowe: straż domowa, komputer trzyma milicję w domu).

## 2026-11-13 · Budynki z Blendera, młyn, huta, wino, milicja z zamku, przezbrojenie

- **10 budynków z Blendera** w 3 poziomach (`tools/blender/`, `public/buildings/`),
  1,8–9 tys. trójkątów każdy, bez własnych tekstur (skany gry). Gra wczytuje je
  przy starcie; skrzydła młyna kręcą się, gdy miele. Pozostałe budynki mają
  jeszcze kształty z kodu. Podgląd na stronie `gallery.html`.
- **Gospodarka**: młyn (zboże → mąka → piekarnia), huta (ruda + drewno →
  żelazo → kuźnia, płatnerz), winnica (krzewy sadzone raz, zbiór co sezon,
  rzędy winorośli zajmują teren) i winiarnia (winogrona → wino → chaty: podatek
  ×1,8, przyrost szybszy). Drwal przynosi 6 drewna i rąbie je przy pieńku.
- **Wojsko**: milicja werbowana w zamku bez koszar (włócznia i tarcza z drewna);
  przezbrojenie przy koszarach za brakujący ekwipunek, 20 s.
- **Liczby** (`npm run timeline`, komputer sam, ziarno 7): pierwszy regiment
  ok. 14. minuty; komputer zdobywa zamek bezczynnego gracza w 18. minucie,
  bo wcześnie wystawia milicję z zamku — za szybko jak na plan (pierwsza
  poważna bitwa ok. 15. minuty, partia 25–35 minut). **Do strojenia**:
  milicja jako obrona, nie jako szybki atak (próg pierwszej fali, cena).
- Testy 55/55; dokumenty wygenerowane od nowa.
- Poprawiony błąd zestawu części: grupowanie wierzchołków po indeksie psuło
  się po fazowaniu krawędzi i odrzucało części budynku o kilka metrów.

## 2026-11-13 · Porównanie stylów na nowym podłożu — wybrany styl realistyczny (D)

Ta sama strona `compare.html`, teraz na łące ze zdjęcia lotniczego, z drogą,
kamieniami, krzakami i drzewami. Plansze: `results/2026-11-13/style/porownanie-kuznie.jpg`
i `porownanie-domy.jpg`. Liczby modeli bez zmian: kuźnia rysunkowa 14 tys.
trójkątów (2 wywołania), kuźnia realistyczna 33 tys. (23), dom z winiarnią
673 tys. (27). Gracz wybrał styl **D**; zasady i budżety w `docs/BLENDER.md`
(„Decyzja o stylu”).

## 2026-11-13 · Żywe miasto: dowolne stawianie, drogi, ludzie, teren bez powtórzeń

Co się zmieniło (szczegóły: `docs/ECONOMY.md`, `docs/BUILDINGS.md`, `docs/GAMEPLAY.md` §5, §9):

- **Budynki stawia się dowolnie** w promieniu 180 m od zamku, z obrotem (R) i
  podglądem miejsca; drwal przy lesie, rybak nad jeziorem, kamieniołom i kopalnia
  przy skale, zagroda z pasami pola za plecami. Komputer korzysta z tych samych
  zasad (planer miejsc: pierścienie wokół zamku, wieś z polami, skraj lasu,
  brzeg jeziora, wychodnie) i od każdych drzwi kładzie drogę do bramy.
- **Drogi** na siatce 2 m za kamień (G); ludzie szukają drogi algorytmem A*,
  drogą idą 1,4× szybciej, omijają budynki i wodę.
- **Ludzie są widoczni**: tragarze z ładunkiem w kolorze towaru, rolnicy na
  polach, drwale w lesie, budowniczowie; pięć póz (stoi, dwa kroki, dwa ruchy
  pracy). Zboże na pasach rośnie od zielonego do złotego.
- **Kamera**: oddalenie do całej mapy (860 m, prawie z góry, mgła rzednie z
  wysokością); obrót Q/E, środkowym przyciskiem, dwoma palcami i przyciskami.
- **Teren**: pagórki i dwa wzgórza, jeziora z wodą, wychodnie z głazami, luźne
  kamienie, krzaki. Łąka bierze kolor ze zdjęcia lotniczego łąki (CC0, 90 m),
  każda tekstura czytana dwa razy pod innym kątem — znikł regularny wzór, który
  wskazał gracz. Pod nowymi budynkami i drogami drzewa i krzaki znikają.
- **Dokumenty generowane z liczb gry** (`npm run docs`), test pilnuje, żeby
  były aktualne.

Ekonomia w liczbach (`npm run timeline`, komputer sam, ziarno 7): po 3 min 9
budynków i 13 osób; po 10 min 12 budynków, 26 osób, koszary; pierwszy regiment
w 13. minucie, bez głodu. Komputer przeciw bezczynnemu graczowi wygrywa przed
30. minutą. Komputer przeciw komputerowi (ziarno 11): pierwsze starcia ok. 20.
minuty, 84 polegli do 30. minuty, bez zwycięzcy po 40 minutach — obrona wciąż
silniejsza od ataku (ryzyko z `GAMEPLAY.md` §11).

Strojenie, które to umożliwiło: tragarz niesie 5 sztuk (było 3), idzie 1,7 m/s
(było 1,4); drwal przynosi 4 drewna, rybak 3 ryby; pierwszeństwo dla wywozu
towaru, którego zamkowi brakuje; żadnych dostaw do warsztatu z pełnym
podwórzem; werbunek zostawia w mieście co najmniej 4 wolnych ludzi; żołnierze
nie zajmują miejsc w chatach.

Testy: 51 z 51 (`npx vitest run`), w tym nowe testy żywego miasta, dróg,
werbunku z ludności i zgodności dokumentów.

Wczytywanie (WebGL2 na programowym GPU, High): tekstury 1,27 s, teren 0,96 s,
rozgrzewka potoków 4,26 s, razem 6,7 s.

Zrzuty (`results/2026-11-13/`, WebGL2 na programowym GPU, 1280 × 720):
`town.jpg` (miasto komputera-planera po 4 min, z drogami i wsią), `whole-map.jpg`
(maksymalne oddalenie), `meadow-220m.jpg` i `meadow-40m.jpg` (łąka bez
powtórzeń), `placing-a-farm.jpg` (duch zagrody z jej polami).

Znane braki: chodzenie poza drogami nie wydeptuje jeszcze ścieżek; pola przy
dużym oddaleniu są płaskimi prostokątami koloru; panel budowy zajmuje sporo
ekranu na telefonie; budynki komputera stoją czasem ciasno przy jeziorze.

## 2026-11-12 · Porównanie stylów: rysunkowy i realistyczny (do decyzji)

Jak zrobione: strona `compare.html` (`npx vite build --config vite.compare.config.ts`,
modele podane pod `dist-compare/models/`), ten sam teren, światło i kamera co w grze,
WebGL2 na programowym GPU, 1280 × 720. Plansze: `results/2026-11-12/style/`.

| Eksponat | Trójkąty | Wywołania po scaleniu wg materiału | Tekstury |
|---|---|---|---|
| A. kuźnia i dom z kodu, płaska paleta | bez zmian względem B | 1 materiał | brak |
| B. kuźnia i dom z kodu, skany | — | 1 materiał | wspólne tablice gry |
| C. kuźnia z młynem, Zenchuck (CC BY 4.0) | 14 248 | 2 | paleta 256 px, 2,5 KB |
| D. kuźnia, Daniel (CC BY 4.0) | 33 377 | 23 | 22 pliki do 2048 px, ok. 88 MB w pamięci bez kompresji |
| D. dom z winiarnią, Don_Dzen (CC BY 4.0) | 672 534 | 27 (z 9457 siatek) | brak (płaskie kolory) |
| wioska, Etherlyte (CC BY 4.0), same zabudowania | 253 037 z 1 345 681 | 22 | 20 plików do 4096 px, ok. 626 MB bez kompresji |

Czego nie pokazuję i dlaczego: karczma (CGI Tutorials) i druga kuźnia (Pixman) mają
kolory w wycofanym rozszerzeniu `KHR_materials_pbrSpecularGlossiness`; po przeniesieniu
`diffuseFactor` wychodzą zielone i prawie czarne — trzeba by je poprawić w Blenderze.
„Fantasy Book” to diorama w książce, nie budynek. Wioska to jedna scena dzielona
materiałami, nie budynkami: połowa trójkątów to grządka marchwi.

Wnioski liczbowe: model rysunkowy kosztuje 14 tys. trójkątów i 2 wywołania; realistyczna
kuźnia 33 tys. i 23 wywołania (do scalenia w atlas); dom z winiarnią wymaga uproszczenia
około 30× przed użyciem. Decyzja o stylu należy do użytkownika.

## 2026-11-12 · Budynki z części, strome dachy, niskie słońce, horyzont (commit 7e828d4)

Jak mierzone: `tools/measure/load.mjs --game generic --extra '&q=high&scene=battle&seed=3'`
(WebGPU, High); zrzuty `shots.mjs --gpu webgl`, scena `town`.

| | Przed (d6b0b0c) | Po |
|---|---|---|
| Potoki / moduły shaderów | 54 / 72 | 56 / 74 (materiał horyzontu) |
| Pamięć tekstur wgranych | 226,3 MB (14 warstw) | 258,3 MB (16 warstw: doszedł gont i błoto) |
| Pamięć celów renderowania | 64,4 MB | 64,4 MB |
| Etapy ładowania gry | 1,95 s | 2,68 s |
| Gotowość / GPU bezczynne | 7,3 s / 8,4 s | 9,1 s / 11,0 s |
| Testy | 43 | 43 |

Zrzuty: `results/2026-11-12/buildings_{town,keep}.jpg` (po); stan sprzed:
`webgpu-high_town-close.jpg` z tego samego dnia.

Decyzje i liczby za nimi:

- **Słońce 42° → 30°, niebo 18 → 30 tys. lx**: przy 15–22 tys. lx zacienione
  ściany wychodziły prawie czarne (cień do światła około 1 : 8). Podniesione
  światło nieba i odbicie od gruntu (albedo sondy 0,09 → 0,16) dają czytelny
  cień bez podnoszenia „ambientu”.
- **Okluzja ze skanów w połowie siły**: w pełnej każda zacieniona ściana gasła.
- **Strzecha rysowana na 2,4 m zamiast 0,54 m**: skan pokrywa pół metra; z 40 m
  był płaską szarością.
- **Odrzucone**: ciemne prostokąty „podwórza” pod każdym budynkiem i dysk błota
  pod zamkiem — rysowały ostre kształty na trawie. Podwórza robi teraz teren
  (ścieżki i place z mapy pokrycia), własny grunt mają tylko wybiegi i pola.
- **Pamięć tekstur 258 MB** jest blisko budżetu 300 MB: kolejne warstwy dopiero
  po KTX2.

Czego nie zmierzyłem: klatek na prawdziwym GPU; zrzutu WebGPU po tej zmianie
(WebGL2 bez błędów konsoli). Jeden zrzut z bliska przekroczył 30 s na
programowym GPU — widok miasta jest dla niego wyraźnie cięższy niż wcześniej.

## 2026-11-12 · Skany powierzchni i skład dziesięciu oddziałów (commit d6b0b0c)

Jak mierzone: `node tools/measure/load.mjs --game generic --extra '&q=high&scene=battle&seed=3'`
(WebGPU, preset High, scena bitwy: po regimencie każdego rodzaju na stronę, 182 żołnierzy);
zrzuty `tools/measure/shots.mjs --gpu webgpu --size 1280x720`, te same widoki co niżej.

| | Przed (2026-11-11) | Po |
|---|---|---|
| Potoki / moduły shaderów po wczytaniu | nie mierzone | 54 / 72 |
| Pamięć tekstur wgranych | ok. 0,1 MB (szum) | 226,3 MB (3 tablice 1024² × 14 warstw, RGBA8) |
| Pamięć celów renderowania | nie mierzone | 64,4 MB |
| Etapy ładowania gry (suma `[load]`) | 1,43 s | 1,95 s (tekstury 0,58 s) |
| Gotowość / GPU bezczynne | 3,5 s / — | 7,3 s / 8,4 s |
| Paczka (`dist/`) | 1,0 MB | 14 MB |
| Krok symulacji, 182 żołnierzy w zwarciu | 0,09 ms | 0,09 ms |
| Testy | 38 | 43 |

Zrzuty: `results/2026-11-12/webgpu-high_{town-close,field,engines,overview}.jpg`;
stan sprzed zmian: `results/2026-11-11/webgpu-high_*.jpg`.

Decyzje i liczby za nimi:

- **Tekstury 1024 px, nie 2048**: przy najbliższym zoomie (25 m) piksel ekranu
  1440p to ok. 1,3 cm gruntu, teksel 1024 px na 2 m to 0,2 cm. Większe pliki nic
  by nie dały przed 4K.
- **Trzy tablice tekstur zamiast 42 osobnych**: shader terenu i budynków czyta
  3 tekstury niezależnie od liczby powierzchni (limit 16 na shader, GUIDE §7).
- **226 MB to dług**: RGBA8 bez kompresji. KTX2 (UASTC) zmniejszyłby to około
  czterokrotnie; w tej sesji nie było kodera (`toktx` / `basisu`). Preset Low
  bierze połowę rozdzielczości i tylko kolor: ok. 19 MB.
- **Odrzucone**: maski `select()` w materiale powierzchni — gładkie kolory
  (zboże, zwierzęta) wychodziły czarne na presecie High. Maska arytmetyczna
  (`step` + `mix`) działa; zrzut przed/po w historii sesji, w repo jest stan po.
- **Ekspozycja EV100 14,2 → 14,9**: skany mają albedo trawy ok. 0,2–0,25, moje
  wcześniejsze kolory z tabeli ok. 0,1; przy starej wartości łąka była
  prześwietlona na beżowo.

Czego nie zmierzyłem: klatek na sekundę na prawdziwym GPU, presetu Low na
telefonie, WebGL2 z nowymi teksturami poza zrzutami kontrolnymi (działa, bez
błędów konsoli).

## 2026-11-11 · Pierwsza grywalna wersja (commit ac48887)

Jak mierzone: zrzuty `tools/measure/shots.mjs --gpu webgpu`, przejście gry
skryptem Playwright na WebGL2 (19 kroków: budowa, werbunek, zaznaczanie,
rozkazy, kamera, minimapa, pauza).

| | Wynik |
|---|---|
| Przejście w przeglądarce | 19 / 19 kroków, 0 błędów konsoli |
| Testy (Node) | 38 |
| Krok symulacji, 200 żołnierzy | 0,09 ms (budżet 2 ms) |
| Etapy ładowania | 1,43 s |
| Wywołania rysowania / trójkąty (F3, widok pola) | 19 / 429 tys. |
| Paczka | 1,0 MB |

Odrzucone po drodze, z powodem:

- **Obrót kończyn w `positionNode` na macierzy instancji**: three r186 nakłada
  macierz instancji przed `positionNode`, więc kończyny idących żołnierzy
  rozlatywały się po mapie. Całe ustawienie żołnierza przeniesione do shadera
  (macierze instancji zostają jednostkowe).
- **Mgła 0,0011 /m**: z 110 m dawała 11 % barwy horyzontu, czyli +44 % jasności
  — mleczny obraz. Zostało 0,00022 /m (widoczność ok. 15–20 km).
- **Balans walki**: pierwsze starcia trwały 10–15 s i szarża dostawała się tylko
  stronie, która uderzyła pierwsza w kroku. Po zmianach równy pojedynek trwa ok.
  60 s kontaktu i wygrywa go każda strona w połowie z 30 prób.
