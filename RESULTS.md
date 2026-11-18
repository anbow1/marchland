# Marchland — dziennik wyników

Najnowsze na górze. Liczby z `tools/measure` na programowym GPU (SwiftShader):
**liczniki są dokładne** (potoki, wywołania, pamięć), **sekundy tylko
porównują przebiegi** na tej samej maszynie — telefonu ani karty graficznej
jeszcze nie mierzyłem.

## 2026-11-18 · Ostrzał, który się liczy; misja 1: 30 minut i obrona za murami

- **Pomiar**: kusznicy, wieże i moździerze oddali ok. 250 strzałów, zanim najeźdźca dotarł do obrońców,
  a zabili 2 ludzi. Kalibracja (oddział strzelców, 20 mieczników maszeruje na nich ze 160 m):
  kusze 1% zabitych na strzał, łuki 0%, działo ok. 12%.
  - Około 60% pocisków spadało przy człowieku (celowanie z wyprzedzeniem działa).
  - Trafiało 0,4 z nich minus osłona celu.
  - Bełt zabierał miecznikowi 13 z 36 punktów życia, a kula armatnia zabijała jednego człowieka.
- **Zmiany** (`config.ts`, `missiles.ts`):
  - trafienie 0,4 → 0,75;
  - łucznicy i kusznicy trafiają jednakowo, ale bełt ma 2× większe obrażenia (strzała 15, bełt 30,
    a bełt dalej przebija zbroję); łucznik strzela częściej (6 s wobec 10 s);
  - kula armatnia toczy się 12 m przez szereg i trafia do 4 ludzi stojących na jej drodze (75% każdy),
    z siłą malejącą z odległością;
  - moździerz zabójczy, ale mało celny: obrażenia 30, rozprysk 3,5 m, 3× większy rozrzut.
- **Po zmianach**:
  - kusze 14% na strzał (25–50 zabitych na 250 bełtów), łuki 3–5%, działo ok. 1 zabity na strzał;
  - nowy test w `tests/combat.test.ts`;
  - trzy stare testy dostosowane, bo nasycały się (oddział ginął cały przed końcem pomiaru).
- **Mur przez bród**: w wodzie nie da się stawiać muru, więc mur przecinający bród zostawia przejście
  (42 m na Przeprawie). Mur 65 m od zamku omija rzekę i jest szczelny.
- **Misja 1**:
  - 30 minut do ataku; najeźdźca znów 200 ludzi;
  - wygrana, gdy wszystkie jego oddziały uciekają nieprzerwanie przez 3 minuty (albo gdy giną);
  - gwiazdki według tego, ilu ludzi zostało.
  - Pomiar (obrońcy stoją i strzelają):

    | Obrona | Wygrane | Straty |
    |---|---|---|
    | pełna armia ok. 210 w polu | 6/6 | 7–22% |
    | 1 konnica, 3 piechoty, 3 kusznicy, 2 moździerze, 1 działo za murem z 3 wieżami | 6/6 | 37–83% |
    | ta sama armia bez murów | 2/6 | — |

  - Test kampanii sprawdza drugi i trzeci wiersz (4 partie każdy).
- Odprawa misji mówi o tym wszystkim. Testy 114/114.

## 2026-11-18 · Miasto na siatce, w dzielnicach; pola nie na złożach

- Planista miasta (gotowe miasto w kampanii i miasto komputera) stawiał chaty, warsztaty i resztę w pierścieniach
  wokół zamku, na promieniach koła, bez względu na przeznaczenie. Pola zagród mogły zachodzić na skałę rudy.
- Teraz (`sitePlanner.ts`, `planQuarter`):
  - budynki stoją na siatce 16 m (tej samej co siatka gracza), drzwiami do zamku, w dzielnicach:
    - mieszkalna: chaty, studnia, kaplica, karczma, targ, za zamkiem;
    - spożywcza: młyn, piekarnia, browar, rzeźnia, winiarnia, przy ulicy wsi z zagrodami;
    - rzemieślnicza: skład, tartak, huta, kuźnia, płatnerz, łuczarz, garbarnia;
    - wojskowa: koszary, stajnia, ludwisarnia, od strony wroga;
  - tragarze mają krótsze drogi między powiązanymi warsztatami;
  - zagrody, chlewnia i winnica dalej przy ulicy wsi, drwal, rybak, kamieniołom i kopalnia przy swoich zasobach;
  - pole zagrody kończy się przed skałą złoża kamienia lub rudy (`placement.ts`).
- Misja 1: 4 chaty w bloku 2×2, huta z kuźnią razem, młyn z piekarnią od strony zagród.
- Tempo komputera: po 18 min tyle samo budynków i ludzi co przedtem (dzielnice przybliżone do zamku), ale
  pierwsze uderzenie na biernego gracza wypada ok. 5 minut później (45 zamiast 40 min, ziarno 5).
  Test całej partii ma granicę 48 min zamiast 42.
- Nowy test: w misji 1 budynki na siatce, chaty obok siebie, żadne pole na złożu. Testy 111/111.

## 2026-11-18 · Mur szczelnie łączy się z wieżą

- Mur postawiony od wieży do wieży kończył się na krawędzi zabudowanego terenu wieży, ok. 6 m od jej środka.
  Wieża sama nie zagradza drogi, więc wrogi oddział przechodził tą szczeliną: 12/12 ludzi obok wieży,
  a z połowy muru 10/12 naokoło przez szczelinę.
- Teraz mur wchodzi w podstawę własnych wież, przez które przechodzi albo na których się kończy
  (`wallCellsFor` w `commands.ts`); podgląd kosztu w grze liczy tak samo. W widoku mur wbiega w wieżę.
- Nowy test: dwie wieże, mur prosty i skośny między nimi, linia zamknięta murem także za wieżami.
  Wrogi oddział posłany w poprzek przy wieży i przez środek: 0/12 po drugiej stronie.
- Na tablecie budowa dróg i murów działa tak samo (stuknięcie zamiast kliknięcia). Shifta nie ma, więc każdy
  odcinek zaczyna się od nowa.
- Testy 110/110.

## 2026-11-18 · Drogi i mury: odcinek to początek i koniec

- Dotąd koniec odcinka był od razu początkiem następnego, więc każde kliknięcie przedłużało drogę.
- Teraz:
  - odcinek to początek i koniec, a następne kliknięcie zaczyna nowy odcinek;
  - z Shift kolejny odcinek zaczyna się na końcu poprzedniego (droga za róg);
  - prawy przycisk, Esc albo „Droga” / „Mur” wybrane jeszcze raz anulują postawiony punkt początkowy,
    a za drugim razem kończą budowę dróg; na dotyku ten przycisk w menu jest jedynym sposobem;
  - podpowiedzi mówią o tym wszystkim.
- Sprawdzone w przeglądarce:
  - wybór → A (start) → B (droga, bez startu) → C (nowy start);
  - „Droga” anuluje start, a drugi raz odkłada narzędzie;
  - z Shift po A, B start zostaje w B.
- Testy 109/109.

## 2026-11-18 · Menu na telefonie poziomo: przewijane, nie ucięte

- Telefon poziomo (ok. 360 px wysokości): menu startowe i menu pauzy były wyższe niż ekran i wyśrodkowane.
  Góra i dół były ucięte, a przewinąć się nie dało.
- Teraz okno menu ma najwyżej wysokość ekranu i przewija się w środku. Na niskich ekranach (do 520 px) ma mniejsze
  marginesy, tytuły i przyciski.
- Sprawdzone na emulowanym Pixelu 7 poziomo: okno od 8 do 352 px przy ekranie 360 px; przewija się do „Graj” i stopki.

## 2026-11-18 · Tab S2 na Bardzo niskiej: lżejszy teren, raport odrzuconego shadera

- Raport z Tab S2 (Adreno 510, WebGL2, Bardzo niska): kilka programów nie chce się zlinkować, a log jest pusty.
  To typowe dla starszych Adreno, gdy shader przekracza zasoby sterownika.
- Pomiar w przeglądarce (79 programów): najwyżej 11 atrybutów, 8 zmiennych z wierzchołka do fragmentu, 6 tekstur,
  czyli w zwykłych limitach. Wyjątkiem jest shader terenu: 60 tys. znaków i 45 odczytów tekstur na piksel.
- **Teren na Bardzo niskiej** (`buildTerrain(..., cheap)`): każdy skan i szum czytany raz zamiast dwóch–trzech razy,
  bez drobnych szczegółów przy kamerze. 16 odczytów zamiast 45, 33 tys. znaków; wygląd prawie ten sam
  (zrzut miasta), a na słabym GPU to też główny koszt każdej klatki.
- **Raport** dla programu, którego nie da się zlinkować, podaje:
  - długość, tekstury, atrybuty i zmienne shadera wierzchołków;
  - długość, tekstury i odczyty tekstur shadera fragmentów;
  - limity GPU (atrybuty, zmienne, uniformy, tekstury, bloki uniformów).
  Następny raport wskaże więc, który shader i który limit.
- Testy 109/109.

## 2026-11-18 · Wybór grafiki z menu był ignorowany

- Tab S2: ustawienia grafiki prawie nic nie zmieniały, a na „Bardzo niskiej” dalej była trawa.
- Przyczyna: `q=…` w adresie (zostawione przez wcześniejsze uruchomienie albo zakładkę, np. `q=high`) miało
  pierwszeństwo przed wyborem w menu. Gra wczytywała więc ustawienie z adresu, a nie wybrane.
- Teraz:
  - wybór z menu wygrywa i trafia do adresu;
  - jest też zapamiętany na urządzeniu (`settings.quality`), więc start z czystego adresu (ikona na ekranie
    głównym) bierze ostatni wybór, a dopiero bez niego domyślne ustawienie urządzenia;
  - menu pauzy pokazuje ustawienie i renderer, które są naprawdę wczytane („Grafika: Bardzo niska (WebGL2)”).
- Sprawdzone w przeglądarce: adres z `q=high` i wybór „Bardzo niska” wczytują Bardzo niską; nowa karta
  z czystym adresem ma zaznaczoną Bardzo niską. Testy 109/109.

## 2026-11-18 · Obrót dwoma palcami w dobrą stronę

- Obracając dwoma palcami zgodnie z ruchem wskazówek zegara, gracz widział mapę obracającą się przeciwnie.
- Rachunek: obrót kamery o d obraca każdy punkt mapy na ekranie o −d (oś y ekranu w dół). Kamera musi więc
  obrócić się o −(kąt palców), żeby mapa szła za palcami (`controls.ts`).

## 2026-11-18 · Grupy budowy przełączały się tylko bez budynku w ręce

- Z wybranym budynkiem (np. Chata) panel przy każdym odświeżeniu (co 0,25 s) wracał do grupy tego budynku.
  Stuknięcie w „Żywność” czy „Surowce” znikało po chwili.
- Teraz grupa otwiera się sama tylko w chwili wybrania nowego budynku (np. skrótem z innej grupy). Potem można
  przeglądać pozostałe grupy z budynkiem w ręce.
- Sprawdzone stuknięciami na emulowanym iPadzie (Osada → Żywność → Surowce → Broń i wojsko → Obrona → Osada).

## 2026-11-18 · Pasek zasobów na tablecie w dwóch rzędach

- W trybie ikon („Aa”) grupy zasobów nie zaczynają już osobnych wierszy (`display: contents`).
  Wszystkie 21 zasobów płynie jednym ciągiem, a ludzie, racje, wojsko, zegar i przyciski prędkości dosuwają się
  do wolnego miejsca w drugim rzędzie.
- Szerokość 1024 px (Tab S2) i 1080 px (iPad 7): 2 rzędy zamiast 4, pasek ma 58 px wysokości.

