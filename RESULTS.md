# Marchland — dziennik wyników

Najnowsze na górze. Liczby z `tools/measure` na programowym GPU (SwiftShader):
**liczniki są dokładne** (potoki, wywołania, pamięć), **sekundy tylko
porównują przebiegi** na tej samej maszynie — telefonu ani karty graficznej
jeszcze nie mierzyłem.

## 2026-11-14 · M2, etap 2: wzniesienia i szyki komputera

- **Wzniesienia**: strzelcy sięgają do 15 % dalej na niższy teren (w pełni przy 8 m różnicy;
  dotyczy wyboru celu, strzału i miejsca, gdzie stają); szarża w dół zbocza (> 1,5 m) uderza
  ×1,25 mocniej; cios pod górę −1 do ataku.
- **Komputer używa szyków**: jazda w ataku klinem, poza nim prostokątem; pikinierzy i
  halabardnicy stawiają ścianę pik, gdy jazda wroga jest bliżej niż 55 m (zwijają za 88 m);
  oddziały z tarczami podnoszą je przez 4 s po trafieniu strzałą, jeśli nie walczą wręcz.
  Także fale trybu Obrona.
- Testy: 76 / 76. Tempo komputera bez zmian (35,4 / 35,9 min).

## 2026-11-14 · M2, etap 1: szeregi, klin, szyk luźny, tarcze, ściana pik, strzelanie dowolne

- **Szeregi**: piechota w prostokąt o 2 / 3 / 4 / 6 szeregach (front wynika z liczby ludzi).
- **Klin** (jazda): ludzie w trójkącie, szarża ×1,6 (premia i wstrząs), obrona −1,5.
- **Szyk luźny** (piechota): odstępy ×1,9, strzały trafiają o połowę rzadziej, obrona wręcz −2.
- **Tarcze** (kto ma tarczę: milicja, miecznicy, kusznicy): osłona przed strzałami ×2 (do 85 %),
  marsz ×0,55, atak −3.
- **Ściana pik** (pikinierzy, halabardnicy): oddział stoi (rozkaz marszu ją zwija), szarża w
  front nic nie daje, jazda obrywa premią przeciw jeździe ×2, obrona +3 od frontu.
- **Strzelanie**: dowolne (strzelcy sami wybierają cel) albo na rozkaz.
- **Atak na kliknięty oddział**: biegiem (machiny idą); strzelcy stają na zasięgu (85 %) i
  strzelają, wręcz walczą tylko, gdy ktoś do nich dopadnie.
- Panel zaznaczonych oddziałów: rzędy Szeregi / Szyk / Postawa / Strzelanie, tylko te, które
  któryś z zaznaczonych umie. Testy: 74 / 74 (nowe: szeregi i front, mniej strat od strzał w
  szyku luźnym i za tarczami, klin zabija więcej od linii, ściana pik stoi i rani jazdę mocniej,
  strzelcy na rozkaz nie strzelają sami, wysłani stają na zasięgu i trafiają). Tempo komputera
  bez zmian (35,4 / 35,9 min).

## 2026-11-14 · Charaktery komputera, tryb Obrona, samouczek (M5 bez taktyki oddziałów)

- **Charaktery**: z umiarem (dotychczasowy), budowniczy (fale ×1,5 ludzi, czeka ×1,35),
  najeźdźca (fale ×0,75, czeka ×0,85, co 150 s wysyła najszybszy wolny oddział na budynek
  gracza dalej niż 60 m od zamku). Wybór w menu.
- **Obrona**: komputer bez miasta; od 7. minuty co 4 min fala spod jego zamku (1 oddział, +1
  co drugą falę, rodzaje kolejno od pikinierów po ciężką jazdę), maszeruje na zamek gracza i bije
  wszystko po drodze; plakietka z czasem do końca i następną falą; 30 min = wygrana.
- **Samouczek**: 7 kroków z plakietką, zaliczane samoczynnie; zapas w zamku na start.
- Testy: 69 / 69 (nowe: fale Obrony rosną i idą na zamek, wygrana po czasie; najeźdźca wysyła
  zagon). Sprawdzone w przeglądarce: plakietka Obrony.
