# Marchland — plan gry (Etap 0)

Średniowieczny RTS w przeglądarce: gracz przeciw komputerowi. Miasto z łańcuchami
produkcji, armia w regimentach walczących w szyku, mała mapa, do 200 żołnierzy na
polu. Zbudowany według `AGENT.md`, `games-ts-threejs.md` i
`docs/new-game-AAA-lite/GUIDE.md`.

Nazwa, frakcje i herby są wymyślone (reguły §11). Gra nie odtwarza żadnej
istniejącej gry: bierze z gatunku trzy pomysły opisane niżej.

## 1. Jak czytam założenia

| Założenie z opisu | Co to znaczy w tej grze |
|---|---|
| „Ekonomia jak Kingdom Rush” | Jedna główna waluta (złoto), stałe **działki budowlane** zamiast dowolnego stawiania, trzy poziomy każdego budynku z jasną ceną, złoto za pokonanych wrogów. Bez robotników do prowadzenia ręką. |
| „Walka jak Total War, mniejsza skala” | Rozkazy dostaje **regiment** (12 pieszych albo 8 konnych), nie pojedynczy żołnierz. Szyk, kierunek frontu, morale, ucieczka i zbiórka, atak z flanki i od tyłu, szarża, włócznie na konnicę, łucznicy strzelający salwami po torze balistycznym. |
| „Do 200 żołnierzy” | Limit **100 ludzi na stronę**, razem 200 na polu. To jedna stała w `config.ts`. |
| „Budynki jak w Total War” | Miasto ma zamek i 18 działek; budynek zajmuje działkę, ma poziomy 1–3; koszary odblokowują kolejne klasy wojska poziomem. |
| „Wyżywienie powiązane z produkcją” | Robotnicy, mieszkańcy i żołnierze jedzą racje. Bez jedzenia: produkcja o połowę wolniej, brak podatków, niższe morale wojska. |
| „Trzoda → mięso i skóry → kiełbasy i zbroje” | Chlewnia zjada zboże i daje mięso oraz skóry; masarnia robi z mięsa kiełbasy (2 racje), garbarnia ze skór zbroje skórzane dla wojska 1. klasy. |
| „Zoom i przesuwanie mapy” | Kamera strategiczna: przesuwanie (WASD, strzałki, krawędź ekranu, przeciąganie środkowym przyciskiem, jeden palec), zoom do kursora (kółko, szczypanie), obrót (Q/E). |
| „Nie może być zbyt wielki” | Mapa 400 × 400 m, geometria generowana kodem, bez pobieranych modeli w pierwszej wersji; paczka do 5 MB. |

## 2. Pętla gry

Trzydzieści sekund gracza: sprawdza zapasy → stawia albo ulepsza budynek na
działce → werbuje regiment, gdy są pieniądze i ekwipunek → ustawia szyk i wydaje
rozkaz → wraca do miasta. Sesja trwa 20–30 minut.

Wygrana: zburzenie zamku przeciwnika. Przegrana: utrata własnego.

## 3. Ekonomia

Zapasy są wspólne dla całego miasta (bez tragarzy). Budynek produkuje w cyklu,
jeśli w magazynie są składniki. Poziom 2 i 3 skraca cykl (×1,6 i ×2,3).

```
drwal ─ drewno ─┬─ budowa
kamieniołom ─ kamień ─┘
pole ─ zboże ─┬─ piekarnia ─ chleb (1 racja)
              ├─ chlewnia ─┬─ mięso ─ masarnia ─ kiełbasa (2 racje)
              │            └─ skóry ─ garbarnia ─ zbroja skórzana
              └─ stajnia ─ konie
kopalnia ─ ruda ─┬─ kuźnia (+ drewno) ─ broń
                 └─ płatnerz ─ kolczuga
drewno ─ łuczarz ─ łuki
chata ─ podatek w złocie (tylko gdy miasto najedzone)
zamek ─ mały stały dochód w złocie
```

Złoto przychodzi z podatków, z zamku i za każdego pokonanego wroga.

## 4. Wojsko

| Klasa | Oddział | Ludzi | Koszary | Ekwipunek na człowieka | Rola |
|---|---|---|---|---|---|
| 0 | Pospolite ruszenie | 12 | 1 | — | tanie, kruche morale |
| 1 | Włócznicy | 12 | 1 | broń, zbroja skórzana | trzymają front, kontra na konnicę |
| 1 | Łucznicy | 12 | 1 | łuk, zbroja skórzana | ostrzał z 80 m, słabi w zwarciu |
| 2 | Zbrojni | 12 | 2 | broń, kolczuga | ciężka piechota |
| 2 | Lekka jazda | 8 | 2 | koń, broń, zbroja skórzana | szybka, szarża, pościg |
| 3 | Rycerze | 8 | 3 | koń, broń, kolczuga | przełamująca szarża |

