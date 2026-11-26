# Marchland — pełny plan: co zostało

Pisany ręcznie, stan na 27.11.2026. Jedno miejsce z całą pracą, która została: co czeka na właściciela projektu,
co można robić od razu i w jakiej kolejności. Szczegóły są w dokumentach, do których prowadzą odnośniki.
Zrobione rzeczy opisują [MANUAL.md](MANUAL.md) (jak grać) i [../RESULTS.md](../RESULTS.md) (dziennik z pomiarami).

## 1. Gdzie jesteśmy

| Kamień ([GAMEPLAY.md §10](GAMEPLAY.md)) | Stan |
|---|---|
| M1, M1b, M1c — żywe miasto, fachy, wieże i mury | ✔ |
| M2 — bitwa v2 (szyki, postawy, weterani, kapitan, żołd, uzupełnienia, wzniesienia, aktywna pauza) | ✔ zasady i testy; brakuje stałego paska kart oddziałów (§3.1) |
| M3 — mapa ma znaczenie (punkty, poziomy zamku, układy: pole, przeprawa, bór, dolina, Trzech panów) | ✔ |
| M4 — obraz (postacie z Mixamo na GPU, konie, wozy, las, trawa, budynki z modeli, etapy budowy) | ✔ dla średniowiecza; epoki — §2 |
| M5 — przeciwnik i tryby (charaktery, kontry, Obrona, samouczek) | ✔ |
| M6 — telefon i wydanie (KTX2, ustawienia, zapis, PWA, Windows, Android) | ✔ poza przyciskiem Benchmark (§3.4) i pomiarem na prawdziwym telefonie (§2) |
| M7 — epoki | zasady ✔ (zamek 4–5, sześć jednostek, broń palna, wielkie budowle, komputer w epokach); **wygląd czeka na modele** |
| Kampania — pięć misji | ✔ grywalne wszystkie ([CAMPAIGN.md](CAMPAIGN.md)); drobiazgi w §3.5 |
| Miasto — szachownica ulic, ulice od skrzyżowania do skrzyżowania, polne drogi | ✔ |

## 2. Czeka na właściciela projektu

Tych rzeczy nie zrobię sam: potrzebne są pliki, konto albo urządzenie.