## 2026-11-18 · Grafika „Bardzo niska” i błędy startu do skopiowania

- Tablet z Adreno 510: obraz lepszy po 1,5 piksela na Niskiej, ale gra mocno się zacina i czasem nie startuje,
  a zrzutu ekranu nie da się zrobić.
- **Nowe ustawienie „Bardzo niska” (`minimal`)**:
  - bez cieni (mapa cieni nie jest liczona), bez trawy, bez przejścia wygładzającego;
  - 1 piksel na piksel CSS; regulator płynności schodzi najwyżej do 0,75.
  - Wybiera się samo na ekranie dotykowym ze słabym układem graficznym: Adreno 3xx–5xx, Mali-T, Mali-G5x, PowerVR
    (nazwa z `WEBGL_debug_renderer_info`). W menu można je zmienić.
  - Scena miasta: 142 wywołania rysowania, bez błędów (WebGL2, SwiftShader).
- **Błędy do skopiowania**:
  - każdy błąd uruchomienia (grafika i inne, utrata kontekstu WebGL) zostaje zapisany na urządzeniu;
  - przy następnym starcie przycisk „Błędy z poprzedniego uruchomienia” otwiera je jako tekst z przyciskiem „Kopiuj”;
  - wczytywanie dłuższe niż 90 s pokazuje raport od razu;
  - minuta gry bez błędów kasuje zapis.
- Testy 109/109.

## 2026-11-18 · iPad: podgląd budowy nad panelem, ostrzejszy obraz

- **Podgląd budynku pod panelem**: Safari po stuknięciu wysyła ruch myszy w miejsce palca, także po stuknięciu
  w przycisk menu. Podgląd budynku stał wtedy pod panelem, a dymek podpowiedzi przy palcu.
  - Teraz po stuknięciu w panel podgląd czeka na środku mapy, a palec na mapie prowadzi go za sobą;
    emulowane ruchy myszy po dotyku są pomijane (`controls.ts`).
  - Dymki „najechania” na dotyku są wyłączone.
  - Ten sam budynek stuknięty ponownie w menu anuluje budowę, bo na dotyku nie ma Esc ani prawego przycisku.
  - Podpowiedź na dole ma wersję dotykową.
- **Rozmyty obraz na Niskiej**: 1 piksel na piksel CSS, a regulator płynności schodził jeszcze do 0,42.
  - Teraz Niska rysuje 1,5 piksela na piksel CSS, a regulator schodzi najwyżej do 2/3 tej wartości,
    czyli nigdy poniżej 1 piksela.
- Sprawdzone na emulowanym iPadzie (Playwright, dotyk): podgląd chaty na środku mapy. Testy 109/109.

## 2026-11-18 · iPad (Safari, WebGL2): za dużo atrybutów wierzchołków

- Raport grafiki z iPada (Safari 18.5, WebGL2): „Attribute location out of range” na pozycjach 16–18.
- Przyczyna: postać ze szkieletem ma 15 atrybutów (pozycja, normalna, kolor, macierz instancji = 4, plus 8 własnych).
  Cel prędkości (velocity) dla wygładzania TRAA dokłada do każdej siatki instancyjnej poprzednią macierz instancji (4).
  Razem 19, a WebGL2 pozwala na 16.
  - Cel prędkości był włączony także na ustawieniu Niska, choć tam służył tylko FXAA.
- Teraz cel prędkości i TRAA (z bloom i wyostrzeniem) działają tylko na WebGPU przy ustawieniu Wysoka.
  Na WebGL2 i na Niskiej scena idzie przez FXAA, a postacie mieszczą się w 15 atrybutach.
- Testy 109/109.

## 2026-11-17 · Tablet z Adreno 510: WebGPU odrzucał potoki

- Raport grafiki z tabletu (Chrome 156, Android 10, Adreno 510 przez WebGPU) pokazał dwa błędy:
  - **„Vertex buffer count (9) exceeds the maximum (8)”**: pikinierzy w zbrojach z kodu (milicja), armaty
    i moździerze miały 8 osobnych buforów wierzchołków plus macierz instancji. Teraz `packVertices` (`armyView.ts`)
    pakuje atrybuty wierzchołków każdej siatki w jeden bufor przeplatany. Żadna siatka w scenie nie ma ich więcej
    niż 7 (sprawdzone przejściem po scenie).
  - **Shader budynków odrzucony** („Invalid ShaderModule fragment_building”). Pierwotny komunikat nie zmieścił się
    w raporcie, a programowy WebGPU (SwiftShader) przyjmuje ten shader bez błędu (146 potoków, gotowe po 31 s).
- **Samoczynne przejście na WebGL2**: gdy WebGPU odrzuci potok lub shader, gra po 4 s zapamiętuje na urządzeniu
  WebGL2 (`marchland.forceWebGL`) i uruchamia się ponownie na nim. Raport pokazuje się dopiero wtedy, gdy błędy są także na WebGL2.
  - Raport zbiera teraz także ostrzeżenia (bez znanych, niegroźnych notatek three.js), bo tam trafiają komunikaty kompilacji shaderów.
- Testy 109/109.

## 2026-11-17 · Działa: ostrzał murów, odrzut, dym i huk

- **Rozkaz „ostrzał”** (`cmdBombard`, rozkaz `bombard`): zaznaczone działa lub moździerze plus prawy przycisk
  na wrogi mur.
  - Podjeżdżają na zasięg, strzelają w to miejsce aż do wyłomu, potem czekają na rozkaz.
  - Inni zaznaczeni idą dalej jak zwykle.
  - Wcześniej działa w ogóle nie mogły celować w mur, a kula armatnia (bez rozprysku) nie niszczyła muru nawet przy trafieniu.
  - Teraz każdy ciężki pocisk (`WALLS.breakingShotMin` = 10 obrażeń oblężniczych) kruszy mur w miejscu upadku.
  - Strzały łuczników nadal nie.
- **Panel dział**: „strzelaj sam / na rozkaz” i podpowiedź, jak wydawać im rozkazy (wcześniej panel dla dział był pusty).
- **Wystrzał**:
  - działo odskakuje 0,9 m przy strzale i wraca w ciągu 1,6 s (moździerz prawie stoi);
  - błysk u wylotu lufy, a potem ławica białego dymu prochowego, która puchnie, wznosi się i rzednie przez 4,5 s
    (moździerz wyrzuca słup w górę; `shotSmokeView.ts`);
  - dźwięk z syntezy: trzask, przetaczający się huk (szum za zamykającym się filtrem dolnoprzepustowym)
    i spadające w tonie uderzenie; moździerz brzmi głucho i niżej.
- Bramy mają w tekstach 10 m.
- Test: wrogie działa robią wyłom w murze gracza, nie celują we własny mur, a piechota nie dostaje rozkazu ostrzału. Testy 109/109.

## 2026-11-17 · Zwierzęta, wozy, szare budowy, większa mapa, kolczugi, menu na tablet

- **Zwierzęta**: kanciaste świnie i konie zniknęły z modeli chlewni i stajni (`buildings.py`,
  `buildingGeometry.ts`). Nowy `src/render/animalsView.ts`:
  - w chlewni 3–5 świń z modelu (`props/pig.json`) chodzi po zagrodzie i odpoczywa, omijając koryto i słomę;
  - w stajni 2–3 konie jazdy (`warhorse.json`, kości) chodzą, stoją i skubią trawę;
  - każde zwierzę ma własny zegar, a kolejne miejsca wynikają z hasza: bez stanu w symulacji.
- **Wozy**: koń przy wozie (poziom transportu 3) to ten sam animowany koń; krok liczony z drogi tragarza, na postoju stoi.
  - Wozy trzymają odstęp (`CARTS` w config): wóz staje, gdy inny wóz jego miasta jest do 5,5 m przed nim
    (taczka 2,6 m), w tym samym pasie, jadąc w tę samą stronę albo stojąc.
  - Wozy z naprzeciwka mijają się, a po 4 s czekania wóz i tak jedzie dalej, więc kolejka nie stoi w nieskończoność.
  - Koszt: pary wozów jednego miasta raz na krok symulacji, kilkadziesiąt sztuk.
- **Budowa na szaro**: budynek w budowie jest wyszarzony (kolor odbarwiony o 85%) aż do ostatniej warstwy.
- **Większa mapa**: obszar gry 680 m zamiast 560 m przy tych samych miejscach zamków.
  - Za zamkiem w rogu jest ok. 100 m terenu zamiast 40 m.
  - Pas terenu za mapą zwężony z 320 m do 120 m, a kamienie, krzaki i drzewa ozdobne do 60–100 m.
  - Las w obszarze gry jest losowany jak dotąd (to samo ziarno, ta sama kolejność).
  - Kamera sięga 1430 m.
- **Kolczugi przestały powstawać**: zamówienie wyposażenia oddziału (np. armaty: żelazo) zamieniało
  nielimitowane żelazo w zamówienie na liczbę sztuk. Po jego wykonaniu huta stała na „0”, a płatnerz czekał na żelazo.
  - Teraz zamówienie oddziału nie ogranicza surowców bez limitu.
  - Warsztat z zamówieniem 0 pracuje dalej, gdy jego towaru potrzebują otwarte zamówienia dalej w łańcuchu
    (`wantedForOrders`: 36 kolczug = 72 żelaza, minus zapas).
- **Leśnik szkodził**: podlewając sadzonkę posadzoną przed chwilą przez drwala, cofał jej czas posadzenia
  przed ścięcie drzewa. Gra brała ją wtedy za goły pień i leśnik sadził od nowa.
  - Teraz oba zegary cofają się razem.
  - Test liczy całe odrośnięte drewno.
- **Brama** ma 5 kratek (10 m) zamiast 3: front oddziału (6 szeregów) przechodzi bez tłoku; model jest rozciągnięty.
- **Tablet**:
  - pasek zasobów przełączany przyciskiem „Aa” (same ikony albo z nazwami; na ekranie dotykowym startuje z ikonami);
  - budowa w pięciu grupach (Osada, Żywność, Surowce, Broń i wojsko, Obrona i drogi);
  - × zamyka komunikat u góry do czasu zmiany treści, a dotknięcie powiadomienia je chowa;
  - ustawienie Niska rysuje 1 piksel na piksel CSS (na iPadzie 4× mniej pikseli);
  - modelowani mieszczanie także na Niskiej, zamiast klocków.
- **Raport grafiki**: gdy w pierwszych sekundach przeglądarka zgłosi błąd grafiki (shader, utracony kontekst),
  gra pokazuje okienko do zrobienia zrzutu: renderer, GPU, przeglądarka i komunikaty.
  - Przycisk „WebGL2” uruchamia grę ponownie z `?gl`.
  - `?gfxreport` pokazuje okienko zawsze.
- Testy 108/108.

## 2026-11-17 · Poprawki budowania: granica mapy, leśnik i myśliwy

- Chata obok zamku „za daleko”: zamek w rogu (−232, 232) ma tylko ok. 40 m do brzegu terenu, na którym wolno
  budować (280 m od środka mapy), a teren rysuje się dalej bez granicy. Teraz poza tym obszarem ziemia jest
  ciemniejsza i bardziej szara, a komunikat brzmi „Poza mapą” (`offMap`) zamiast mylącego „Za daleko: buduj w
  zasięgu zamku”.
- Leśnik i myśliwy dostawali wymóg drwala (las do 26 m i co najmniej 20 dorosłych drzew) i jego komunikat.
  Teraz wystarczy im las do 40 m od skraju (`TOWN.woodsReachM`), z własnym komunikatem (`needsWoods`);
  drwal bez zmian. Łączenie oddziałów stojących za daleko od siebie ma swój komunikat (`apart`) zamiast
  tekstu o budowaniu.