Walka: każdy żołnierz jest osobnym agentem ze swoim miejscem w szyku. Trafienie
zależy od ataku i obrony, kierunku (front / flanka / tył), szarży i zmęczenia
szyku; obrażenia zmniejsza zbroja. Morale regimentu spada od strat, ataków z
boku i od tyłu, szarży, ostrzału i głodu; przy zerze oddział ucieka do zamku i
może się zebrać. Las spowalnia konnicę i osłania przed strzałami.

## 5. Komputer

Gra na tych samych regułach i tej samej ekonomii co gracz (te same komendy).
Buduje według listy priorytetów, werbuje mieszany skład, zbiera wojsko przy
zamku i wysyła coraz większe fale; broni się, gdy gracz podejdzie. Poziom
trudności to jeden mnożnik szybkości jego produkcji.

## 6. Funkcje i kryteria odbioru

| ID | Funkcja | Kryterium |
|---|---|---|
| F1 | Kamera | zoom 25–260 m do punktu pod kursorem, przesuwanie pięcioma sposobami, obrót; nie wychodzi poza mapę; test jednostkowy matematyki kamery |
| F2 | Ekonomia | wszystkie łańcuchy z §3 działają; test: z jednej chlewni powstaje zbroja skórzana tylko przez garbarnię; test bilansu: pierwszy regiment włóczników do 6. minuty typowego otwarcia |
| F3 | Wyżywienie | głód włącza kary i wyłącza je po dostawie; test |
| F4 | Budowa | 14 rodzajów budynków, 3 poziomy, rozbiórka, czas budowy widoczny na budynku |
| F5 | Regimenty | zaznaczanie kliknięciem i ramką, ruch z ustawieniem frontu, atak, stój; szyk trzyma się w marszu; test: oddział dochodzi do celu w szyku |
| F6 | Walka | flanka i tył liczą się w trafieniu i morale; szarża; włócznie na jazdę; test dla każdej z tych reguł |
| F7 | Morale | ucieczka przy zerze, zbiórka, rozbicie; test |
| F8 | Łucznicy | strzały lecą po paraboli (g = 9,81), trafiają tam, gdzie spadną; test zasięgu z wzoru v²·sin2θ/g |
| F9 | Komputer | sam buduje, werbuje i atakuje; test: w symulacji bez gracza burzy zamek bezczynnej strony w 30 minut |
| F10 | HUD | zapasy, panel działki / budynku / oddziału, minimapa, karty oddziałów nad wojskiem, komunikaty; polski i angielski |
| F11 | Koniec gry | ekran zwycięstwa i porażki, restart |
| F12 | Dźwięk | budowa, werbunek, zwarcie, salwa, ucieczka, zwycięstwo; głośność zależna od odległości kamery |
| F13 | Kontrakt pomiarowy | `?autostart`, `&q=high|low`, `window.__ready`, `window.__debug.place/spot`, linie `[load]` |
| F14 | Dotyk | jeden palec przesuwa, szczypanie przybliża, stuknięcie zaznacza i rozkazuje |

## 7. Twarde reguły

- three.js r186, `WebGPURenderer` z własnym zapasowym WebGL2, materiały w TSL,
  jeden `RenderPipeline`; TypeScript `strict`, bez `any`.
- Logika gry (`src/sim`) nie importuje three.js, chodzi stałym krokiem 60 Hz,
  ma ziarno RNG i testy w Node. Gracz i komputer używają tych samych komend.
- Jednostki SI, 1 jednostka = 1 m; jednostki w nazwach; wszystkie liczby
  strojenia w `src/config.ts`.
- Światło w luksach z pre-ekspozycją EV100; mapowanie tonów raz, na wyjściu.
- Jeden `InstancedMesh` na rodzaj żołnierza i drzewa; nic nie kompiluje się w
  trakcie gry; brak alokacji w pętli klatki.
- Bez krwi, bez prawdziwych herbów i nazw; polegli znikają po kilku sekundach.

## 8. Budżet