| # | Co | Po co | Gdzie opisane |
|---|---|---|---|
| W1 | **Modele i animacje epok 2 i 3**: muszkieter, kirasjer, dragon, piechota liniowa, strzelec, huzar | jednostki epok chodzą dziś na modelach średniowiecznych | [AGES.md §4](AGES.md) pkt 1–6 |
| W2 | **Broń i tarcze**: mała tarcza pikiniera, długa pika i duża tarcza halabardnika, kopia, tarcza lekkiej jazdy, muszkiet, szabla | zasady składu jednostek działają, wygląd broni jest dawny | [AGES.md §4](AGES.md) pkt 8 |
| W3 | **Budynki epok**: rusznikarnia, prochownia, katedra, ratusz, manufaktura; domy i warsztaty w wyglądzie epoki 2 i 3 | dziś bryły z kodu i podmiana materiałów | [AGES.md §4](AGES.md) pkt 9–11, [BLENDER.md](BLENDER.md) |
| W4 | **Kłus konia** (zapętlony) | jazda w marszu chodzi dziś za wolnym stępem albo galopem | [AGES.md §4](AGES.md) pkt 7, [ASSETS.md](ASSETS.md) |
| W5 | Towary do obejść w stylu KayKit: ryby w koszu, winogrona, sztabki żelaza, ruda, snopki | opcjonalne; dziś zastępcze skrzynie | [ASSETS.md](ASSETS.md) „Szukamy” pkt 4 |
| W6 | **Stały klucz podpisu Androida**: sekrety `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (i hasło klucza) w ustawieniach repozytorium | bez nich każda wersja APK ma inny klucz, trzeba odinstalować starą | `README.md` (główny) i `.github/workflows/android.yml` |
| W7 | **Pomiar na prawdziwym telefonie i karcie graficznej**: uruchomić przycisk Benchmark (gdy będzie, §3.4) i przysłać tabelę | wszystkie liczby klatek są z programowego GPU; kryterium M6 | [ROUTINE.md R8](ROUTINE.md), [PLAYBOOK.md §7](PLAYBOOK.md) |
| W8 | Decyzja o ubraniach MetaHuman / MakeHuman („bar patrons outfits”, „scalemail”, „Bandit Armor”): inne szkielety niż Mixamo | warto tylko, jeśli mają zastąpić stroje mieszczan lub zbroje | [ASSETS.md](ASSETS.md) |
| W9 | Usunięcie gałęzi `claude/close-camera-from-marchland` w mediveal-village (scalona; sesja nie ma prawa kasować gałęzi) | porządek | GitHub → Branches |

Licencje bez zmian: CC0 albo CC BY z podpisem autora, albo Mixamo; nic z gier i modów, żadnych cudzych postaci;
surowe pliki Mixamo nie trafiają do repozytorium.

## 3. Do zrobienia bez zasobów (mogę zaczynać od razu)

Zrobione z tej listy (27.11): przezbrajanie przez epoki (od milicji do piechoty liniowej, jazda do huzarów); tabela
pojedynków epok i strojenie (§3.2 pkt 1); **epoka na start** potyczki (§3.2 pkt 4, część). Pomiar: w zwykłej partii
komputery kończą wojnę w 37.–46. minucie bez podnoszenia zamku, więc „wcześniejsze epoki komputera” (§3.2 pkt 3)
zastąpiła epoka na start; zostaje zaopatrzenie komputera w żelazo na muszkiety (armie epoki 2 są małe).

### 3.1 Interfejs ([GAMEPLAY.md §9](GAMEPLAY.md) „Do zrobienia”)

1. **Stały pasek kart oddziałów** na dole ekranu: siła, morale, stopień, postawa; klik zaznacza, dwuklik
   ustawia kamerę. Na telefonie przewijany.
2. **Kształt, nie tylko kolor**: chorągwie trzech stron różnią się krojem (przy trzech barwach to ważne),
   stan oddziału ikoną (ucieka, bez kapitana, nieopłacony), dla daltonistów.
3. **Ulice gracza na później**: gdy przy stawianiu brakuje kamienia, ulica trafia do kolejki i kładzie się
   sama, gdy kamień przyjdzie (dziś trzeba ją dorysować narzędziem Droga); polne drogi do budynków gracza
   poza siatką — jak u komputera (opcja w ustawieniach).

### 3.2 Epoki w rozgrywce (zasady są, strojenie i taktyka nie)

1. **Macierz pojedynków epok**: muszkieterowie, piechota liniowa, strzelcy, kirasjerzy, dragoni, huzarzy
   przeciw średniowiecznym i sobie nawzajem (jak test z 11.11): żadna jednostka nie wygrywa ze wszystkimi,
   każda ma tańszą kontrę; strojenie liczb w `config.ts`.
2. **Taktyka komputera z bronią palną**: salwy szeregami, piechota liniowa w linii, dragoni spieszeni na
   skrzydle, kontry z epokami (dużo zbroi → muszkiety).
3. **Partia do końca na mapie Trzech panów**: komputer–komputer–komputer kończy grę; czas wejścia w epokę 2
   w zwykłej partii (dziś ok. 115.–125. minuty przy epokach od 30. — za późno, by gracz to zobaczył). Cel:
   epoka 2 w ok. 60.–75. minucie długiej partii.
4. **Epoki w trybie Obrona** (fale w nowej epoce po 20. minucie) i **opcja startu w epoce 2** w potyczce
   (od razu zamek 4 i część miasta), żeby nie trzeba było grać dwóch godzin.
5. **Wielkie budowle widać**: komunikat i ujęcie kamery po ukończeniu, ikona na minimapie.

### 3.3 Obraz (z porównania z mediveal-village i z [BLENDER.md](BLENDER.md))

1. **Cienie kontaktowe** pod budynkami (miękkie przyciemnienie gruntu przy ścianach; u nich to robi
   połowę wrażenia z bliska).
2. **Gęstość trawy z bliska** (więcej źdźbeł przy kamerze poniżej 25 m, bez kosztu z daleka).
3. **Warianty budynków**: dwa wyglądy chaty na poziom, żeby ulica nie była z jednej formy.
4. **Poziomy szczegółów** budynków dla widoku z daleka (cała mapa 860 m na Trzech panach).
5. **Ulice**: krawężnik i mocniej wydeptany środek; płynniejsze skosy polnych dróg (dziś schodki komórek 2 m
   rozmyte w teksturze).

### 3.4 Wydajność

1. **Przycisk Benchmark** w menu pauzy i `?bench` ([ROUTINE.md R8](ROUTINE.md)): sześć widoków po 5 s, tabela fps,
   p95, czas symulacji i rysowania, wywołania, trójkąty — do pomiaru na telefonie (W7).
2. Profil partii 3 × komputer na mapie Trzech panów po 60 minutach (dziś najdroższe: ruch żołnierzy
   i sprawdzanie wody); cel ≤ 4 ms symulacji na krok na laptopie.
3. Pomiar wczytywania i pamięci po epokach (nowe budynki i materiały epok).

### 3.5 Kampania ([CAMPAIGN.md §7](CAMPAIGN.md))

1. Misja 2: palisada i namioty obozu (dziś obóz to oddziały na polu).
2. Kapitan całej armii (dowódca, którego śmierć łamie morale wszystkich) — zapisany w GAMEPLAY jako „później”.
3. Misja 6 w epoce 2 (po modelach W1–W3): oblężenie z armatami i muszkietami.

### 3.6 Dokumentacja i porządek

1. Po każdej zmianie: `npm run docs`, wpis w `RESULTS.md`, ten plik (przekreślić zrobione).
2. Paczka assetów (`asset-pack/`) po wpięciu modeli epok.

## 4. Po przyjściu zasobów (krok 4 epok)

Kolejność wpinania, gdy pliki będą w repozytorium (każdy punkt: model → wypiek → zrzut obok starego → wpis
w ASSETS i CREDITS):

1. Muszkieter (W1) — od razu zastępuje model trzech jednostek strzelających (muszkieterowie, piechota
   liniowa, strzelcy) z różnymi strojami z tej samej postaci; animacje ładowania i salwy podpięte pod
   `musketShot`.
2. Kłus (W4) — marsz jazdy.
3. Kirasjer, dragon, huzar (W1) na istniejącym koniu.
4. Broń i tarcze (W2) dopięte do dłoni istniejących żołnierzy średniowiecza.
5. Budynki epok (W3): najpierw wielkie budowle (widać je z daleka), potem rusznikarnia i prochownia, na końcu
   domy i warsztaty poziomów 4–5 (zamiast podmiany materiałów `ERA_LOOK`).

## 5. Proponowana kolejność

| Etap | Zakres | Zależy od |
|---|---|---|
| 1 | §3.2 pkt 1–3: macierz pojedynków epok, taktyka z bronią palną, partia Trzech panów do końca, wcześniejsze epoki komputera | — |
| 2 | §3.1: pasek kart oddziałów, kształty chorągwi i ikony stanu, ulice gracza na później | — |
| 3 | §3.3 pkt 1–2: cienie kontaktowe, trawa z bliska | — |
| 4 | §3.2 pkt 4–5: start w epoce 2, epoki w Obronie, widoczne wielkie budowle | etap 1 |
| 5 | §4: wpinanie modeli epok | W1–W4 |
| 6 | §3.3 pkt 3–5, §3.4, §3.5 | etap 5 dla misji 6 |
| 7 | Przycisk Benchmark (§3.4 pkt 1), potem pomiar na telefonie i stały klucz Androida | W6, W7 |

Każdy etap kończy się tak jak dotąd: testy zielone (`npm test`), zrzuty przed i po, pomiar w `RESULTS.md`,
dokumentacja, wypchnięcie na `claude/rts-medieval-game-2lrgis` i `main`.