- Test: na łące 30–38 m od lasu leśnik i myśliwy mogą stanąć, drwal dostaje „needsForest”. Testy 107/107.

## 2026-11-17 · Twierdza do misji 5: „Medieval Castle”

- Model od właściciela projektu: „Medieval Castle”, Uğur Yakışık (Sketchfab, CC BY 4.0), 64 tys. trójkątów,
  skompresowany Draco i Meshopt (Blender w kontenerze nie ma tych dekoderów: rozpakowany narzędziem
  glTF-Transform). Mury z czterema basztami, brama z dwiema basztami i barbakanem nad fosą, schody na
  mury, donżon z czterema wieżyczkami i iglicą na dużym dziedzińcu.
- `tools/blender/convert.py castle` → `public/buildings/fortress_1.glb`: kamień ciosany w odcieniu murów gry,
  schody z kamienia łamanego, drewno mostu i drzwi; bez stosów kul i płyty gruntu (dziedziniec to teren gry);
  30 tys. trójkątów, 1,1 MB, 130 × 112 m, 48 m z iglicą. Rodzaj „fortress” nie jest budynkiem miasta: gra go
  nie wczytuje, dopóki nie postawi go misja 5.

## 2026-11-17 · Kampania, etap 1: misje 1 i 2, armia 200, oddziały do 20

- **Tryb „Kampania”** w menu: lista pięciu misji z gwiazdkami (następna odblokowana po wygraniu
  poprzedniej, 3–5 „wkrótce”) i odprawą. Misja ładuje się z własną mapą i miejscem zamku z adresu
  (`?mode=campaign&mission=N`), jak każda gra.
- **`src/sim/campaign.ts`**: scenariusz misji nad zwykłą grą. Na start gotowe miasto (chaty, zagrody, młyn,
  piekarnia, drwal, kamieniołom, kopalnia, huta, kuźnia, w misji 2 także koszary, chlewnia, garbarnia,
  płatnerz) z drogami do zamku; wróg bez miasta (`Town.absent`: bez zamku, bez żołdu); cele i gwiazdki.
- **Misja 1, Trybut** (Przeprawa): najeźdźca 10 oddziałów × 20 (ciężka jazda, miecznicy, halabardnicy,
  kusznicy) obozuje za rzeką, 64 % drogi do drugiego zamku. Pasek u góry: 600 złota, 200 chleba, 40 broni,
  ile już jest w zamku, odliczanie 15 min i przycisk „Zapłać trybut”. Po terminie najeźdźca rusza na miasto:
  w teście 8 oddziałów obrony przegrało 6 z 6 razy (szansa ≤ 10 %, o co prosił właściciel). Druga gwiazdka:
  co najmniej 4 oddziały w chwili zapłaty.
- **Misja 2, Obóz za rzeką**: 3 oddziały w obozie, 2 zagony na flankach; co 5 minut jeden zagon wraca do
  obozu. Wygrana, gdy nie zostaje żaden oddział wroga; druga gwiazdka: straty poniżej 30 %.
- **Armia 200 i oddziały do 20** (`Town.armyCap`, `Regiment.maxMen`): werbunek jak dotąd (12 pieszych, 8
  jeźdźców), uzupełnianie przy koszarach do 20 (nowe miejsca w szyku dochodzą same), **łączenie** dwóch
  oddziałów tego samego rodzaju stojących do 30 m od siebie poza walką (`cmdMerge`, przycisk „Połącz” w
  panelu): ludzie przechodzą do większego do 20, doświadczenie i morale ważone ludźmi.
- **Przenoszenie**: po wygranej do 8 najsilniejszych oddziałów (rodzaj, ludzie, doświadczenie) i połowa złota
  (do 800) idą do następnej misji; postęp na urządzeniu (`marchland.campaign`), osobno od zapisu gry.
- Pasek misji odświeża się co sekundę gry (wcześniej co 60. krok, który przy kilku krokach na klatkę
  wypadał rzadko); paski stoją nad chorągiewkami oddziałów i nie zasłaniają liczników.
- Sprawdzone w przeglądarce: menu kampanii, start misji 1 (miasto, 24/200, najeźdźca na minimapie), pasek
  trybutu, zapłata, ekran końca z gwiazdką, zapisany postęp z misją 2. Testy 106/106 (nowe:
  `tests/campaign.test.ts`); WebGPU w bitwie: 0 błędów, 151 potoków.

## 2026-11-17 · Marsz albo bieg: przełącznik tempa

- W panelu zaznaczonego wojska wiersz **Tempo: Marsz | Bieg**, na klawiaturze **B**. Zmienia tempo od
  razu dla zaznaczonych oddziałów w drodze (`cmdPace`) i dla kolejnych rozkazów gracza; dwa kliknięcia
  nadal zawsze wysyłają biegiem, a do ataku podchodzi się biegiem jak dotąd. Działa też na dotyku (iPad),
  gdzie dwuklik był niewygodny. Działa nie biegną. Na karcie oddziału stan „biegnie” zamiast „maszeruje”.
- Animacje szły za tym już wcześniej: piechota gra chód w marszu i bieg w biegu (klip biegu od połowy
  między szybkością marszu a biegu). Konie galopują w obu tempach (wolniej w marszu, 3,6 m/s, pełnym
  galopem w biegu, 7,5–8,5 m/s), bo w nagraniu konia nie ma kłusu, a stęp jest za wolny na marsz jazdy;
  sprawdzone w nagraniu: galop, stęp, postój, skubanie, bez kłusu.
- Bieg męczy (cienki pasek pod morale), a zmęczenie obniża szybkość i walkę, jak dotąd.
- Test: oddział w marszu po rozkazie biegu wyprzedza drugi o ponad 15 m w 20 s i się męczy, po powrocie
  do marszu przestaje; działo odmawia biegu. Testy 95/95.

## 2026-11-17 · Playbook, pełny spis assetów, paczka gotowych assetów

- `docs/PLAYBOOK.md`: jak gra jest zrobiona, z odnośnikami do plików: architektura, renderer i światło,
  teren i skany powierzchni, trawa i las, przenoszenie ruchu Mixamo (`rigged.py` krok po kroku), własne
  animacje (`baked.py`, `horsefall.py`), skinning setek postaci na GPU (tekstura klatek, 8 buforów),
  mieszkańcy, budynki z Blendera i etapy budowy, zasady assetów, pomiary, wydanie offline, tabela pułapek
  z rozwiązaniami i kolejność pracy nad nową grą z gotowych assetów.
- `docs/ASSETS.md`: spis wszystkich plików w grze z trójkątami, kośćmi i klipami.
- **Paczka assetów** (`asset-pack/`, `tools/pack-assets.mjs` → `asset-pack-out/marchland-assets.zip`, 61 MB,
  zip 28,6 MB): modele i animacje, 18 skanów powierzchni, loader three.js (`rigged`, `body`, `mount`,
  `prop`, `building` z triplanarem ze skanów), strona z każdym modelem i klipem (three.js r186 w środku,
  działa bez internetu), skrypty Blendera, playbook, opis formatów, podpisy i zasady licencji (Mixamo: nie
  publikować paczki jako osobnych assetów). Sprawdzone w Chromium (WebGL2): żołnierze, mieszczanie, koń w
  galopie z jeźdźcem, działa, wozy, budynki ze skanami.
- `.exe`: proces publikacji uruchamiany ręcznie; wydanie wymaga zgody na zapis dla Actions (403), a plik
  (102 MB po kompresji maksymalnej) przekracza limit 100 MB na gałąź `gh-pages`.

## 2026-11-17 · Propozycja kampanii

- `docs/CAMPAIGN.md`: pięć misji właściciela projektu (trybut, obóz za rzeką, odbicie osady, odbudowa i
  wielka armia, twierdza) zbudowanych z tego, co gra ma; dwie nowe mapy (*Dolina*, *Twierdza*), miejsca
  startu ze scenariusza, sześć nowych mechanik (scenariusz z wyzwalaczami, trybut, obóz bez miasta, armia
  200 / oddział 20 z łączeniem, przejęcie osady i ruiny, mury scenariuszem) i cztery pytania do decyzji.

## 2026-11-17 · Gra offline: iPad z ekranu początkowego, Windows jako .exe, aktualizacje różnicowe

- **Tryb offline** (`src/ui/offline.ts`, `tools/pwa/`): po budowie powstaje `dist/sw.js` z listą wszystkich
  plików gry (161) i skrótem każdego. Przy pierwszej wizycie service worker zapisuje grę na urządzeniu
  (lokalnie ok. 1,5 s; z sieci zależy od łącza, ~56 MB). Nowa wersja instaluje się w tle do własnej pamięci:
  niezmienione pliki kopiuje ze starej, pobiera tylko zmienione. Włącza się przy następnym uruchomieniu albo
  od razu z paska „Pobrano nową wersję gry — Uruchom teraz”. Zapisy gry zostają. Na localhost wyłączony
  (narzędzia pomiarowe), chyba że `?sw`.
- Sprawdzone w Chromium: instalacja 162 wpisów; gra startuje (`__ready`) przy odciętej sieci, 113 odpowiedzi
  z pamięci; po zmianie jednego pliku aktualizacja pobrała tylko `sw.js` i ten plik, przycisk przełączył na
  nową wersję, stara pamięć usunięta. Poprawka po drodze: dopasowanie bez `Vary` (moduł JS prosi z
  nagłówkiem Origin, którego zapisana kopia nie miała).
- **Ikona i manifest**: tarcza z wieżą (`public/icons/`), `manifest.webmanifest`, znaczniki Apple (pełny
  ekran z ekranu początkowego iPada).
- **GitHub Pages** (`.github/workflows/marchland-web.yml`): każdy push do `main` z Marchland publikuje
  https://anbow1.github.io/FPS/marchland/ przez gałąź `gh-pages` (jeden commit, nadpisywany). Pierwsza
  wersja z artefaktem Pages padła: limit miejsca na artefakty Actions na koncie jest wyczerpany, a gałąź go
  nie używa. Jednorazowo trzeba włączyć Pages: źródło „Deploy from a branch”, `gh-pages`, `/ (root)`.
- **Windows** (`desktop/`, `.github/workflows/marchland-desktop.yml`): Electron 45 jako okno na ten adres;
  `Marchland.exe` (przenośny, 110 MB, bez podpisu) w wydaniu *marchland-windows*. Sprawdzone pod Xvfb:
  pierwsze uruchomienie zapisało 162 pliki w 2 s; z wyłączonym serwerem gra wstaje z dysku; bez internetu
  przy pierwszym starcie — strona z prośbą o połączenie i ponowną próbą. Build .exe działa na Linuksie
  (bez Wine).
- Testy 94/94.

## 2026-11-17 · Trzy mieszczanki zamiast jednej

- Dwie nowe kobiety w mieście, z tymi samymi klipami co reszta ludzi: „.Fuse Woman 1” (Leonardo Carvalho,
  CC BY 4.0, brązowa sukienka i wysokie buty; bez barw strony, bo brąz z niebieskim dawał fiolet) i „Girl with
  clothes. Worker set” (cattleya, CC BY 4.0, lniana koszula i portki, odrobina barw strony). Co trzecia osoba
  to kobieta, na zmianę jedna z trzech (Revna, sukienka, robotnica).
- `rigged.py` czyta szkielet z własnym przedrostkiem przed nazwami Mixamo (`girlBone_LeftArm`).
- Testy 94/94; WebGPU w mieście: 0 błędów, 151 potoków (było 147: każde ciało kompiluje swoje).

## 2026-11-17 · Pikinierzy pchają oburącz z biodra (Bayonet Stab)