| Budżet | High (desktop) | Low (telefon) |
|---|---|---|
| Klatka | 60 fps, GPU ≤ 14 ms | 60 fps z regulatorem |
| Wywołania rysowania / trójkąty | ≤ 400 / ≤ 1,5 M | ≤ 250 / ≤ 0,6 M |
| Materiały | ≤ 30 | ≤ 30 |
| Krok symulacji (200 żołnierzy) | ≤ 2 ms | ≤ 4 ms |
| Ładowanie | ≤ 5 s | ≤ 10 s |
| Paczka | ≤ 5 MB | ≤ 5 MB |

Sufity z reguł (2500 wywołań, 12 M trójkątów) są dla gier z widokiem z ziemi;
RTS z góry widzi całą mapę naraz, więc budżet jest ciaśniejszy.

## 9. Kolejność budowy

1. **Szkielet i symulacja** — projekt, konfiguracja, teren, ekonomia, regimenty,
   walka, morale, łucznicy, komputer; testy. *(ta sesja)*
2. **Pierwsza grywalna wersja** — renderer, światło, teren, las, miasta, wojsko
   instancjonowane z animacją w shaderze, kamera, HUD, minimapa, dźwięk, menu.
   *(ta sesja)*
3. **Pomiar i telefon** — przycisk Benchmark, nakładka F3, regulator klatki,
   pomiary `tools/measure`, preset Low na telefonie, wariant APK w `android/`.
4. **Głębia taktyki** — szerokość szyku przeciąganiem, grupy 1–9, bieg / marsz,
   zmęczenie, przewaga wysokości, rzeka z brodami, punkty do zajęcia na mapie
   (kopalnia, młyn), wieże.
5. **Wygląd** — modele CC0 (budynki, ludzie, konie) zamiast geometrii z kodu,
   tekstury gruntu ze skanów w KTX2, pył i dym, ślady na trawie, pory dnia.
6. **Pętla krytyka** — zrzuty z ustalonych widoków obok zdjęć wzorcowych, pięć
   największych różnic naraz.

## 10. Zasoby (stan i plan)

| Kategoria | Co | Źródło | Licencja | Etap |
|---|---|---|---|---|
| Żołnierze, konie | bryły z kodu, animacja w shaderze wierzchołków | kod | własna | 2 |
| Budynki, zamek | bryły z kodu, kolor w wierzchołkach | kod | własna | 2 |
| Drzewa | 2 gatunki z kodu | kod | własna | 2 |
| Grunt | szum proceduralny w dwóch skalach | kod | własna | 2 |
| Dźwięk | synteza WebAudio | kod | własna | 2 |
| Modele ludzi, koni, budynków | do wybrania: tylko CC0 / CC BY, sprawdzone przed użyciem | do ustalenia | CC0 / CC BY | 5 |
| Tekstury gruntu | skany CC0 (4–8 materiałów) w KTX2 | do ustalenia | CC0 | 5 |

Zdjęć wzorcowych (`target-look/`) jeszcze nie ma: nie mam prawa użyć cudzych
kadrów, a własnych nie dostałem. Do Etapu 5 potrzebne są 6–10 zdjęć (wieś z
muru pruskiego, pole, las mieszany, zamek z kamienia) z licencją CC0 / CC BY.

## 11. Odstępstwa od reguł, z powodem

| Reguła | Tu | Powód |
|---|---|---|
| „Stop po Etapie 0 do zatwierdzenia” | plan i od razu budowa | tak brzmiało polecenie |
| Kaskadowe mapy cieni (CSM) | jedna mapa cieni dopasowana do pola widzenia kamery | kamera patrzy z góry na ograniczony fragment ziemi; dopasowanie daje 2–15 cm na teksel bez kosztu kaskad. CSM wraca, jeśli pomiar pokaże braki |
| Auto-ekspozycja z histogramu | stała EV na preset pogody | brak wnętrz, kamera zawsze widzi oświetlony teren |
| Ludzie ze skanów i mocap (R1) | bryły z kodu | etap 5; z 40–260 m sylwetka ma kilkanaście pikseli |
| Wnętrze / zewnętrze kamery (§6) | jedna kamera strategiczna | gra bez pojazdów |
| Biblioteka fizyki (Rapier) | własny krok: sterowanie do miejsc w szyku i rozpychanie | 200 agentów na płaszczyźnie, brak brył sztywnych |
| KTX2, LOD, impostory | brak | w pierwszej wersji nie ma plików tekstur ani modeli |
| APK od pierwszej grywalnej wersji | etap 3 | nowy wariant w `android/` zmienia wspólny workflow wydania pięciu gier; osobna zmiana po akceptacji |
| Zasięg łuku | 80 m | prawdziwy łuk niesie dalej; mapa ma 400 m, więc zasięg skrócony, tor lotu fizyczny |
