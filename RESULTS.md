# Marchland — dziennik wyników

Najnowsze na górze. Liczby z `tools/measure` na programowym GPU (SwiftShader):
**liczniki są dokładne** (potoki, wywołania, pamięć), **sekundy tylko
porównują przebiegi** na tej samej maszynie — telefonu ani karty graficznej
jeszcze nie mierzyłem.

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