- Cios pikinierów to teraz Mixamo „Bayonet Stab”: wypad do przodu z bronią oburącz na wysokości bioder (dotąd
  „Stabbing”, pchnięcie znad głowy). W klipach karabinowych staw miecza nie leży wzdłuż broni, więc
  `rigged.py --two-hand-clips stab` kładzie pikę na linii od prawej do lewej dłoni. W pchnięciu grot wychodzi
  3,4 m przed pikiniera na wysokości ~1 m; tę klatkę gra wybiera też na szyk z pikami opuszczonymi.
- Testy 94/94.

## 2026-11-17 · Koń pada naprawdę: upadek z drugiego konia MAXDESIGN-3D

- Przesłany „Horse” (MAXDESIGN-3D, CC BY 4.0) to inny koń tego autora z jedną 9-sekundową animacją: galop,
  postój, **upadek na bok** (klatki 97–147) i znowu galop. Jego szkielet (70 kości bez nazw) i siatka różnią się
  od konia w grze, więc upadek przeniesiony skryptem `tools/blender/horsefall.py`: obroty odczytane ze stawów
  (zad i kłąb z linii bioder lub łopatek i kręgosłupa, każda noga, szyja i ogon z kierunku odcinka) i nałożone
  na szkielet konia w grze od bioder w dół, biodra przesuwane jak u tamtego konia, każda klatka postawiona na
  ziemi. Dwie wcześniejsze próby odrzucone: macierze kości tego pliku nie zgadzają się z tym, co robi jego siatka
  (odbity obiekt nadrzędny), a dopasowanie przez najbliższe wierzchołki rozrywało konia.
- Klip `fall` (25 klatek, ~1 s) w `warhorse.json`: koń wali się łbem do przodu i ląduje na boku z podkurczonymi
  nogami; jeździec idzie w dół razem z nim. Końcówka źródła (zad przetoczony, nogi w górze) ucięta. Zastępuje
  obliczony przewrót całej bryły; bez klipu gra przewraca konia jak dotąd.
- `baked.py`: szkielet z kośćmi bez nazw (bez „head”) już nie przerywa wypiekania; położenie szkieletu czytane
  w każdej klatce (animowany obiekt nadrzędny).
- Testy 94/94; WebGPU w bitwie: 0 błędów, 147 potoków.

## 2026-11-17 · Jeźdźcy: Paladin z Mixamo w siodle

- Przesłany „Stabbing” ze skórą to ten sam ruch, co pchnięcie pikinierów (klatki identyczne), ale z postacią
  **Paladin J Nordstrom** pobraną wprost z Mixamo — zamiast odrzuconego „Portugese Knight” (to była ta sama
  postać wrzucona ponownie). Paladin zastępuje w siodle najstarszego, sztywnego rycerza Xali: hełm
  garnczkowy, ciemna płyta ze złotymi obszyciami, nad nią jak dotąd wapenrok w barwach strony.
- `rigged.py --seated`: zamiast klipów jedna poza — uda 45° do przodu i 20° na boki koni, łydki prawie
  pionowo w długich strzemionach, prawe przedramię do kopii, lewe do wodzy pod tarczą — zapisana w formacie
  jeźdźca (`BodyModel`: części ciała i stawy, `soldierGeometry.ts`). Ręce dalej uderzają wokół barku.
  `--gain 2.5` rozjaśnia oczernioną stal, żeby z kamery nie była sylwetką.
- `rigged.py` ogólnie: pomija siatki związane tylko ze stawami broni (własny miecz i tarcza postaci z Mixamo,
  niezależnie od nazwy siatki — u Paladina nazwy są pomieszane), a bez mapy metaliczności czyta mapę odbić
  (specular) jako to, ile metalu widać.
- Testy 94/94; WebGPU w bitwie: 0 błędów, 147 potoków, 179 modułów shaderów.

## 2026-11-17 · Miecznicy w pełnej zbroi; tarcza trójkątna u żołnierzy ze szkieletem

- Miecznicy na „Medieval Knight (Sculpture)” (by__Rx, CC BY 4.0): pełna płytowa zbroja ze złotą przyłbicą.
  Halabardnicy zostają na dotychczasowym rycerzu — teraz obie formacje różnią się z daleka. „Hospitalier
  Knight” sprawdzony jako halabardnicy i odrzucony (bez hełmu, białe nogawice: wyglądał współcześnie).
- Tarcza żołnierzy ze szkieletem (`rigged.py`): zamiast dwóch prostopadłościanów tarcza trójkątna — płaska
  u góry, boki zbiegają się w szpic, lico w barwach strony na drewnianym spodzie. Każdy trójkąt sam
  sprawdza, w którą stronę patrzy (bez zgadywania kolejności wierzchołków). Na zrzucie szpicem w dół.
- Testy 94/94; WebGPU 0 błędów; bitwa: 147 potoków.

## 2026-11-17 · Jeździec jedzie w takt konia (bez klipu jazdy)

- Mixamo nie ma animacji jazdy konnej (jest tylko siedzenie na krześle, nogi razem, do konia nie pasuje), więc
  jazda jest liczona: do kości konia dochodzi jedna — jeźdźca — wyliczona klatka po klatce z kości grzbietu
  i obrotu wokół bioder jeźdźca (szczyt grzbietu). W galopie pochyla się do przodu (~8°) i buja ±5° raz na
  każdy skok konia, w stępie lekko, dwa razy na krok; na postoju i przy skubaniu trawy siedzi prosto. Cios
  ramienia z bronią działa jak wcześniej, na tym.
- Testy 94/94.

## 2026-11-17 · Kusznicy: prawdziwy strzał (Firing Rifle)

- Strzał kusznika to teraz klip „Firing Rifle” z Mixamo (1,2 s: wymierzona broń, strzał, odrzut) zamiast
  przyłożenia puszczonego od końca. Kolejność jak u łuczników: tuż przed strzałem podnosi kuszę do celu
  („Rifle Down To Aim”), strzela z odrzutem, a między strzałami trzyma ją opuszczoną. Kusza, jak
  wcześniej, złożona z pozy wymierzenia; na zrzucie poziomo na wysokości barku.
- Testy 94/94.

## 2026-11-17 · Pięć postaci w mieście; włosy bez artefaktów

- Mieszczanie mają cztery ciała na zmianę (dotychczasowy .Fuse Civilian 2, brodaty .Fuse Civilian 1, Svend
  w wełnianej i w lnianej tunice), a co trzecia osoba to Revna w wełnianej tunice (zamiast Eriki z Mixamo,
  która wyglądała jak łuczniczka). Wszystkie z tymi samymi 11 klipami; ubrania tylko lekko (15%) w barwach
  strony, żeby miasto nie było jednolicie niebieskie. Jeden materiał i jedna tekstura kości (klatki ciał
  jedna pod drugą), więc kolejne ciało to kolejne wywołanie rysowania, ale bez nowej tekstury.
- `rigged.py`: postacie na szkielecie Unreala (pelvis, spine_01, clavicle_l, thigh_l…) czytane jako
  Mixamo; postać wyeksportowana „na leżąco” (szkielet obrócony o 90°) jest stawiana pionowo wzdłuż linii
  biodra–głowa (wcześniej wychodziła na 14 m); siatka związana daleko poza szkieletem (u Svendów włosy
  albo broda) jest pomijana; bez tekstury kolor materiału, matowy.
- Artefakty wokół głów: włosy, brody i wąsy to karty z przezroczystą teksturą, a wypiekacz uśredniał też
  przezroczyste teksele między pasmami (przypadkowe kolory) — głowy były w cętki. Teraz liczą się tylko
  kryjące teksele, a karta bez żadnego dostaje średni kolor pasm. Przepieczone: mieszczanie, mieszczanka,
  łucznicy, pikinierzy, kusznicy i kowal.
- Testy 94/94; WebGPU 0 błędów; miasto: 147 potoków (+6: three.js kompiluje na każde ciało osobno mimo
  wspólnego materiału).

## 2026-11-17 · Czaprak i opończa dopasowane do ciała, tarcza w kształcie, ciemna grzywa

- Czaprak (lekka jazda) i kropierz (ciężka jazda, od piersi po zad, ze złotym obrębieniem) nie są już
  pudełkami: to trójkąty skóry samego konia z obszaru, który przykrywa tkanina, odsunięte o 2,5–3,5 cm
  wzdłuż normalnych i na tych samych kościach — leżą na koniu i ruszają się z nim w galopie.
- Opończa jeźdźca to trójkąty jego tułowia i ud (bez ramion), od połowy uda do kołnierza, 2 cm nad
  zbroją, w barwach strony — zamiast dwóch płaskich płyt z przodu i z tyłu.
- Tarcza (wszystkie postacie z tarczą rysowane z kodu, także jeźdźcy): tarcza trójkątna — płaska u góry,
  boki zbiegają się w szpic, wygięta do przodu, ze stalowym obrzeżem — zamiast prostopadłościanu.
- Grzywa i ogon zrobiły się białe, gdy `baked.py` przestał brać przezroczyste teksele: tekstura włosia
  jest w 99% przezroczysta, a karty włosów trafiają w jasne puste miejsca. Teraz wierzchołek bez żadnego
  kryjącego teksela bierze średni kolor pasm (kryjących tekseli obrazu) — ciemny brąz.
- Testy 94/94; WebGPU 0 błędów; bitwa: 141 potoków.

## 2026-11-16 · Mieszczanki

- Co trzecia osoba w mieście to kobieta: Erika Archer z Mixamo (przysłana razem z „Box Walk Arc”),
  wypieczona tym samym `rigged.py` i tymi samymi 11 klipami co mieszczanin (noszenie, kopanie, łowienie,
  rąbanie, młot, żniwa…), druga instancjonowana siatka ze szkieletem. Kto jest kobietą, widok ustala przy
  pierwszym spotkaniu danej osoby — nie zmienia się, gdy inni umierają.
- `rigged.py` czyta teraz postać z FBX (Mixamo), teksturę koloru bierze po połączeniu z shaderem (nazwy obrazów
  w FBX nic nie mówią), a `--team-below` farbuje w barwy strony tylko ciemne teksele: jej ciemnooliwkowa skóra
  bez tego wyglądała z kamery jak czarna sylwetka; skóra twarzy i włosy zostają swoje.
- Testy 94/94; WebGPU 0 błędów; miasto: 141 potoków (+2: druga siatka ludzi i jej cień).

## 2026-11-16 · Konie jazdy ze szkieletem: postój, stęp, galop, skubanie trawy

- Lekka i ciężka jazda dosiada konia „Horse” (MAXDESIGN-3D, CC BY 4.0) na jego własnych kościach
  (`soldiers/warhorse.json`, 40 kości, ~3 000 trójkątów). Jedno nagranie z pliku pocięte na pętle
  znalezione przez porównanie póz klatka po klatce: galop co 16 klatek (dokładna pętla), stęp co 33,
  postój z rzutem głowy (62) i skubanie trawy (151).
- `baked.py` umie teraz: kilka klipów z jednego nagrania (`--clips`), wyśrodkowanie zwierzęcia (`--centre`),
  miejsce siodła (`--saddle`), drogę na pętlę z kopyt stojących na ziemi (`travelM`: stęp 0,95 m, galop
  3,56 m), kolor tekstury także przez węzeł mieszania (tekstura × kolor wierzchołków) i pomija
  przezroczyste teksele kosmyków (grzywa i ogon nie są już w białe pasy).
- Jeździec (siedzący rycerz), jego broń, tarcza, opończa i nowy czaprak w barwach strony są
  przypięte do kości grzbietu — jadą z koniem i kołyszą się z nim; ramię z bronią nadal uderza.
  Koń idzie stępem do 1,8 m/s, wyżej galopuje (cykl jak 3 m drogi, żeby szarża nie szła w zwolnionym
  tempie); w spoczynku co trzeci koń skubie trawę. Zabity koń pada na bok razem z jeźdźcem.
