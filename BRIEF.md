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
| „Walka jak Total War, mniejsza skala” | Rozkazy dostaje **regiment** (12 pieszych, 8 konnych albo 1–2 machiny), nie pojedynczy żołnierz. Szyk, kierunek frontu, morale, ucieczka i zbiórka, atak z flanki i od tyłu, szarża, włócznie na konnicę, łucznicy strzelający salwami po torze balistycznym. |
| „Do 200 żołnierzy” | Limit **100 ludzi na stronę**, razem 200 na polu. To jedna stała w `config.ts`. |
| „Budynki jak w Total War” | Miasto ma zamek i 18 działek; budynek zajmuje działkę, ma poziomy 1–3; koszary odblokowują kolejne klasy wojska poziomem. |
| „Wyżywienie powiązane z produkcją” | Robotnicy, mieszkańcy i żołnierze jedzą racje. Bez jedzenia: produkcja o połowę wolniej, brak podatków, niższe morale wojska. |
| „Trzoda → mięso i skóry → kiełbasy i zbroje” | Chlewnia zjada zboże i daje mięso oraz skóry; masarnia robi z mięsa kiełbasy (2 racje), garbarnia ze skór zbroje skórzane dla wojska 1. klasy. |
| „Zoom i przesuwanie mapy” | Kamera strategiczna: przesuwanie (WASD, strzałki, krawędź ekranu, przeciąganie środkowym przyciskiem, jeden palec), zoom do kursora (kółko, szczypanie), obrót (Q/E). |
| „Nie może być zbyt wielki” | Mapa 400 × 400 m; paczka do 40 MB (skany tekstur), reszta z kodu. |

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
| 0 | Milicja | 12 | 1 | drewno (tarcza) | tania, pod tarczą trzyma się nieźle, kruche morale |
| 1 | Pikinierzy | 12 | 1 | broń, zbroja skórzana | las pik: kontra na jazdę; bez tarcz giną od strzał |
| 1 | Łucznicy | 12 | 1 | łuk, zbroja skórzana | ostrzał z 80 m, słabi w zwarciu |
| 2 | Miecznicy | 12 | 2 | broń, kolczuga | miecz, tarcza, kolczuga: wygrywają walkę piechoty |
| 2 | Halabardnicy | 12 | 2 | broń, kolczuga | biją mocniej, zatrzymują konie, bez tarcz |
| 2 | Kusznicy | 12 | 2 | łuk, zbroja skórzana, drewno | 70 m, wolne napinanie, bełt przebija kolczugę |
| 2 | Lekka jazda | 8 | 2 | koń, broń, zbroja skórzana | szybka, szarża, pościg, na machiny |
| 3 | Ciężka jazda (rycerstwo) | 8 | 3 | koń, broń, kolczuga | przełamująca szarża |
| 2 | Balisty | 2 machiny | 2 | drewno 12, broń 2 (na machinę) | 110 m, bełt przebija zbroję, bezbronne z bliska |
| 3 | Trebusz | 1 machina | 3 | drewno 40, kamień 10 | 135 m (nie bliżej niż 35), kamień rozbija szyk i burzy mury |

Walka: każdy żołnierz jest osobnym agentem ze swoim miejscem w szyku. Trafienie
zależy od ataku i obrony, kierunku (front / flanka / tył), szarży i zmęczenia;
obrażenia zmniejsza zbroja. Morale regimentu spada od strat, ataków z boku i od
tyłu, szarży, ostrzału i głodu; przy zerze oddział ucieka do zamku i może się
zebrać. Las spowalnia konnicę i osłania przed strzałami. Bieg męczy: zmęczony
oddział bije słabiej i wolniej biega. Pociski lecą po torze balistycznym (strzała
45 m/s, bełt 60, bełt balisty 70, kamień trebusza stromym torem).

## 5. Komputer

Gra na tych samych regułach i tej samej ekonomii co gracz (te same komendy).
Buduje według listy priorytetów, werbuje mieszany skład, zbiera wojsko przy
zamku i wysyła coraz większe fale; broni się, gdy gracz podejdzie. Poziom
trudności to jeden mnożnik szybkości jego produkcji.