- Taktyka linii i flanki komputera — razem z mechaniką oddziałów (M2), na koniec.

## 2026-11-14 · Zapis gry i ustawienia (M6)

- **Zapis**: cały świat jako tekst (`src/sim/save.ts`): graf obiektów z numerami (żołnierz →
  oddział, tragarz → budynek), tablice liczb w base64, zbiory, mapy i trzy klasy (losowanie,
  kolejka zdarzeń, siatka) z metodami. Zapis zna układ mapy i miejsce zamku; wczytanie gry z innej
  mapy przeładowuje stronę na tamtą mapę. Menu pauzy: „Zapisz grę”; menu startowe: „Wczytaj
  grę (Przeprawa, 2 min)”. Jedno miejsce zapisu w pamięci przeglądarki.
- Test: gra komputer–komputer 8 min → zapis → wczytanie → obie toczą się dalej 4 min i są
  identyczne (czas, magazyny, oddziały co do milimetra, ludzie, las, punkty); zapis < 4 MB.
  W przeglądarce: zapis na przeprawie, wczytanie ze strony z inną mapą, ten sam czas i złoto.
- **Ustawienia** w menu pauzy: głośność (0 / 30 / 60 / 100 %), przesuwanie mapy krawędzią
  ekranu; pamiętane w przeglądarce.
- **KTX2 odłożone**: powierzchnie są tablicami tekstur składanymi z JPG w przeglądarce; skompresowane
  tablice wymagają kodera Basis (go tu nie ma) i innej ścieżki ładowania. Pamięć tekstur dziś:
  ok. 290 MB na High, ¼ na Low.

## 2026-11-14 · Grupy 1–9, widoki F5–F8, dwuklik, kontry przy werbunku

- Ctrl+1…9 zapamiętuje zaznaczenie, 1…9 je przywraca (dwa razy w 0,4 s: kamera do grupy);
  Ctrl+F5…F8 zapamiętuje widok kamery, F5…F8 wraca (przeglądarka nie przeładowuje strony);
  dwuklik w oddział: wszystkie tego rodzaju widoczne na ekranie. Przy werbunku podpowiedź
  kontr. Sprawdzone w przeglądarce prawdziwymi klawiszami (10 oddziałów: zapis, czyszczenie,
  przywrócenie; widok wraca po F5, strona się nie przeładowuje).

## 2026-11-14 · Trzy układy mapy (M3)

- Wybór w menu „Mapa” (parametr `?map=`): **Otwarte pole**, **Przeprawa**, **Bór**; mapka w
  menu pokazuje rzekę albo bór dla wybranego miejsca zamku.
- **Przeprawa**: rzeka wije się przez środek i przecina linię między zamkami dokładnie w trzech
  miejscach: na środku grobla (20 m, nad wodą, kamienne balustrady), na wysokości wzgórz dwa
  brody (woda po kostki). Głęboka woda jest nie do przejścia (nawigacja, budowa, ruch: żołnierz
  wraca na bliższy brzeg). Kopalnia i kamieniołom stoją na brodach, wieś na grobli.
  Pomiar: komputer 40,9 / 38,2 min przy grobli 14 m → 37,9 / 37,9 przy 20 m.
- **Bór**: las prawie wszędzie (13 tys. drzew zamiast 3,8 tys.; połowa lasu ozdobnego poza
  mapą), polany miast 105 m, trakt 24 m, polany punktów. Komputer: 34,8 / 36,2 min.
- Sprawdzone dla trzech miejsc zamku: rzeka ≥ 230 m od zamku, ≥ 170 m od jeziora, punkty nie
  w głębokiej wodzie.

## 2026-11-14 · Trzy poziomy zamku (M3)

- Poziom zamku wyznacza zasięg budowy (230 / 260 / 290 m, pola 300 / 330 / 360 m), najwyższy
  poziom koszar (1 / 2 / 3), wytrzymałość (1800 / 2600 / 3600) i strzały zamku (co 1 / 0,75 /
  0,5 s). Rozbudowa: 250 złota, 60 drewna, 120 kamienia, potem 500 / 100 / 240; minuta pracy.
