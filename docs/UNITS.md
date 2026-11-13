# Marchland — jednostki

*Plik generowany przez `npm run docs` z `src/config.ts`. Nie poprawiaj ręcznie:
zmień konfigurację (albo tekst w `tools/docs.ts`) i wygeneruj ponownie.*

## 1. Zasady wspólne

- Limit: 100 żołnierzy na stronę (200 na polu). W kolejce koszar najwyżej 3 rozkazy.
- Regiment powstaje z mieszkańców: tylu ludzi, ilu żołnierzy (machiny: obsługa), idzie do koszar,
  bierze ekwipunek z magazynu zamku i dopiero wtedy staje w szyku przed miastem.
- Poziom koszar decyduje, kogo można szkolić (kolumna „Koszary”).
- Żołnierz zjada 0.25 racji na minutę z magazynu zamku; głodne wojsko ma morale niższe o 25.
- Walka: szyk, zmęczenie, morale, flanka i tył, szarża, ucieczka i zbiórka — jak w grach Total War,
  w skali regimentów po 8–12 ludzi. Liczby w `src/config.ts` (COMBAT, FATIGUE, MORALE, MISSILE).

## 2. Tabela

Cena obejmuje cały regiment. Atak / obrona to punkty; pancerz to część ciosu, którą zbiera zbroja.

| Jednostka | Koszary | Ludzi | Cena regimentu | Życie | Atak / obrona | Pancerz | Obrażenia | Morale | Marsz / bieg (m/s) |
|---|---|---|---|---|---|---|---|---|---|
| **Milicja z tarczami** | 1 | 12 | 30 zł + 12 drewno | 24 | 4 / 5 | 0 % | 4 | 45 | 1.4 / 3.1 |
| **Pikinierzy** | 1 | 12 | 50 zł + 12 zbroja skórzana, 12 broń | 30 | 6 / 7 | 20 % | 5 | 60 | 1.4 / 2.9 |
| **Łucznicy** | 1 | 12 | 50 zł + 12 zbroja skórzana, 12 łuk | 24 | 3 / 3 | 20 % | 3 | 50 | 1.4 / 3.1 |
| **Miecznicy** | 2 | 12 | 90 zł + 12 broń, 12 kolczuga | 36 | 9 / 9 | 40 % | 7 | 75 | 1.4 / 2.7 |
| **Halabardnicy** | 2 | 12 | 100 zł + 12 broń, 12 kolczuga | 34 | 10 / 6 | 35 % | 10 | 70 | 1.4 / 2.7 |
| **Kusznicy** | 2 | 12 | 80 zł + 12 drewno, 12 zbroja skórzana, 12 łuk | 26 | 4 / 5 | 20 % | 4 | 55 | 1.4 / 2.9 |
| **Lekka jazda** | 2 | 8 | 100 zł + 8 zbroja skórzana, 8 broń, 8 koń | 40 | 7 / 5 | 20 % | 6 | 65 | 3.6 / 8.5 |
| **Ciężka jazda** | 3 | 8 | 160 zł + 8 broń, 8 kolczuga, 8 koń | 52 | 10 / 9 | 45 % | 8 | 85 | 3.6 / 7.5 |
| **Balisty** | 2 | 2 (6 ludzi) | 120 zł + 24 drewno, 4 broń | 70 | 0 / 0 | 0 % | 0 | 55 | 0.9 / 0.9 |
| **Trebusz** | 3 | 1 (8 ludzi) | 200 zł + 40 drewno, 10 kamień | 140 | 0 / 0 | 0 % | 0 | 60 | 0.6 / 0.6 |

## 3. Strzelcy i machiny

| Jednostka | Zasięg | Obrażenia | Przebicie pancerza | Przeładowanie | Rozprysk | Obrażenia budynków |
|---|---|---|---|---|---|---|
| **Łucznicy** | 80 m | 9 | 0 % | 6 s | — | 1.5 |
| **Kusznicy** | 70 m | 16 | 60 % | 10 s | — | 2 |
| **Balisty** | 12–110 m | 45 | 80 % | 9 s | — | 14 |
| **Trebusz** | 35–135 m | 26 | 50 % | 14 s | 3.5 m | 90 |

Zamek strzela sam: zasięg 55 m, strzała co 1 s, 9 obrażeń.

## 4. Do czego służą

- **Milicja z tarczami** — Tania zapora: trzyma linię za tarczą, szybko ucieka. Do obrony miasta i wiązania wroga. *(25 % szans zatrzymania pocisku)*
- **Pikinierzy** — Las pik zatrzymuje jazdę, zwłaszcza szarżę od czoła. Bezbronni wobec strzelców. *(+8 do ataku przeciw jeździe; zasięg broni 3 m)*
- **Łucznicy** — Daleki, szybki ostrzał lekko zbrojnych. W zwarciu giną; trzymać za linią.
- **Miecznicy** — Miecz, tarcza, kolczuga: wygrywają zwykłą walkę pieszą i znoszą ostrzał. *(35 % szans zatrzymania pocisku)*
- **Halabardnicy** — Biją mocniej niż miecznicy i zatrzymują konie, ale bez tarczy cierpią od strzał. *(+5 do ataku przeciw jeździe; zasięg broni 2.3 m)*
- **Kusznicy** — Wolno ładują, bełt przebija kolczugę: odpowiedź na ciężkozbrojnych. *(30 % szans zatrzymania pocisku)*
- **Lekka jazda** — Najszybsza: zagony na wsie, strzelców i machiny, pościg za uciekającymi. *(szarża +8 do ataku, wstrząs 9)*
- **Ciężka jazda** — Rycerstwo: szarża, która łamie linię. Nie na piki od czoła. *(szarża +12 do ataku, wstrząs 15; 30 % szans zatrzymania pocisku)*
- **Balisty** — Dwie machiny: daleki bełt, który ignoruje pancerz. Bezradne, gdy wróg dojdzie. *(70 % szans zatrzymania pocisku)*
- **Trebusz** — Jedna machina: kamienie rozbijają szyk i burzą mury oraz zamek. *(80 % szans zatrzymania pocisku)*

## 5. Kto kogo bije

- **Piki i halabardy** zatrzymują **jazdę**; jazda nie szarżuje na nie od czoła.
- **Jazda** rozjeżdża **strzelców** i **machiny** oraz dobija uciekających.
- **Strzelcy** wykrwawiają **pikinierów** i **halabardników** (brak tarcz); **kusze** biją **kolczugi**.
- **Miecznicy** wygrywają z każdą piechotą w zwarciu i znoszą ostrzał za tarczą.
- **Trebusz** rozbija zwarty szyk i mury; **balista** zdejmuje pojedynczych ciężkozbrojnych z daleka.
- Atak z **flanki** i od **tyłu** trafia łatwiej i łamie morale szybciej niż jakakolwiek przewaga punktów.

## 6. Łańcuchy ekwipunku

- zbroja skórzana ← garbarnia ← skóry ← chlewnia ← zboże
- broń ← kuźnia ← żelazo + drewno ← huta ← ruda + drewno
- kolczuga ← płatnerz ← żelazo ← huta ← ruda + drewno
- łuk ← łuczarz ← drewno
- koń ← stajnia ← zboże
