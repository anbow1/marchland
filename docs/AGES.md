# Marchland — epoki: stan, zasady, czego brakuje

Pisany ręcznie. Liczby jednostek i budynków są w plikach generowanych ([UNITS.md](UNITS.md),
[BUILDINGS.md](BUILDINGS.md), [RULES.md](RULES.md)) — tu jest obraz całości, decyzje i lista zasobów, na które
epoki czekają. Jak w to grać: [MANUAL.md §7.6](MANUAL.md).

## 1. Decyzja

Rozbudowa zamku to wejście w nową epokę: nowe jednostki, nowy wygląd budynków, jedna wielka budowla na epokę.
Wybrane z właścicielem projektu: **dobudować epoki** do istniejącej gry (dotychczasowa gra to epoka 1), mapa
**Trzech panów** — trzy zamki w trójkącie, **każdy z każdym**.

| Krok | Co | Stan |
|---|---|---|
| 1 | Tekstury KTX2 (miejsce w pamięci karty na wygląd kolejnych epok): 307 → 67 MB | zrobione |
| 2 | Większa mapa (860 m) i trzecia strona, komputer wybiera wroga (zagrożenie, słabszy) | zrobione |
| 3 | Epoka 2 i 3 w zasadach: zamek 4–5, budynki 4–5, sześć jednostek, broń palna, wielkie budowle, komputer w epokach | zrobione, wygląd zastępczy |
| 4 | Wygląd epok: modele jednostek, broni, budynków | **czeka na zasoby** (§4) |

## 2. Trzy epoki

| Epoka | Zamek | Budynki | Jednostki (poziom koszar) | Wielka budowla |
|---|---|---|---|---|
| 1 · Średniowiecze | 1–3 | 1–3 | milicja; skórzane: pikinierzy, łucznicy, kusznicy, lekka jazda; ciężkozbrojne: miecznicy, halabardnicy, rycerze (1–3) | **Katedra** (zamek 3): +8 morale wszystkim oddziałom, domy zapełniają się o ¼ szybciej |
| 2 · Wczesna nowożytność | 4 | 4 · rusznikarnia, prochownia | muszkieterowie, kirasjerzy, dragoni (4) | **Ratusz**: +25% złota z domów |
| 3 · XIX wiek | 5 | 5 | piechota liniowa, strzelcy, huzarzy (5) | **Manufaktura**: każdy warsztat o 20% szybciej |

- **Wejście w epokę** trwa 3 (zamek 4) i 4 minuty (zamek 5) i kosztuje dużo (zamek 4: 1200 zł, 200 desek,
  400 kamienia, 40 żelaza; zamek 5: 2200 zł, 300 desek, 600 kamienia, 120 żelaza). Poziom budynku powyżej 3
  wymaga zamku tej samej epoki.
- **Broń palna**: muszkiet i proch to nowe towary (rusznikarnia: drewno + żelazo → muszkiet; prochownia:
  2 drewna + kamień → 2 prochu; oba także na targu). Kula przebija zbroję **i tarczę** (część równa przebiciu),
  leci płasko i szybko, ładowanie trwa 14–20 s. Strzał: błysk, huk i dym nad szeregiem.
- **Epoka na start** (menu potyczki, adres `?age=2|3`): wszystkie zamki od razu w epoce, gotowe koszary jej
  poziomu, zapas (`START_AGE`) z muszkietami i prochem; komputer najpierw stawia rusznikarnię i prochownię
  i werbuje wojska epoki (`AGE_ROTA`). W zwykłej partii komputery kończą wojnę w 37.–46. minucie, zanim
  podniosą zamek na poziom 2, więc bez tej opcji epok nie widać.
- **Przezbrajanie przez epoki**: oddział zachowuje ludzi, doświadczenie i kapitana; piechota od milicji przez
  muszkieterów do piechoty liniowej (albo strzelców), jazda od lekkiej do dragonów i huzarów, rycerze do
  kirasjerów (`REARM.paths`; kiedy — decyduje poziom koszar). Komputer przezbraja stare oddziały w nowej epoce
  (`modernise` w `ai.ts`).
- **Przodek i pole ostrzału** (wszystkie działa): zaprzęganie przed marszem i odprzęganie po nim trwa
  (`limberS`: działa konne 5 s, falkonety 6 s, armaty polowe 10 s, armaty 12 s, kolubryny 15 s, moździerz 20 s).
  Działo strzela tylko odprzęgnięte, w pasie ±15° od kierunku (`GUNS.arcRad`), i obraca się do celu powoli
  (`aimTurnRadS`). Działa epok 2–3 ciągną konie (2 przy falkonetach, 4 przy cięższych, `teamHorses`).
- **Komputer** wchodzi w epoki po 50. minucie: odkłada pełną cenę zamku w złocie, brakujące deski, kamień i żelazo
  kupuje na targu, potem stawia katedrę, rusznikarnię, prochownię, ratusz i manufakturę, podnosi koszary
  i werbuje nowe wojska. W próbie z epokami od 30. minuty doszedł do zamku 4 około 115.–125. minuty.

## 3. Wygląd zastępczy (do czasu modeli)