- Zamek da się kliknąć: panel z poziomem, tym, co daje, i przyciskiem rozbudowy; zamek rośnie
  (0,8 / 0,9 / 1 wielkości), komunikat po rozbudowie. Komputer podnosi zamek przed koszarami.
- Testy: 66 / 66 (nowy: koszt, minuta, zasięg i wytrzymałość po rozbudowie, poziom 3 to szczyt;
  test przezbrojenia sprawdza, że koszary 2 wymagają zamku 2).

## 2026-11-14 · Punkty do zajęcia na środku mapy (M3)

- Trzy punkty na prostej w połowie drogi między zamkami (równo daleko od obu): kopalnia
  (wzgórze, 8 rudy/min), kamieniołom (drugie wzgórze, 10 kamienia/min), wieś (środek pola,
  15 złota + 6 zboża/min). Zajęcie: oddział w szyku przy punkcie 20 s, bez wroga w 30 m.
- Komputer co 20 s wysyła wolny oddział (zostawia jeden w domu) na punkt, którego nie
  trzyma; w pomiarze bierze wieś, przez którą idą jego fale; tempo bez zmian (35,4 / 35,9).
- Polany wokół punktów (las ustępuje), zakaz budowy przy punkcie. Test: zajęcie po 20 s,
  dochód, wróg w pobliżu blokuje zajęcie.

## 2026-11-14 · Zakładka Produkcja i alarmy z „pokaż”

- Gospodarka liczy, ile czego wytworzono (warsztaty, zbieracze, pola, podatki), i co 15 s
  zapisuje stan; zakładka **Produkcja** pokazuje dla każdego towaru: w zamku, wytwarza /min
  i bilans /min z ostatnich dwóch minut (ujemny na czerwono), a obok **zatory**: warsztaty
  pogrupowane według przyczyny (brak surowca — którego, pełne podwórze, brak pracownika,
  wstrzymany), każdy z „pokaż”.
- **Alarmy z „pokaż”** (przycisk w komunikacie przenosi kamerę): wróg w osadzie (oddział
  wroga ≤ 30 m od budynku), wróg przy zamku, głód, nasz oddział ucieka / rozbity, budynek
  stracony, mur przebity, podwórze pełne od minuty.

## 2026-11-14 · Komputer stawia wieże; przecinka przestaje być lasem

- Komputer stawia wieżę strażniczą przed miastem (po stronie wroga, z boku drogi ataku;
  druga później w kolejności budowy) i obsadza ją łucznikami, którzy zostają w domu.
  Pomiar: wieża stoi z pełną załogą (4), tempo 35,4 / 35,9 min (ziarna 5 / 6; wieża
  kosztuje 60 kamienia). Mury z bramą dla komputera razem z mechaniką oddziałów (armia
  musi umieć przejść bramę kolumną).
- Las w regułach liczy stojące drzewa w kratkach 12 m: gdzie wycięto ponad połowę, nie
  ma spowolnienia marszu ani osłony przed strzałami, a na przecince wolno budować.
  Odrośnięte drzewa przywracają las. Nowy test.

## 2026-11-14 · Ikonki surowców, szary mur, wybór miejsca zamku

- **Ikonki**: 19 rysunkowych ikon SVG (płaskie kolory, ciemny kontur, odblask) zamiast
  kolorowych kwadracików w pasku surowców i we wszystkich cenach (`src/ui/icons.ts`).
- **Mur, brama, wieża szare**: skany kamienia są ciepłe (łamany średnio 138/126/102),
  odcienie `rubble#bccfff` i `ashlar#bccae6` znoszą przewagę czerwieni.
- **Drzewa**: sadzonka wyrasta raz w drzewo, drwal bierze tylko w pełni wyrośnięte
  (było już tak; nowy test tego pilnuje).