- Bez pliku jazda wraca do konia w zbroi z nogami poruszanymi w kodzie.
- Testy 94/94; WebGPU 0 błędów; bitwa: 139 potoków.

## 2026-11-16 · Etapy budowy: fundament, ściany, rusztowanie, dach na końcu

- Budynek w budowie nie jest już spłaszczonym budynkiem, tylko tym samym modelem uciętym na wysokości,
  do której doszła budowa: przez pierwsze 12% pracy stoją fundamenty (0,35 m murów), potem ściany
  rosną warstwami aż po dach, który dochodzi ostatni. Jeden materiał dla wszystkich placów budowy
  odrzuca to, co leży powyżej wysokości danego placu (`maskNode` z jednolitą zmienną odczytywaną dla
  każdego obiektu; cień przycięty tak samo).
- Od chwili, gdy ruszą ściany, wokół stoi rusztowanie: słupy co ~2,4 m pół metra od ścian, pomosty
  z desek z poręczą co 1,6 m, drabina od frontu; sięga ~1,4 m ponad ułożone warstwy. Rusztowanie
  mierzone jest z bryły budynku (to, co powyżej 45% wysokości), nie z całego placu — inaczej obejmowało
  stosy, płoty i stragany. Śmigła młyna ruszają dopiero po ukończeniu.
- Testy 94/94; WebGPU 0 błędów; miasto: 139 potoków (+2: materiał placu budowy i jego cień).

## 2026-11-16 · Obsługa dział jako postacie ze szkieletem

- Przy armacie stoi dwóch, przy moździerzu trzech mieszczan (ta sama postać co w mieście,
  `people/townsman.json`, tunika w barwach strony) — jedna instancjonowana siatka ze szkieletem dla
  obsługi wszystkich dział. W marszu idą obok działa (klip `walk` w takt kroku), po strzale ładują
  (podnoszą i wkładają: `pickup` + `putdown`, każdy z innym przesunięciem), poza tym stoją (`idle`).
  Gdy działo zginie, jego obsługa znika razem z nim.
- Bryłowa obsługa (pudełka) zostaje tylko na wypadek braku pliku postaci.
- Testy 94/94; WebGPU 0 błędów; bitwa: 137 potoków.

## 2026-11-16 · Komputer korzysta z nowych budynków; limit 64 budynków

- Komputer stawia na końcu listy (po rozbudowie gospodarki i wojska): kaplicę, studnię, targ, browar,
  karczmę, myśliwego i leśnika. Na targu sprzedaje po 10 sztuk tego, czego ma ≥ 120 (zboże, mąka,
  winogrona, wino, piwo, skóry, ruda, kiełbasy — nigdy drewna, kamienia, desek, chleba ani uzbrojenia),
  gdy złota ma mniej niż 120.
- Limit budynków na stronę 48 → 64: przy nowych rodzajach komputer stawał na 48 (nie postawił
  studni ani dalszych), gracz też szybko by go dobił. W 70-minutowej partii komputer–komputer obie
  strony mają wszystkie nowe budynki (54 budynki), w karczmach przybywa piwa.
- Tempo z bezczynnym graczem bez zmian: 36,6 / 40,3 min. Testy 94/94; WebGPU 0 błędów.

## 2026-11-16 · Kusznicy: strzał na końcu przyłożenia, kusza w obu rękach

- Strzał pada na końcu „Rifle Down To Aim” (podniesienie do celu kończy się w chwili strzału); po
  strzale kusznik trzyma kuszę w celu przez 30% czasu ciosu, potem ją opuszcza — ten sam klip od końca
  (klip `lower`). Wcześniej po strzale klip szedł od nowa: kusza najpierw opadała, potem znów szła w górę.
- Kusza celowała w górę: klipy z karabinem trzymają broń w dłoni inaczej niż miecz, więc stały kierunek
  „jak miecz” był zły. Teraz `rigged.py` liczy kierunek kolby z ostatniej klatki celowania (od prawej
  dłoni do lewej), przelicza go do układu prawej dłoni w pozie spoczynkowej i składa kuszę z obróconych
  brył (`add_oriented_box`): kolba wzdłuż, łuczysko w poprzek, poziomo. Na zrzucie: poziomo na
  wysokości barku.
- Testy 94/94; WebGPU 0 błędów.

## 2026-11-16 · Kusznicy na własnej postaci

- Kusznicy: „.Fuse Warrior” (jak pikinierzy, górna zbroja w barwach), kusza z gry w prawej dłoni
  (kolba, stalowe łuczysko, cięciwa; `rigged.py --arms crossbow`). „Rifle Down To Aim” (Mixamo)
  jako przyłożenie do celowania przed strzałem i ponowne po strzale; marsz „Rifle Walk”, postawa
  z łucznikowej paczki, trafienie i śmierci z zestawu miecza i tarczy.
- Pasek zasobów ma teraz trzy rzędy (doszły deski i piwo).
- Testy 94/94; WebGPU 0 błędów (bitwa); zrzut z bliska.

## 2026-11-16 · Browar, karczma, kaplica, studnia

- Nowy towar **piwo**. **Browar** (60 złota, 25 drewna, 10 kamienia): 2 zboża → 2 piwa na 8 s.
  **Karczma** (80/30/10): karczmarz sprzedaje piwo, 1 piwo → 2 złota na 5 s — dochód poza podatkiem.
- **Kaplica** (120 złota, 20 drewna, 50 kamienia; bez pracownika): dopóki stoi, każdy oddział strony
  ma +6 do górnej granicy morale (`CHAPEL.morale`; jedna wystarczy, więcej nie sumuje się).
- **Studnia** (25 złota, 15 kamienia; bez pracownika): chaty w promieniu 40 m przyjmują nowych
  mieszkańców po ¾ zwykłego czasu (`WELL`); kiedyś będzie gasić pożary.
- Wygląd z kodu: browar z kotłem i beczkami, karczma z ławami, szyldem i beczkami, kamienna kaplica
  z dzwonnicą i murkiem cmentarza, studnia z daszkiem, wiadrem i korytem. Ikona piwa; ładunek to beczka
  w jaśniejszym odcieniu. Komputer tych budynków nie stawia.
- Testy: kaplica podnosi morale o 6; browar + karczma robią piwo i złoto; chata przy studni zapełnia
  się szybciej. Testy 94/94; WebGPU 0 błędów.

## 2026-11-16 · Targ

- **Targ** (80 złota, 40 drewna, 20 kamienia; bez pracownika): w jego panelu przy każdym towarze
  ikona, zapas i dwa przyciski — sprzedaj 10 (za 60% wartości) albo kup 10 (za 160%). Wartości
  w `MARKET.value` (drewno 1, deski 2, kamień 1,5, chleb 2, żelazo 5, broń 8, kolczuga 12, koń 15…);
  złota się nie kupuje. Wyjście z zatoru (brak rudy, nadmiar zboża), nigdy zysk: kupno i sprzedaż
  w kółko zawsze traci złoto. Komputer z targu nie korzysta.
- Test: przed postawieniem „Potrzebny targ”, sprzedaż i kupno zmieniają zapasy i złoto o ceny lotu,
  obrót w kółko traci. Testy 92/92; WebGPU 0 błędów; zrzut panelu.

## 2026-11-16 · Tartak i deski

- Nowy towar **deski** i **tartak** (60 złota, 30 drewna, 10 kamienia; 2 drewna → 2 deski na 6 s).
  Od poziomu 2 każdy budynek bierze połowę drewna w deskach (`buildingCost`); tragarze noszą deski na
  plac budowy jak drewno i kamień. Ikona desek, ładunek to deski z KayKit w jaśniejszym odcieniu.
  Stare zapisy dostają zerowe deski we wszystkich składach.
- Komputer: tartak na końcu listy budowy, przed fazą ulepszeń. Postawiony wcześnie (zaraz po
  koszarach) zjadał rzadkie drewno, pracownika i tragarzy na deski, których nikt jeszcze nie
  potrzebował — komputer wygrywał dopiero w 47,6 min. Po przesunięciu: 36,6 / 40,3 min jak wcześniej.
- Poprawka po pomiarze: pasek zasobów ma stałe grupy i deski do nich nie trafiły — strona rzucała
  błąd przy każdej klatce. Deski są teraz obok drewna, a towar spoza grup jest pomijany, nie fatalny.
- Test: deski z drewna; koszt poziomu 2 dzieli drewno pół na pół. Testy 91/91; WebGPU 0 błędów.

## 2026-11-16 · Myśliwy i leśnik

- **Myśliwy** (40 złota, 10 drewna; przy lesie): wychodzi w las w okolice punktu, na który patrzy
  chata — za każdym razem w inną stronę (14 m od niego) — poluje 22 s i wraca z tuszą: 2 mięsa
  i 1 skóra do obejścia. Mięso i skóry przed chlewnią.
- **Leśnik** (35 złota, 10 drewna; przy lesie): w promieniu 50 m od chaty sadzi przy gołych pniakach
  i pielęgnuje sadzonki (każda wizyta 6 s przyspiesza wzrost o 150 s z 600); idzie od drzewka do
  drzewka, do chaty wraca, gdy nie ma nic do roboty. Drwale dalej sadzą sami, leśnik przyspiesza
  odrost.
- Wygląd: chata myśliwego z rogami nad drzwiami, skóry na ramach, tusza na stojaku; leśnik z grządką
  sadzonek w rzędach. Testy: myśliwy przynosi mięso i skóry; z leśnikiem obok drwala sadzonki są
  średnio starsze po 15 minutach. Testy 90/90.

## 2026-11-16 · Armaty i ludwisarnia zamiast balisty i trebusza

- Decyzja: armaty. **Ludwisarnia** (nowy budynek: 150 złota, 40 drewna, 60 kamienia; bez pracownika,
  jak koszary) odlewa **armaty** (poziom 1: dwa działa, 140 złota, na działo 6 żelaza i 6 drewna;
  kula na wprost do 120 m, przebicie 0,9, 30 obrażeń murom) i **moździerze** (poziom 2: jedno działo,
  200 złota, 10 żelaza i 8 kamienia; stromy tor 40–150 m, rozprysk 4,5 m, 110 obrażeń murom i zamkowi).
  Obsługa idzie z miasta do ludwisarni jak rekruci do koszar. Nowe pole jednostki `trainedAt`
  (koszary / ludwisarnia); panel ludwisarni pokazuje tylko działa, zakładka Werbunek wszystko.
- Nazwy wewnętrzne `ballista` → `cannon`, `trebuchet` → `mortar`; stare zapisy gry przeliczają się
  same (oddziały, kolejka werbunku).
- Wygląd: modele „Cannon” (Lyskilde) i „Medieval Mortier” (ViktorKom), lufą do przodu, z obsługą
  i chorągiewką w barwach; pociski to żeliwne kule (armatnia mniejsza). Przed ludwisarnią stoi armata
  na pokaz. Bez plików: proste działa z brył.
- Komputer: ludwisarnia po płatnerzu, podnosi jej poziom; w partii komputer–komputer pierwsze armaty
  w 37. minucie. Tempo z bezczynnym graczem bez zmian (36,6 / 40,3 min).
- Testy 89/89; WebGPU 0 błędów (bitwa); zrzuty armat i moździerza.

## 2026-11-16 · Skład, 4 tragarzy zawsze, granica zasięgu budowy, obracanie budowy