## 6. Funkcje i kryteria odbioru

| ID | Funkcja | Kryterium |
|---|---|---|
| F1 | Kamera | zoom 25–260 m do punktu pod kursorem, przesuwanie pięcioma sposobami, obrót; nie wychodzi poza mapę; test jednostkowy matematyki kamery |
| F2 | Ekonomia | wszystkie łańcuchy z §3 działają; test: z jednej chlewni powstaje zbroja skórzana tylko przez garbarnię; test bilansu: pierwszy regiment pikinierów do 7. minuty prostego otwarcia |
| F3 | Wyżywienie | głód włącza kary i wyłącza je po dostawie; test |
| F4 | Budowa | 14 rodzajów budynków, 3 poziomy, rozbiórka, czas budowy widoczny na budynku |
| F5 | Regimenty | zaznaczanie kliknięciem i ramką, ruch z ustawieniem frontu, atak, stój; szyk trzyma się w marszu; test: oddział dochodzi do celu w szyku |
| F6 | Walka | flanka i tył liczą się w trafieniu i morale; szarża; włócznie na jazdę; test dla każdej z tych reguł |
| F7 | Morale | ucieczka przy zerze, zbiórka, rozbicie; test |
| F8 | Strzelcy i machiny | pociski lecą po paraboli (g = 9,81), trafiają tam, gdzie spadną; test zasięgu z wzoru v²·sin2θ/g; bełt przebija kolczugę; balista sięga dalej niż łuk; trebusz burzy budynek z dystansu; machiny nie walczą wręcz — test dla każdej z tych reguł |
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
| Ładowanie | ≤ 8 s | ≤ 15 s |
| Paczka | ≤ 40 MB | ≤ 40 MB |
| Pamięć tekstur | ≤ 300 MB | ≤ 80 MB |

Sufity z reguł (2500 wywołań, 12 M trójkątów) są dla gier z widokiem z ziemi;
RTS z góry widzi całą mapę naraz, więc budżet jest ciaśniejszy. Paczka urosła z
5 do 40 MB świadomie: priorytetem stała się jakość tekstur.

## 9. Kolejność budowy

1. **Szkielet i symulacja** — zrobione: ekonomia, regimenty, walka, morale,
   pociski, machiny, komputer; 43 testy.
2. **Pierwsza grywalna wersja** — zrobione: renderer, światło, teren, las,
   miasta, wojsko, kamera, HUD, minimapa, dźwięk, menu.
3. **Skład wojska i tekstury** — zrobione: dziesięć rodzajów oddziałów z
   balistami i trebuszem; czternaście skanów CC0 (grunt, ściany, dachy, kora).
4. **Sylwetki i zwierzęta z Blendera** — ludzie z prawdziwymi proporcjami
   (MPFB, `tools/assets/people`), konie, animacje z mocapu wypalone do tekstur
   animacji wierzchołków; herby na tarczach i kropierzach ciężkiej jazdy.
   Wymaga Blendera, którego w tej sesji nie było.
5. **Drzewa i roślinność** — modele drzew CC0 z kartami liści i impostorami,
   trawa przy kamerze, zboże jako łan zamiast brył.
6. **Budynki drugiego przejścia** — modele z Blendera na wzór wsi z muru
   pruskiego: krzywe belki, strzecha z grubością, płoty z plecionki, podwórza
   z narzędziami; etapy budowy (szkielet → ściany → dach).
7. **Życie miasta** — robotnicy widoczni na mapie: tragarze noszą towar między
   budynkami, budowniczy stawiają budynek, rolnik idzie w pole, kowal kuje;
   towar leży w stosach pod budynkiem. Najpierw jako obraz tego, co liczy
   ekonomia, potem (osobna decyzja) jako prawdziwa logistyka z czasem dostaw.
8. **Pomiar i telefon** — przycisk Benchmark, pomiary `tools/measure` na obu
   presetach, KTX2 dla tekstur, wariant APK w `android/`.