- **Wybór miejsca zamku** (3): róg (−212, 212), zachód (−212, 128), południe (−128, 212);
  komputer lustrzanie. Mapa liczy się z wybranego miejsca przy wczytaniu, więc zmiana
  przeładowuje stronę z `?start=` i od razu startuje grę. Oś pola, kopce i grzędy liczą
  się od linii między zamkami. Sprawdzone dla każdego miejsca: jezioro i wychodnie
  w mapie (min. 16 m od krawędzi), zamek na płaskim, góry ≥ 250 m od zamku; komputer
  burzy biernego gracza po 32–34 min na każdym z trzech.

## 2026-11-14 · Brama w murze

- Mur zatrzymywał wszystkich, także własnych żołnierzy (wcześniej błędnie pisałem, że
  przepuszcza swoich): jedyną drogą była zostawiona przerwa. Teraz **brama**: przycisk
  „Brama” w menu budowy, kliknięcie we własny mur zamienia 3 komórki prostego odcinka
  (6 m) w bramę za 20 drewna i 12 kamienia. Swoi ludzie (ścieżki A*) i żołnierze
  przechodzą, wróg zatrzymuje się i musi ją rozbić (400 ciosów, zwykły mur 260).
- Model z zestawu Tower and Castle Walls (LucasPresoto, CC BY 4.0): łuk z dwoma
  skrzydłami; skrzydła otwierają się, gdy swój żołnierz albo mieszkaniec jest w 12 m.
- Scena pokazowa: ciągły mur z bramą pośrodku zamiast przerwy.
- Testy: 62 / 62 (nowy: brama tylko we własnym murze, ścieżka przez bramę, swoi
  przechodzą, wróg stoi).

## 2026-11-14 · Drwal wycina las i sadzi nowy

- Drzewa są teraz listą w symulacji (`src/sim/trees.ts`), tą samą, którą rysuje widok
  (ten sam generator i ziarno, więc las wygląda jak przedtem). Stan wycinki (kiedy
  ścięte, kiedy posadzone, kto po nie idzie) jest częścią świata: powtórka ziarna daje
  tę samą partię.
- Drwal: najbliższe dorosłe drzewo w 48 m od chaty → ścina (8 s) → sadzi sadzonkę przy
  pniu (4 s), jedną za każde drzewo → niesie 8 drewna (było 6 z „wyprawy”). Sadzonka
  rośnie 600 s (od 15 % wielkości). Widok: ścięte drzewo znika, zostaje pień, sadzonka
  rośnie na jego miejscu (przerysowanie tylko zmienionych drzew, 2× na sekundę).
- Drwal rusza po drzewo, dopóki podwórko nie jest pełne (wcześniej czekał, aż zmieści
  się cały ładunek, i przy 8 sztukach stał z 8 w podwórku).
- Tempo komputera po zmianie: 31,8 / 34,3 min (ziarna 5 / 6). Nowy test: drwal ścina
  tylko w zasięgu, sadzi za każde drzewo, sadzonki odrastają.
- Przy obecnej mapie drwal da się postawić w 87 % miejsc na skraju lasu wokół zamku
  (290 z 332; reszta to strome stoki i okolice krawędzi mapy).

## 2026-11-14 · Tempo komputera: z 45 do 33–35 minut

Pomiar (oś czasu i stan warsztatów co pół sekundy, minuty 12–30, ziarno 5): broni i złota
było w bród, wojsko stało na 24–36 ludziach, bo warsztaty czekały na **transport**:
kamieniołom 67 % czasu z pełnym podwórkiem, młyn 67 % bez zboża (choć w zamku leżało 50),
garbarnia 83 %, huta 92 % bez surowca, chlewnia zapchana mięsem. Drewna stale ~0: las
~100 m od zamku, a tragarz z 5 sztukami i 1,7 m/s donosił ~4 drewna na minutę.

| zmiana | burzy biernego gracza (ziarno 5 / 6) |
|---|---|
| przed (mapa z górami) | 46,3 / 44,6 min |
| kolejność budowy: drugi młyn i piekarnia wcześnie, koszary → chlewnia → garbarnia → rzeźnik → łuczarz przed żelazem | 48,3 / 52,7 (sama nie pomaga) |
| tragarz nosi 8 zamiast 5 | 41,2 / 44,8 |
| więcej wolnych rąk przy powołaniu (0,3 zamiast 0,15) | bez zmian — cofnięte |
| ludzie chodzą 2,0 m/s zamiast 1,7 | 37,4 / 37,0 |
| las bliżej miast: 66 m wolnego zamiast 82 | **33,4 / 35,0** |

