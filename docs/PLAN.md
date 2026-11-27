# Marchland — pełny plan: co zostało

Pisany ręcznie, stan na 27.11.2026 (po przeniesieniu do `anbow1/marchland`). Jedno miejsce z całą pracą, która została: co czeka na właściciela projektu,
co można robić od razu i w jakiej kolejności. Szczegóły są w dokumentach, do których prowadzą odnośniki.
Zrobione rzeczy opisują [MANUAL.md](MANUAL.md) (jak grać) i [../RESULTS.md](../RESULTS.md) (dziennik z pomiarami).

## 1. Gdzie jesteśmy

| Kamień ([GAMEPLAY.md §10](GAMEPLAY.md)) | Stan |
|---|---|
| M1, M1b, M1c — żywe miasto, fachy, wieże i mury | ✔ |
| M2 — bitwa v2 (szyki, postawy, weterani, kapitan, żołd, uzupełnienia, wzniesienia, aktywna pauza, pasek oddziałów) | ✔ |
| M3 — mapa ma znaczenie (punkty, poziomy zamku, układy: pole, przeprawa, bór, dolina, Trzech panów) | ✔ |
| M4 — obraz (postacie z Mixamo na GPU, konie, wozy, las, trawa, budynki z modeli, etapy budowy) | ✔ |
| M5 — przeciwnik i tryby (charaktery, kontry, Obrona, samouczek) | ✔ |
| M6 — telefon i wydanie (KTX2, ustawienia, zapis, PWA, Windows) | ✔ poza przyciskiem Benchmark (§3.4) i pomiarem na telefonie (W3) |
| M7 — epoki | zasady ✔, pojedynki i epoka na start ✔; wszystkie jednostki epok z modeli ✔; przodek i pole ostrzału dział ✔; **budynki epok — czekają** |
| Kampania — pięć misji | ✔ grywalne ([CAMPAIGN.md](CAMPAIGN.md)); drobiazgi w §3.5 |
| Miasto — szachownica, ulice od skrzyżowania do skrzyżowania, polne drogi, ulice gracza na później | ✔ |

## 2. Czeka na właściciela projektu

| # | Co | Po co |
|---|---|---|
| W0 | **Po przeniesieniu**: w `anbow1/marchland` Settings → Pages → `gh-pages`, `/ (root)`; Settings → Actions → General → Workflow permissions → *Read and write*; uruchomić „Marchland for Windows”; potem `anbow1/FPS` na prywatne | gra pod https://anbow1.github.io/marchland/, nowy Marchland.exe |
| W1 | **Działa z XVII w.** (falkonet, kolubryna) — dziś model działa średniowiecznego, mniejszy i większy | wygląd artylerii epoki 2 |
| W2 | **Broń i tarcze**: mała tarcza pikiniera, długa pika i duża tarcza halabardnika, kopia, tarcza lekkiej jazdy, szabla | wygląd broni średniowiecza jest dawny |
| W3 | **Budynki epok**: rusznikarnia, prochownia, katedra, ratusz, manufaktura; domy i warsztaty w wyglądzie epoki 2 i 3 | dziś bryły z kodu i podmiana materiałów |
| W4 | **Kłus konia** (zapętlony); opcjonalnie **przodek** (dwukołowy wózek z amunicją) | jazda i zaprzęgi dział chodzą stępem albo galopem; dziś zaprzęg to same konie przed lawetą |
| W5 | Pomiar na prawdziwym telefonie i karcie graficznej (przycisk Benchmark, gdy będzie) | liczby klatek są dziś z programowego GPU |
| W6 | Opcjonalnie: towary do obejść (ryby w koszu, winogrona, sztabki, ruda, snopki) | dziś zastępcze skrzynie |
| W7 | Usunięcie scalonej gałęzi `claude/close-camera-from-marchland` w mediveal-village | porządek |

Szukając modeli: **wystarczy postać w pozie T albo A** — szkielet daje `tools/blender/autorig.py`. Licencje: CC0 albo
CC BY z autorem, albo Mixamo; nic z gier i modów, żadnych cudzych postaci, nic „NC”.

## 3. Do zrobienia bez nowych zasobów

### 3.1 Z modeli, które już są (w zapasie, ASSETS.md)

1. ~~Obsługa dział epoki 3~~ — zrobione 27.11 (artylerzysta 1815); przy działach epoki 2 wciąż mieszczanie (W1: obsługa z XVII w.).
2. ~~Armata epok 2–3~~ — zrobione 27.11: dwa działa na epokę (lekkie i ciężkie), epoka 3 z modelu działa 1815.
3. ~~Dragoni~~ — zrobione 27.11.
4. ~~Rycerze z joannity~~ — zrobione 27.11.

### 3.2 Epoki w rozgrywce

1. Taktyka komputera z bronią palną: salwy szeregami, linia, dragoni na skrzydle, kontry epok.
2. Zaopatrzenie komputera w żelazo na muszkiety (armie w epoce 2 są małe).
3. Partia trzech komputerów na mapie Trzech panów do końca.
4. Epoki w trybie Obrona; wielkie budowle widoczne (komunikat, kamera, ikona na minimapie).

### 3.3 Obraz

1. ~~Cienie kontaktowe pod budynkami; gęstsza trawa z bliska~~ — zrobione 27.11.
2. Warianty budynków (dwa wyglądy chaty na poziom); poziomy szczegółów z daleka.
3. Ulice: krawężnik, wydeptany środek, płynniejsze skosy polnych dróg.

### 3.4 Wydajność

1. **Przycisk Benchmark** w menu pauzy i `?bench` ([ROUTINE.md R8](ROUTINE.md)) — do pomiaru na telefonie (W5).
2. Profil partii 3 × komputer na Trzech panach po 60 minutach (cel ≤ 4 ms symulacji na krok).
3. Pomiar wczytywania i pamięci z nowymi modelami epok.

### 3.5 Kampania

1. Misja 2: palisada i namioty obozu.
2. Kapitan całej armii.
3. Misja 6 w epoce 2 (oblężenie z armatami i muszkietami).

## 4. Proponowana kolejność

| Etap | Zakres |
|---|---|
| 1 | §3.1: obsługa dział, armata 1815, dragoni, rycerze z joannity |
| 2 | §3.3 pkt 1: cienie kontaktowe, trawa z bliska |
| 3 | §3.2: taktyka z bronią palną, żelazo komputera, Trzech panów do końca, Obrona w epokach |
| 4 | §3.4 pkt 1: przycisk Benchmark |
| 5 | §3.3 pkt 2–3, §3.4 pkt 2–3, §3.5 |
| — | po przyjściu W1–W4: kirasjerzy, broń i tarcze, budynki epok, kłus |

Zrobione 27.11 (szczegóły w `RESULTS.md`): przezbrajanie przez epoki, pojedynki i strojenie broni palnej, epoka na
start, pasek oddziałów, krój chorągwi, ulice gracza na później, ulice od skrzyżowania do skrzyżowania, modele
muszkieterów, piechoty liniowej, strzelców i huzarów, `autorig.py`, przeniesienie do własnego repozytorium.

Każdy etap kończy się tak jak dotąd: testy zielone (`npm test`), zrzuty przed i po, pomiar w `RESULTS.md`,
dokumentacja, wypchnięcie na `claude/rts-medieval-game-2lrgis` i `main`.