- **Skład** (nowy budynek: 60 złota, 40 drewna, 10 kamienia): towary miasta są wspólne, a zamek i każdy
  ukończony skład to magazyny — tragarz odnosi gotowy towar do magazynu najbliższego budynkowi,
  bierze materiał na budowę z najbliższego budowie i pobiera wsad tam, skąd droga najkrótsza.
  Komputer stawia skład w późnej fazie (po winnicy). Nowa wspólna lista `WORKLESS` (chata, koszary,
  wieża, skład: bez pracownika i pauzy). Test: zboże z zagrody trafia do bliższego magazynu.
- **Zawsze co najmniej 4 tragarzy** (`PEOPLE.minCarriers`): pracownika nie bierze się z ostatnich
  czterech, a gdy coś się buduje — także nie z piątego (budowniczy). Pierwsza wersja bez tego piątego
  zakleszczała miasto komputera na 14 budynkach (nikt nie budował chat, ludzi nie przybywało).
  Tempo komputera po zmianie: wygrywa z bezczynnym graczem w 36,6 i 40,3 min (ziarna 5 i 6; było
  41,5 i 34,9). Test: przy 12 warsztatach i małej ludności tragarzy nigdy mniej niż 4.
- **Granica zasięgu budowy**: dotąd nigdzie jej nie było widać (żółty okrąg z zrzutów to punkt do
  zajęcia), stąd wrażenie, że budynki nie poszerzają zasięgu. Przy stawianiu żółta przerywana linia
  obrysowuje koło zamku razem z kołami 70 m wokół własnych budynków (kreska tylko tam, gdzie nie
  przykrywa jej inne koło); kreski grubieją z oddaleniem kamery.
- **Obracanie w trakcie budowy**: R przy zaznaczonej budowie albo „Obróć (R)” w panelu — o 1/8 obrotu
  (o 1/4 z włączoną siatką), z tymi samymi sprawdzeniami co przy stawianiu; pola zagrody i winnicy
  obracają się razem z nią. Po ukończeniu: „Obrócić można tylko budynek w budowie”. Test.
- Testy 89/89; WebGPU 0 błędów.

## 2026-11-16 · Żniwa

- „Harvesting” (Mixamo) dla rolników w polu i w winnicy (zamiast kopania; kopanie zostaje
  w kamieniołomie i kopalni). Testy 86/86.

## 2026-11-16 · Siekiera: drwale i budowniczowie rąbią; halabardnicy z trzema ciosami

- „Great Sword Attack” (Mixamo; najbliższe młotkowi i siekierze) jako rąbanie oburącz siekierą:
  drwal przy pracy. Budowniczowie: „Heavy Weapon Swing” (5 s, z zamachem) z drewnianym młotem
  (`--arms tools`: siekiera na pierwszej kości broni, młot na drugiej, obie w prawej dłoni;
  `--tool-clips chop --tool2-clips swing` — każde narzędzie widać tylko w jego klipie). `rigged.py --arms axe --tool-clips
  chop`: siekiera (trzonek 0,9 m, ostrze) widoczna tylko w tym klipie — w pozostałych macierz jej
  kości ma zerową skalę, więc trójkąty znikają (bez osobnej siatki i bez kosztu).
- Halabardnicy zadają trzy różne ciosy, na zmianę według miejsca w szyku: pchnięcie („Upward Thrust”),
  rąbnięcie z góry („Great Sword Attack”) i zamach poziomy („Great Sword Slash”). Każdy cios mieści
  się między dwoma uderzeniami. Klipy bez kości broni: halabarda idzie za prawą dłonią.
- WebGPU: 0 błędów (bitwa, miasto). Testy 86/86; zrzut drwala z siekierą.

## 2026-11-16 · Zwykły chód; pomiar klatki po nowych modelach

- „Walking” (Mixamo) zamiast chodu z mieczem i tarczą: ludzie bez ładunku (1,66 m na cykl)
  i łucznicy w marszu.
- Pomiar `tools/measure/passes.mjs` (dopisany punkt zaczepienia `window.__debug.game.view.stage`
  dla gier na wspólnym kontrakcie), High: **bitwa** 124 wywołania / 1,69 mln trójkątów na ekran
  + 146 / 0,89 mln w cieniach; **miasto** 147 / 1,23 mln + 175 / 0,42 mln. Najwięcej biorą kępy trawy
  (0,7 mln w trzech pierścieniach) i teren (0,18 mln); jazda 0,11 mln na rodzaj (×2 z cieniem),
  skinowana piechota 0,083 mln na rodzaj, ludzie w mieście 0,067 mln, kowale 0,018 mln.
  Nowe modele mieszczą się w budżecie; nic do cięcia.
- WebGPU: 0 błędów. Testy 86/86.

## 2026-11-16 · Ludzie w mieście z modeli i animacji

- Tragarze, robotnicy i budowniczowie nie są już figurami z pudełek: „.Fuse Civilian 2” w lżejszej
  wersji (1200 trójkątów, tunika w barwach strony w 35%), 8 klipów Mixamo próbkowanych co drugą
  klatkę (15 kl./s): chód z pudłem i postawa z pudłem (z ładunkiem albo z taczką), zwykły chód
  i postawa (bez ładunku), podnoszenie i odkładanie na zmianę (warsztaty), kopanie (budowa, pola,
  winnica, kamieniołom, kopalnia, drwal), zarzucanie wędki (rybak). Każdy w innym miejscu klipu,
  krok w takt drogi (`travelM`: chód z pudłem 1,3 m, chód 1,5 m).
- Ładunek niesiony przed piersią w obu rękach zamiast na ramieniu.
- `rigged.py`: `--arms none`, klipy bez kości broni (te idą za dłonią), `--tris`, `--team-share`,
  `--step` (co która klatka). Plik 1,7 MB (490 kB gzip).
- Koszt: do 340 ludzi × 1200 tr. ≈ 400 tys. trójkątów; ustawienie „niska” (telefony) zostaje przy
  figurach z pudełek. WebGPU: 0 błędów, 133 potoki (+2). Testy 86/86; zrzuty z bliska.

## 2026-11-16 · Poprawka: skinowani żołnierze i kowal na WebGPU

- Pomiar `tools/measure/load.mjs` na ścieżce WebGPU (tej, której używa prawdziwa karta) wykazał:
  „Vertex buffer count (11) exceeds the maximum number of vertex buffers (8)” dla materiału
  skinowanych postaci i ich cieni — potoki się nie tworzyły, więc na WebGPU miecznicy,
  halabardnicy, pikinierzy, łucznicy i kowal **w ogóle się nie rysowali**. Moje zrzuty szły przez
  WebGL (SwiftShader), który tego limitu nie ma, więc tego nie widziałem.
- Teraz siedem atrybutów wierzchołka idzie w dwóch przeplatanych buforach (wygląd: pozycja,
  normalna, kolor, powierzchnia; kości: indeksy, wagi, części) + cztery bufory instancji = 6.
  Pomiar po poprawce: 0 błędów w scenach domyślnej, bitwy i miasta; 131 potoków, 161 modułów
  shaderów; tekstury 296 MB wgranych + 67 MB renderowanych; gotowe po ~31 s (SwiftShader).
- Od teraz każdą zmianę grafiki sprawdzam też pomiarem na WebGPU, nie tylko zrzutem na WebGL.

## 2026-11-16 · Piki opuszczone: szyk z pikami i garda bez tarczy

- Pikinierzy i halabardnicy w walce i w szyku z pikami stali w gardzie z tarczą, której nie mają.
  Teraz przy wczytaniu modelu wybierana jest klatka ciosu, w której grot jest najdalej z przodu
  i nie wyżej niż na piersi (kara za grot powyżej 1,6 m): pikinier klatka 45 ze „Stabbing”
  (grot 2,7 m przed nim, 2,2 m nad ziemią — klip to pchnięcie znad głowy), halabardnik klatka 9.
  Tę pozę trzyma szyk z pikami (`pikeWall`) i garda każdego bez tarczy; z tarczą bez zmian.
- Modele z Blendswapa (brama, wieża, wojownik saski) przejrzane: brama i wieża bez tekstur, wojownik
  bez szkieletu (18 tys. tr.) — w zapasie; zamek i mury mają już spójny zestaw.
- Testy 86/86; zrzut szyku z pikami.

## 2026-11-16 · Kowal przy warsztacie

- Nowe narzędzie `tools/blender/baked.py`: postać z dowolnym szkieletem i własną animacją, bez
  przenoszenia ruchu — macierze kości liczone klatka po klatce wprost z animacji modelu, z jego
  przemieszczaniem się; lekkie kości (palce, skręty) łączone z najbliższym przodkiem (zostaje 40).
  Odniesieniem jest pierwsza wypiekana klatka, nie poza wiązania: w tym modelu siatka w pozie
  spoczynkowej miała inną skalę niż szkielet (pierwsza próba dała biodra na 8,6 m).
- „BlackSmith” (celestin.bitternose, CC BY 4.0): 3000 trójkątów, 193 klatki (16 s przy 12 kl./s),
  obchód warsztatu — od drzwi do jednego stanowiska, praca, drugie stanowisko, powrót (ok. 3 m).
  Stoi przy hucie, kuźni i płatnerzu, póki warsztat pracuje; każdy w innym miejscu klipu.
- `WorkersView`: jeden mesh instancjonowany ze skinningiem na GPU (ten sam materiał co wojsko).
- Poprawka po uwadze „kowal nie ma twarzy”: włosy i oczy (bez tekstur) dostawały domyślny
  szarobrązowy kolor zamiast koloru materiału, a siatka skóry z twarzą była przerzedzona jak ubranie.
  Teraz części bez tekstury mają kolor swojego materiału, a skóra i oczy zachowują do połowy
  trójkątów (40% budżetu); twarz ma oczy, wąsy, czarne włosy.
- Testy 86/86; zrzut z bliska (kowal przy dymarce) i podgląd głowy.

## 2026-11-16 · Towary z modeli: niesione ładunki i stosy w obejściach

- Modele zasobów z KayKit (Kay Lousberg, CC0): „Medieval Hexagon Pack” (deski, kamień, worek,
  beczka, skrzynia, kubeł ze strzałami) i „Restaurant Bits” (skrzynia bułek, skrzynia szynki),
  przez `prop.py` do `public/props/goods/` (90–400 trójkątów, razem 228 kB).
- Niesiony ładunek ma kształt towaru (zamiast jednego worka w kolorze): drewno → deski, kamień →
  bloki (ruda i żelazo tymi samymi blokami w innym odcieniu), zboże, mąka, skóry → worek, wino →
  beczka, chleb → skrzynia bułek, mięso i kiełbasy → skrzynia szynki, łuki → kubeł strzał, reszta
  → skrzynia w barwie towaru. W taczce i na wozie ten sam model.
- Nowe: towary czekające w obejściu na wywóz (`out`) widać przy budynku — po kawałku (0,6 m) na
  każde 4 jednostki, do sześciu w rzędzie przy przedniej krawędzi działki, na poziomie budynku
  (na cokole, gdy stoi na zboczu). Zatory w produkcji widać teraz na mapie.
- Jeden mesh instancjonowany na kształt (8 na ładunki, 8 na obejścia). Testy 86/86.

## 2026-11-16 · Taczki, wozy i świnie z modeli

- Nowe narzędzie `tools/blender/prop.py`: dowolny model bez szkieletu → lekka siatka z kolorami
  z tekstur w wierzchołkach (przerzedzenie, obrót, skala do zadanej długości lub wysokości, na ziemi,
  wyśrodkowana). Podgląd na stronie z three.js, bo Blender tu nie renderuje.