Wszystkie zmiany poza kolejnością budowy działają tak samo dla gracza. Test całej partii
znów ma limit 38 min (było 48). Testy: 60 / 60.

Przy okazji: wyższe pagórki zrobiły obok jezior niecki poniżej lustra wody i siatka
jeziora zalewała je prostokątnymi płatami. Woda jest teraz rysowana tylko w misie jeziora,
tak jak liczą ją reguły (isWater).

## 2026-11-14 · Kuźnia z przesłanych modeli

- **Medieval Blacksmith** (Daniel Andersson, CC BY 4.0) jako kuźnia na poziomach 2 i 3:
  mur pruski, dachówka, palenisko pod daszkiem; 33 → 12 tys. trójkątów, 10,5 m; dym z
  komina i z paleniska. Konwerter `tools/blender/convert.py` przypisuje powierzchnie
  gry po nazwach materiałów.
- Odrzucone: dom z winiarnią (rozsypuje się przy przerzedzaniu: 9 457 kawałków,
  ściany pod materiałem bez nazwy), karczma i kuźnia stylizowana (bajkowe dioramy,
  materiały spec-gloss), warsztat na skale (diorama), chałupa z wioski (wycięta ze
  sceny, ale bez tekstur to gładka skrzynia pod strzechą: drzwi i okna były namalowane).

## 2026-11-14 · Mapa: zamki bliżej rogów, większy zasięg, pagórki, góry i skały

- Zamki 195 → 212 m od środka na każdej osi (600 m od siebie); jezioro i wychodnie
  za zamkiem przesunięte tak, by zmieściły się w mapie.
- Zasięg budowy 180 → 230 m, pola i winnice 260 → 300 m.
- Wyższe pagórki (13 m zamiast 9, fałdy 2,2 m, kopce przy polu 15 m). Skała na
  stokach dopiero od nachylenia 0,42 (wcześniej 0,3), żeby wyższe zbocza nie
  dostawały szarych pasów.
- **Góry**: dwa szare masywy na flankach, w rogach, których nie trzymają zamki
  (promień ok. 92 m, do 80 m wysokości, grzbiety z szumu, rumowiska głazów).
  Podnóża są do przejścia, rdzeń (70 % promienia) jest nieprzechodni: nikt tam
  nie wejdzie, nie zbuduje ani nie poprowadzi drogi; żołnierz, który wejdzie na
  skałę, wraca u jej stóp.
- **Skały**: cztery skalne grzędy po bokach pola (17 m, stosy głazów), też
  nieprzechodnie: armia musi je obejść.
- Wszystko symetryczne względem obrotu o pół koła (sprawdzone na siatce co 7 m),
  więc żadna strona nie ma przewagi. Minimapa pokazuje skały na szaro, podpowiedź
  pod kursorem: „Góry — nie do przejścia” / „Skały — trzeba je obejść”.
- Komputer burzy biernego gracza po 44–46 min (wcześniej 39–41): dłuższy marsz.
  Nadal za późno względem planu 25–35 min, do poprawy w tempie AI.
- Testy: 60 / 60 (test całej partii: limit 48 min).

## 2026-11-14 · Mur i wieża strażnicza z przesłanego zestawu

- **Tower and Castle Walls** (LucasPresoto, CC BY 4.0) przerobione na powierzchnie gry
  przez `tools/blender/walls.py`.
- Mur: jeden okres blanek (1,41 m) wycięty, domknięty i rozciągnięty na komórkę 2 m;
  204 trójkąty na komórkę (instancje), 4,7 m wysokości, korpus z kamienia łamanego,
  korona z ciosu, wyższe blanki.
- Wieża: kamienna baszta 5,1 m, taras na 8,6 m; drzwi, flaga strony; poziom 2 z gankiem,
  poziom 3 z daszkiem; 6,6–7 tys. trójkątów (wcześniej z kodu w Blenderze).

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