9. **Głębia taktyki** — szerokość szyku przeciąganiem, grupy 1–9, przewaga
   wysokości, rzeka z brodami, punkty do zajęcia na mapie, wieże i mury.
10. **Pętla krytyka** — zrzuty z ustalonych widoków obok zdjęć wzorcowych,
    pięć największych różnic naraz.

## 10. Zasoby (stan i plan)

| Kategoria | Co | Źródło | Licencja | Stan |
|---|---|---|---|---|
| Grunt | łąka, sucha trawa, ubita ziemia, ściółka, rola | Poly Haven | CC0 | w grze |
| Ściany i dachy | tynk na glinie, belki, deski, strzecha, dachówka, mur łamany, cios | Poly Haven | CC0 | w grze |
| Kora i listowie | kora, plamista zieleń na korony | Poly Haven | CC0 | w grze (korony do wymiany) |
| Budynki, zamek | bryły z kodu z ramą szkieletową | kod | własna | w grze, etap 6 je zastąpi |
| Żołnierze, konie, machiny | bryły z kodu, animacja w shaderze | kod | własna | w grze, etap 4 je zastąpi |
| Drzewa | 2 gatunki z kodu | kod | własna | w grze, etap 5 je zastąpi |
| Dźwięk | synteza WebAudio | kod | własna | w grze |
| Ludzie i konie | MPFB (MakeHuman) + mocap | do zbudowania w Blenderze | CC0 | etap 4 |
| Drzewa | modele Poly Haven (jodła, drzewa liściaste) | Poly Haven | CC0 | etap 5 |

Pełna lista plików i źródeł: `src/assets/photo/LICENSE.md`. Biblioteki, do
których ta sesja miała dostęp: Poly Haven i ambientCG. Nie ma w nich
średniowiecznych budynków ani postaci, dlatego te powstaną w Blenderze.

**Wzorce jakości** (cel, nie źródło zasobów — niczego z tych gier nie kopiuję):
budynki jak w najlepszych budowniczych osad (mur pruski, strzecha, podwórza),
praca widoczna na mapie jak w klasycznych strategiach gospodarczych (każdy
towar ktoś niesie), rycerstwo jak w grach bitewnych o XIII wieku (hełmy
garnczkowe, tuniki herbowe, kropierze). Zdjęć wzorcowych (`target-look/`)
nadal nie ma: do pętli krytyka potrzebne są 6–10 fotografii z licencją CC0 /
CC BY (wieś z muru pruskiego, pole, las mieszany, zamek), nie kadry z gier.

## 11. Odstępstwa od reguł, z powodem

| Reguła | Tu | Powód |
|---|---|---|
| „Stop po Etapie 0 do zatwierdzenia” | plan i od razu budowa | tak brzmiało polecenie |
| Kaskadowe mapy cieni (CSM) | jedna mapa cieni dopasowana do pola widzenia kamery | kamera patrzy z góry na ograniczony fragment ziemi; dopasowanie daje 2–15 cm na teksel bez kosztu kaskad. CSM wraca, jeśli pomiar pokaże braki |
| Auto-ekspozycja z histogramu | stała EV na preset pogody | brak wnętrz, kamera zawsze widzi oświetlony teren |
| Ludzie ze skanów i mocap (R1) | bryły z kodu | etap 4; w tej sesji nie było Blendera |
| Wnętrze / zewnętrze kamery (§6) | jedna kamera strategiczna | gra bez pojazdów |
| Biblioteka fizyki (Rapier) | własny krok: sterowanie do miejsc w szyku i rozpychanie | 200 agentów na płaszczyźnie, brak brył sztywnych |
| KTX2 | tekstury w JPEG, dekodowane do RGBA8 | brak kodera KTX2 w tej sesji; etap 8. LOD i impostory: etap 5 |
| APK od pierwszej grywalnej wersji | etap 8 | nowy wariant w `android/` zmienia wspólny workflow wydania pięciu gier; osobna zmiana po akceptacji |
| Zasięg łuku | 80 m | prawdziwy łuk niesie dalej; mapa ma 400 m, więc zasięg skrócony, tor lotu fizyczny |