- Transport poziom 2: przewoźnik pcha taczkę („Wooden hand truck low poly 3D”, 522 trójkąty, 1,5 m)
  kołem do przodu, ładunek leży w skrzyni. Poziom 3: dwukołowy wóz („Old wooden cart (revamp)”,
  1200 trójkątów, 3,4 m z dyszlami) obok przewoźnika, koń (nadal z pudełek) między dyszlami.
  Bez plików zostają stare wózki z pudełek.
- Świnie w chlewni z modelu („Curious Pink Pig”, 320 trójkątów, 1,1–1,3 m), każda trochę inaczej
  obrócona; `MeshBuilder.model()` wstawia gotowy model w budynek składany z kodu.
- Testy 86/86; zrzuty z bliska.

## 2026-11-16 · M4, krok 5: pikinierzy i łucznicy na własnych postaciach

- `tools/blender/rigged.py` przyjmuje teraz dowolną postać ze szkieletem Mixamo: sam ją obraca (od
  prawego do lewego biodra), skaluje do zadanego wzrostu (`--height`, niezależnie od jednostek: wojownik
  Fuse był w centymetrach), dorabia brakujące kości końcowe, sztywny hełm przypina do głowy, a własną
  broń modelu pomija. Opcje: `--arms sword|halberd|pike|bow`, `--team <tekstura>` (to ubranie w barwach
  strony), `--source` (podpis w pliku). Każdy klip zapisuje, ile metrów przechodzi (`travelM`): marsz
  nienagrany „w miejscu” wyznacza długość kroku w grze (miecznik 1,8 m, pikinier 1,5 m, łucznik 1,5 m).
- Pikinierzy: „.Fuse Warrior” (skórzana zbroja, hełm), pika 4 m z proporcem w barwach, cios
  „Stabbing”, marsz z bronią „Rifle Walk”, górna zbroja w barwach strony.
- Łucznicy: „.Fuse Civilian 2”, łuk w lewej pięści (dwa razy grubszy niż prawdziwy, żeby był widoczny
  z kamery), tunika w barwach. Strzał: po wypuszczeniu klatki „Standing Aim Recoil”, przed następnym
  strzałem „Standing Draw Arrow” zgrane z czasem do przeładowania, między strzałami postawa z łukiem.
- Miecznik i halabardnik przepieczeni nowym skryptem (różnica: skala 1,002).
- Pliki po gzip: miecznik 472 kB, halabardnik 489, pikinier 468, łucznik 404.
- Zostaje na zawias: kusznicy (dalej bryły z pudełek), garda pikinierów to poza z tarczą, jazda
  dalej na sztywnym rycerzu. Testy 86/86; zrzuty z bliska.

## 2026-11-16 · Łąka bez plam w średnim zbliżeniu

- Z wysoka i z bliska łąka wyglądała dobrze, ale ze średniej wysokości (kamera 30–80 m) jak rozlana
  farba w jasne plamy. Sprawdzone na zrzutach: plamy to kępy i wytarte miejsca ze zdjęcia łąki
  z drona, powiększone do 1–3 m. Teraz zdjęcie daje szczegół tylko do ~12 m od kamery i do 40 m
  przechodzi w swój średni kolor; dalej łąkę rysuje drobne ziarno skanu trawy, kępy źdźbeł przy
  kamerze i szerokie pasma tonu. Testy 86/86.

## 2026-11-16 · Głowy na miejscu

- Miecznicy i halabardnicy wyglądali, jakby nie mieli głowy: w modelu rycerza końcówki kości
  (`HeadTop_End`, `Toe_End`) leżą w początku układu, więc kierunek głowy wychodził w dół i przy
  przenoszeniu ruchów głowa obracała się o ~160° w tułów (stopy podobnie). Teraz taka kość idzie
  w kierunku swojego rodzica (głowa wzdłuż szyi, palce wzdłuż stopy); żadna kość poza zgiętym
  przedramieniem z tarczą nie obraca się już o ponad 100°. Sprawdzone na zrzucie z bliska.

## 2026-11-16 · M4, krok 4: miecznicy i halabardnicy chodzą, biegną, obrywają i padają

- Z przesłanych animacji Mixamo upieczone na rycerza Thosta: postawa (idle), marsz, bieg, trafienie
  i dwie śmierci, obok cięcia i bloku. W grze klatka zależy od stanu: martwy — jedna z dwóch śmierci
  (na zmianę w szeregu, zamiast przewracania całej bryły), cios, drgnięcie po ranie (nowe pole
  `hurtAtS` w symulacji, tylko do widoku), marsz albo bieg w takt pokonanej drogi (cykl 1,6 m
  marszu jak w nagraniu, bieg skrócony do 2,5 m, żeby 2,7 m/s szarży nie szło w zwolnionym tempie),
  tarcza w górę w murze tarcz, garda przy walce, poza walką spokojna postawa przesunięta w fazie
  u każdego, żeby szereg nie oddychał równo.
- Halabardnicy dostali ten sam szkielet z własną halabardą (`rigged.py --halberd`) i cios
  „Upward Thrust”; długi cios gra się szybciej, tak by mieścił się między dwoma uderzeniami.
- Plik miecznika 1,6 MB (480 kB po gzip) po zaokrągleniu macierzy do 4 miejsc; halabardnika podobny.
- W zapasie: Stabbing, Double Dagger Stab, chód z celowaniem (łucznicy), Idle 1–2, drugi blok.
- Testy 86/86; wygląd sprawdzony na zrzutach z bliska (SwiftShader).

## 2026-11-16 · Drogi jak polne trakty

- Drogi nie są już szarym brukiem: to ubita, jasna, piaszczysta ziemia (kolor ok. sRGB 180·152·116,
  światłocień ze skanu ziemi), z poszarpanym brzegiem, w który wchodzi darń, ciemniejszymi koleinami
  przy krawędziach i lekką trawą na środku (jak na zrzutach referencyjnych).
- Próbowałem też drobnych kwiatów na łące (fioletowe i żółte plamki przy kamerze) — z tej wysokości
  wyglądały jak żółte kleksy, więc wyleciały; kępy trawy wystarczą.
- Testy 86/86; wygląd sprawdzony na zrzucie z bliska (SwiftShader).

## 2026-11-16 · Zamki bliżej narożników

- Miejsca startowe (−232, 232), (−236, 140), (−140, 236) zamiast (−212, 212), (−212, 128), (−128, 212):
  zamek 44–48 m od krawędzi, reszta mapy przed nim. Za zamkiem w narożniku jest już krawędź mapy,
  więc złoża kamienia i rudy przeniesione na boki, trochę do przodu (zawsze ≥ 23 m od krawędzi), a
  jezioro bliżej przodu (70 m do przodu, 62 m w bok; sięga 258 z 280 m). Zamki dzielą 656 m (róg) lub
  549 m (zachód/południe). Rzeka z dala od zamków, jeziora i złóż; las najbliżej 84 m.
- Tempo zburzenia bezczynnego gracza 41,5 / 34,9 min (w limicie 42). Testy: 86 / 86.

## 2026-11-16 · M4, krok 3: jazda na modelowanym koniu, jeździec w siodle

- `tools/blender/horse.py`: „Armored Horse” (naminoff, CC BY 4.0) bez szkieletu → 3 591 trójkątów,
  1,6 m w kłębie, kolory z tekstur; każdy wierzchołek poniżej brzucha (poza osią, czyli bez ogona) idzie
  do nogi swojej ćwiartki i chodzi parami po przekątnej wokół barku i biodra, jak dotąd; miejsce siodła
  zapisane dla jeźdźca.
- `soldiers.py --seated`: ten sam rycerz z płyt usadzony — uda 50° do przodu wokół biodra, łydki znów
  pionowo od kolana, nogi rozchylone o 16° na boki konia; nogi nie chodzą, ręce walczą jak u piechoty.
- W grze lekka i ciężka jazda na tych modelach; kopia/włócznia, tarcza i napierśnik w barwach strony
  z kodu. Jedno rysowanie na rodzaj, jak dotąd.
- Testy: 86 / 86.

## 2026-11-16 · M4, krok 2: animacje szkieletowe na GPU — miecznicy tną i trzymają gardę

- `tools/blender/rigged.py`: postać ze szkieletem Mixamo („knight for game project (old)”, Thost,
  CC BY 4.0) i klipy Mixamo (cięcie mieczem z tarczą, blok). Postać stoi w pozie „A” i patrzy wzdłuż
  −X, klipy są na postaci w pozie „T” patrzącej wzdłuż −Y: ruch przenoszony kość po kości — kość bierze
  obrót tej samej kości klipu od jej spoczynku, po wyrównaniu kierunków spoczynkowych (żeby różnica A/T
  nie przeszła na zamach); biodra tylko w pionie (w miejscu), w skali wzrostu. 22 kości ciała + 2 kości
  broni z klipów; miecz i tarcza (w barwach strony) to proste kształty gry, zawieszone tak, jak trzymał
  je paladyn z klipów (zmierzone, nie skopiowane). Siatka 3 449 trójkątów, kolory z tekstury.
- W grze: macierze kości w teksturze (3 teksele na kość, wiersz na klatkę: 72 × 64), shader skinningu
  (4 kości na wierzchołek) — każdy żołnierz wybiera klatkę: cięcie od początku przy każdym ciosie,
  tarcza w górze przy ścianie tarcz, garda poza tym; nadal jedno rysowanie na rodzaj. Dopóki nie ma
  klipu chodu, nogi chodzą wahadłem jak dotąd. Miecznicy na tym ciele; halabardnicy na rycerzu z płyt.
- Trawa niższa (do ~45 cm): przy ludziach 1,8 m sięgała kolan.
- Testy: 86 / 86.

## 2026-11-16 · Łąka z daleka bez cętek, jaśniejsza; lista potrzebnych modeli

- Z daleka łąka była w cętkach: drobny wzór zdjęcia łąki (kępy i wytarcia po 2–3 m) i drobny szum
  tonu z wysoka zlewały się w plamki. Teraz drobny wzór zanika z odległością (35–170 m) do średniego
  koloru zdjęcia, szum tonu tylko blisko kamery; zostają duże połacie. Zieleń jaśniejsza i cieplejsza
  (słoneczna łąka letnia), źdźbła dopasowane. Z bliska bez zmian (kępy źdźbeł).
- `docs/ASSETS.md`: co jest, co odrzucone (licencje) i lista animacji oraz postaci do znalezienia.

## 2026-11-16 · Trawa ze źdźbeł przy kamerze, łąka w połaciach

- **Źdźbła z gier FPS**: wspólne pole trawy (`render/grassField.ts`, to samo co w Field Line,
  Castaway Lagoon, Tanks i Ridgeline — prawdziwe źdźbła z krzywych Béziera, układane przez GPU w
  płytkach wokół kamery, trzy pierścienie, trzy rysowania, płynne zanikanie z odległością, wiatr).
  Ustawienia jak w Tanks dla kamery z góry, mocniej: szersze, pochylone źdźbła czytają się jako kępy.
  Rośnie na siatce samego terenu (nic nie wisi), gęstość czytana w shaderze z mapy pokrycia i mapy
  robót: bez trawy w lesie, na skałach, na mulistych brzegach, na drogach, podwórzach i polach —
  nowa droga jest od razu goła. Widoczne przy kamerze niżej niż 95 m nad ziemią (wyżej źdźbło jest
  mniejsze od piksela); 520 źdźbeł na płytkę 4 m do 52 m na wysokiej jakości, 220 do 34 m na niskiej.
- **Łąka z daleka**: połacie kilkudziesięciometrowe — ciemniejsze bujne zagłębienia, jaśniejsze
  płowiejące wzniesienia — mocniejszy szczegół trawy na średnich odległościach, lekko mniejsze
  nasycenie; już nie jedna warstwa zielonej farby.

## 2026-11-16 · M4, krok 1: miecznicy i halabardnicy w zbroi płytowej z modelu