| Co | Teraz | Docelowo |
|---|---|---|
| Piechota liniowa, strzelcy | **z modelu** (27.11): piechur napoleoński Andy'ego Woodheada (szkielet Unreala), muszkiet gry (piechota z bagnetem), płaszcz albo spodnie w barwie strony | ładowanie i salwa (klip Mixamo) |
| Muszkieterowie | **z modelu** (27.11): żołnierz XVII w. (haiphucpham221102) na szkielecie z `autorig.py`, muszkiet gry | — |
| Kirasjerzy | **z modelu** (27.11): kirasjer 1812panorama w siodle (szkielet z `autorig.py`) | — |
| Huzarzy | **z modelu** (27.11): jeździec Andy'ego Woodheada w siodle, dolman w barwie strony | — |
| Dragoni | **z modelu** (27.11): żołnierz ok. 1700 r. (Christoffer Eriksson) w siodle, kaftan w barwie strony |
| Artyleria epoki 2: falkonety (lekkie) i kolubryny (ciężkie) | **z modeli** (27.11): falkonet — lekkie działo z brązu (Chenchanchong), kolubryna — hongipo (KCISA); obsługa z artylerzysty 1815 | — |
| Artyleria epoki 3: działa konne (lekkie) i armaty polowe (ciężkie) | **z modeli** (27.11): działa konne — 12-funtówka (iedalton), armaty polowe — działo 1815 (Andy Woodhead); obsługa z artylerzysty 1815 | — |
| Budynki na poziomie 4 i 5 | ten sam budynek w materiałach epoki: 4 — dachówka i bielony tynk, 5 — kamień, łupek, malowane belki (`ERA_LOOK` w `surfaceModel.ts`) | spójne modele epoki: szachulec i cegła, potem cegła i tynk |
| Rusznikarnia, prochownia, katedra, ratusz, manufaktura | bryły z kodu (`buildingGeometry.ts`); manufaktura z cegły z kominem | modele |
| Broń i tarcze średniowiecza: mała tarcza pikiniera, długa pika i duża tarcza halabardnika, kopia rycerza, tarcza lekkiej jazdy | zasady działają, na modelach broń dotychczasowa | modele broni dopięte do istniejących szkieletów |

## 4. Czego szukamy (lista dla właściciela projektu)

Licencje jak dotąd: **CC0 albo CC BY** (z podpisem autora w [ASSETS.md](ASSETS.md)) albo **Mixamo**. Bez
modeli wyciętych z gier i modów, bez cudzych postaci. Surowe pliki Mixamo nie trafiają do repozytorium (gra
dostaje wypieczony ruch). Animacje Mixamo: FBX, *Without Skin* (albo ze skórą, gdy chodzi też o postać),
30 kl./s, przy ruchu zaznaczone *In Place*. Kontrakt na skalę, materiały i budżety: [BLENDER.md](BLENDER.md).

**Jednostki epok 2 i 3** (szkielet Mixamo, ok. 3–8 tys. trójkątów):

1. Muszkieter (kapelusz, kaftan, bandolier) — animacje: stanie, marsz, bieg, ładowanie, strzał, trafienie,
   śmierć. Ładowanie i strzał: np. z serii Mixamo „Rifle” (*Rifle Idle*, *Firing Rifle*, *Reload*).
2. Kirasjer (napierśnik, hełm) — na koniu: siad w siodle, cięcie z konia.
3. Dragon — pieszo jak muszkieter, konno jak kirasjer.
4. Żołnierz piechoty liniowej (mundur, czako) — marsz w szyku, salwa, bagnet.
5. Strzelec (mundur, karabin gwintowany) — strzał klęcząc albo stojąc.
6. Huzar (dolman, kołpak) — cięcie szablą z konia.
7. Koń: **kłus** (pętla) — brakuje od dawna; jest chód i galop.

**Broń i tarcze** (same modele, bez szkieletu; dopnę do dłoni):

8. Mała okrągła tarcza pikiniera; długa pika (5–6 m) i duża tarcza halabardnika; kopia rycerza; tarcza
   lekkiej jazdy; muszkiet; szabla.

**Budynki** (styl zgodny z obecnymi; ok. 2–10 tys. trójkątów, jeden materiał albo atlas):

9. Rusznikarnia, prochownia (epoka 2).
10. Katedra (epoka 1, duża), ratusz (epoka 2), manufaktura (epoka 3, cegła, kominy).
11. Domy i warsztaty w wyglądzie epoki 2 (szachulec, cegła, dachówka) i 3 (cegła, tynk, łupek) — wystarczy
    kilka brył, z których złożę resztę, jak dziś z części (`buildingParts.ts`).

## 5. Gdzie to jest w kodzie

| Co | Plik |
|---|---|
| poziomy, ceny, jednostki, budynki, wielkie budowle (`ERAS`, `KEEP_LEVELS`, `GREAT`, `UNITS`, `BUILDINGS`) | `src/config.ts` |
| epoka miasta, efekty wielkich budowli (`eraOf`, `greatFactor`) | `src/sim/economy.ts` |
| broń palna (kula przez tarczę, zdarzenie `musketShot`) | `src/sim/missiles.ts` |
| komputer w epokach (`AGES_ORDER`, `buyForKeep`, `keepPriceInGold`) | `src/sim/ai.ts` |
| wygląd epoki budynków (`ERA_LOOK`), bryły nowych budynków | `src/render/surfaceModel.ts`, `src/render/buildingGeometry.ts` |
| modele zastępcze jednostek (`SKINNED_KINDS`) | `src/render/armyView.ts` |
| testy | `tests/ages.test.ts`, `tests/triangle.test.ts` |