- **„Rigged Knight in Armor”** (Xali, BlendSwap, CC0) przez `tools/blender/soldiers.py`: sztywne płyty
  na kościach i kolczuga z wagami → każdy wierzchołek dostaje kończynę (tułów, nogi, ręce) po kości,
  ręce opuszczone z pozy „A”, siatka przerzedzona do 3 189 trójkątów, 1,8 m, przodem do −Z, materiały
  jako kolory z metalicznością i szorstkością (`public/soldiers/knight.json`).
- W grze ciało rycerza dostają miecznicy i halabardnicy; broń, tarcza i napierśnik w barwach strony z
  kodu; kończyny poruszają się tym samym shaderem co dotąd (jedno rysowanie na rodzaj).
- Drugi model („Knight medieval no textures”, CC0, 38 tys. trójkątów, 20 kości) odłożony jako
  wariant; kolczuga rycerza ma dziury pod płytami, więc lżej zbrojnych z niego się nie zrobi.

## 2026-11-16 · Aktywna pauza, kolejka rozkazów, mur komputera, gospodarka kamienia

- **Aktywna pauza (Spacja lub ⏸)**: bitwa staje, rozkazy można wydawać; baner na górze.
- **Kolejka rozkazów (Shift + prawy)**: marsz, atak na oddział, szturm budynku dopisywane na koniec
  kolejki (do 12); oddział bez zajęcia zaczyna od razu. Atak w kolejce kończy się, gdy cel ucieka
  (bez pościgu). Rozkaz bez Shift zastępuje kolejkę, „Stój” ją kasuje. Zaplanowane punkty marszu
  widać jako znaczniki przy zaznaczonych oddziałach.
- **Komputer z murem**: po zamku poziomu 2 i 260 kamienia stawia odcinek muru (68 m) w poprzek
  drogi wroga, 104 m przed zamkiem, a bramę, gdy ma 20 drewna; jego oddziały wychodzą bramą.
- **Odkrycie przy okazji**: komputer nie dochodził do zamku poziomu 2 nawet po 80 min — kamień
  stał w kamieniołomach (pełne podwórza po 24), a złoto szło na werbunek. Teraz: drugi i trzeci
  kamieniołom oraz czwarty drwal w planie budowy; gdy w zamku jest mniej niż 80 drewna lub kamienia,
  tragarze biorą je przed innymi podwórzami (po dostawach do warsztatów); z trzema oddziałami w polu
  komputer oszczędza złoto na zamek. Wynik: zamek poziomu 2 ok. 40. min (wcześniej nigdy), mur
  ok. 50. min, pierwsze oddziały ok. 20. min.
- Tempo zburzenia bezczynnego gracza: 38,4 / 41,7 min (było 37,5 / 36,1 bez zamku poziomu 2);
  próg testu podniesiony z 38 do 42 min.
- Testy: 86 / 86.

## 2026-11-16 · Wojsko omija mury i wodę, załogi na wieżach, łąka bez plam, bruk na drogach

- **Trasy oddziałów**: gdy między oddziałem a celem leży mur (cudzy albo własny bez bramy), woda
  lub skała, oddział szuka drogi przez przerwę, bród albo własną bramę (A* na siatce 2 m, jak
  ludzie, ale przez bramy tylko swojej strony) i idzie nią kolumną po 3, na ostatnim odcinku wraca
  do szyku. Gdy drogi nie ma (miasto zamknięte murem), idzie prosto i szturmuje mur. Trasa
  odświeżana co sekundę, od razu po zmianie celu lub murów. Test: marsz za własny mur bez bramy i
  na drugi brzeg jeziora — dochodzi, nikt nie stoi w wodzie.
- **Załoga wieży widoczna**: łucznicy albo kusznicy na rogach szczytu, patrzą w stronę wroga,
  jeden napina łuk, gdy wieża strzela.
- **Łąka**: wycięte żółte plamy zdjęcia (jasność zostaje, żółć znika), słabsze przebarwienia.
- **Drogi brukowane**: osobny kanał „bruku” w mapie robót; drogi to jasnoszare kamienie, podwórza
  zostają ubitą ziemią.
- **Zamówienia**: „Zamów uzbrojenie” ×1 / ×2 / ×5; zamówienia różnych oddziałów się sumują.
- Testy: 85 / 85.

## 2026-11-14 · Roślinność w stronę docelowego wyglądu, zboże w 3D, chaty na zboczach, poprawki

- **Drzewa z kart liści** (`render/foliage.ts`): korona to kilkadziesiąt kart z teksturą liści
  malowaną w kodzie (bez pobierania), z normalnymi wygiętymi od środka korony — słońce oświetla ją
  jak jedną miękką bryłę, środek i spód ciemniejsze. Trzy kształty: świerk (piętra opadających
  gałęzi, igły), szeroka kopuła (dąb, buk), smukła (brzoza, topola); każde drzewo ma swoją
  zieleń z palety, ok. 5–8 % już przebarwionych. W głębi lasu korony szersze — sklepienie się
  zamyka. ~0,3 mln trójkątów na wysokiej jakości, mniej kart na niskiej.
- **Krzaki**: gęsto na skraju lasu, rzadziej w podszycie, pojedyncze na łąkach; znikają pod
  budynkami i drogami jak drzewa.
- **Łąka**: spokojniejsza, głębsza zieleń, mniej żółtych plam; ściółka pod lasem zielono-ciemna.
- **Zboże w 3D** (`render/cropsView.ts`): zagony porasta zboże, które rośnie płynnie (40 kroków)
  od kiełków do pasa, w ostatniej trzeciej złocieje, po żniwach znika. Rzędy winorośli to karty
  liści (nie skrzynki), żółkną, gdy grona dojrzewają. Obsiany zagon jest teraz
  zbożem od brzegu do brzegu (wcześniej szum zostawiał „obsiane w kawałkach”). Winorośl rośnie
  płynniej (30 kroków zamiast 8).
- **Chaty na zboczach**: budynek stoi na najwyższym punkcie działki (nie tonie w stoku), pod
  nim kamienna podmurówka do najniższego.
- **Ustawienie budynków**: drzwi w czterech kierunkach osi mapy (nie promieniście do zamku),
  siatka domyślnie włączona. Komputer zostaje przy ustawieniu promienistym: przy kwadratowym jego
  tragarze chodzą dalej i tempo spadało o 3–5 min (pomiar A/B: 40,1 / 41,2 wobec 37,5 / 36,1).
- **Zamówienia uzbrojenia**: warsztaty uzbrojenia gracza startują z zamówieniem 0 (broń, łuki,
  zbroje skórzane, kolczugi, konie); „Zamów ×1 / ×2” pokazuje, co jest zamówione. Symulacja:
  zamówienie na miecznikach daje dokładnie 12 broni i 12 kolczug, potem warsztaty stają.
- **Zasięg**: 70 m liczy się też od budynków w budowie; podpowiedź przy „za daleko” podaje
  odległość od zamku i od najbliższego budynku. Panel dolny rośnie do 62 % ekranu (produkcja
  rozwija się w całości, bez przewijania w przewijaniu).
- Testy: 84 / 84. Tempo komputera 37,5 / 36,1 min.

## 2026-11-14 · Gospodarka i dowodzenie: lista budynków, zamówienia, transport, siatka, szyki

- **Drwal, który nie produkował**: gra pozwalała postawić chatę tam, gdzie w zasięgu stały
  4 drzewa (po ich ścięciu czekał 10 min na sadzonki). Teraz potrzeba ≥ 20 dorosłych drzew w
  zasięgu (55 m, było 48); nowy stan „brak dorosłych drzew” z alarmem „pokaż”.
- **Zasięg budowy**: koło zamku 280 / 330 / 380 m (było 230 / 260 / 290), pola 340 / 390 / 440,
  a do tego **70 m od każdego własnego, gotowego budynku** — miasto rośnie w dowolną stronę.
- **Zakładka „Budynki”**: każdy rodzaj z liczbą, poziomami, zapasem na podwórzach, zużyciem na
  minutę, liczbą stojących i w budowie; klik — kamera do kolejnego budynku tego rodzaju i jego
  panel; ▲ · ▼ — który warsztat pierwszy dostaje surowiec, gdy kilka o niego konkuruje.
- **Produkcja**: kolumny „na podwórzach”, priorytet towaru dla tragarzy (▲ · ▼) i **zamówienie**
  (− / ∞ / +): warsztat robi zamówioną ilość i staje („zamówienie wykonane”), tragarze nie
  noszą mu już surowców. W werbunku „Zamów uzbrojenie ×1 / ×2” dolicza broń, zbroje, łuki i
  konie na tyle oddziałów.
- **Transport**: pomiar w mieście komputera — tragarze zajęci w 97–99 %, to przepustowość, nie
  brak ludzi. Teraz: noszą pełne ładunki (pół ładunku tylko gdy zamkowi brakuje towaru albo
  podwórze prawie pełne), podwórza mieszczą 24; poziom 2 **wózki ręczne** (ładunek 14, 120 zł +
  60 drewna), poziom 3 **wozy konne** (ładunek 20, ×1,35 szybciej, 260 zł + 100 drewna + 6 koni,
  zamek poziomu 2). Widać je u tragarzy. Komputer też ulepsza transport.
- **Siatka (T)**: budynki przyciągają się do siatki 16 m równoległej do dróg, drzwiami w czterech
  kierunkach (R obraca o 90°), podgląd sąsiednich kratek.
- **Kierunek i linia**: z zaznaczonymi oddziałami przytrzymanie prawego i przeciągnięcie ustawia
  front i kierunek, z podglądem (belka na każdy oddział + znacznik kierunku); bez zaznaczenia
  prawy nadal obraca kamerę.
- **Zapisane szyki**: Ctrl+cyfra przy kilku oddziałach zapamiętuje ich ustawienie; zaznaczone
  razem (cyfrą albo ramką) idą w tym kształcie, obróconym do nowego kierunku, w tempie
  najwolniejszego.
- Testy: 84 / 84. Tempo komputera 37,5 / 36,1 min (było 35,7 / 36,5).

## 2026-11-14 · M2, etap 3: weterani, kapitan, uzupełnianie, żołd

- **Weterani**: każdy zabity (wręcz albo strzałą — strzała pamięta, kto ją wypuścił) to
  doświadczenie oddziału. Zaprawieni (★) od 0,6 zabitego na człowieka, weterani (★★) od 1,5:
  +1 atak, +1 obrona, +8 morale, strzelcy celniej o 12 % na stopień. Gwiazdki na karcie nad
  oddziałem i w panelu.
- **Kapitan**: pierwszy człowiek oddziału, stoi za szeregami. Jego śmierć: −12 morale i
  komunikat; bez kapitana atak −1, górne morale −10, morale wraca o połowę wolniej.
- **Uzupełnij** (przycisk przy jednym zaznaczonym oddziale): przy koszarach (milicja przy
  zamku), poza walką; złoto i broń za brakujących, ludzie przychodzą z miasta, nowi rozwadniają
  doświadczenie, poległego kapitana zastępuje jeden z nich. Komputer uzupełnia oddziały, które
  straciły ćwierć ludzi albo kapitana.
- **Żołd**: 0,2 zł / człowiek / min (pełna armia 20 zł/min); zaległość ponad minutę żołdu =
  nieopłaceni, −15 górnego morale do spłaty. Panel zamku pokazuje żołd.
- Testy: 81 / 81 (nowe: doświadczenie ze strzał, weterani wygrywają z zielonymi, kapitan i jego
  śmierć, uzupełnienie z kosztem i rozcieńczeniem, żołd i zaległości). Tempo komputera
  35,7 / 36,5 min (było 35,4 / 35,9).

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
