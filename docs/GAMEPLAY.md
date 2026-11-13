# Marchland — plan rozgrywki

Dokument decyzyjny: co gra ma robić, w jakiej kolejności to budujemy i po czym
poznamy, że działa. Stan dzisiejszy opisuje `../README.md`; tu jest cel.
Liczby są punktem wyjścia do strojenia w testach (`tests/`), nie obietnicą.

Wzorce, z których biorę **zasady, nie zasoby**: strategie gospodarcze, w
których każdy towar ktoś niesie; budowniczowie osad, w których wojsko to ci
sami ludzie, co pracują w polu; gry bitewne, w których rozstrzyga morale i
flanka, a nie liczba kliknięć.

## 1. Cztery filary

1. **Gospodarkę widać.** Każdy towar leży pod budynkiem albo ktoś go niesie.
   Zator widać na mapie, zanim pokaże go liczba.
2. **Ludzie są jedni.** Ten sam mieszkaniec jest pracownikiem, tragarzem albo
   żołnierzem. Powołanie regimentu zabiera dwunastu ludzi z pracy.
3. **Bitwa szyków.** Kilka–kilkanaście oddziałów na stronę; rozkaz dostaje
   oddział, rozstrzyga morale, kierunek ataku i teren.
4. **Jedna sesja.** Mapa 400 × 400 m, 25–35 minut, bez prowadzenia pojedynczej
   postaci za rękę. Aktywna pauza zamiast szybkich palców.

Czego gra **nie** ma mieć: mgły wojny (mapa jest mała i ma być czytelna),
dowolnego stawiania budynków (zostają działki), drzewka technologii,
mikrotransakcji, krwi.

## 2. Przebieg sesji

| Minuty | Faza | Co robi gracz | Co musi być gotowe, żeby faza działała |
|---|---|---|---|
| 0–5 | Osada | drwal, pole, chaty; pierwsi tragarze | ludność, tragarze, budowa z dostawą |
| 5–12 | Łańcuchy | piekarnia, chlewnia, garbarnia, kopalnia, kuźnia; poziom 2 zamku | magazyny budynków, zatory, alarmy |
| 10–18 | Pierwsza krew | milicja i pikinierzy; obrona pola przed zagonem; zajęcie wsi na środku | działki za murami, punkty na mapie, zagony komputera |
| 15–28 | Wojna | armia mieszana, bitwa w polu, uzupełnienia | szyki, postawy, weterani, kapitan |
| 25–35 | Oblężenie | machiny, szturm zamku albo odparcie ostatniej fali | brama, palisada, garnizon |

Miary tempa (testy symulacji bez gracza, jak dziś `tests/game.test.ts`):
pierwszy regiment między 5. a 8. minutą; pierwsza bitwa 3 na 3 przed 15.
minutą; partia komputer–komputer kończy się zwycięstwem jednej strony w 25–40
minut (dziś na normalnym poziomie nie kończy się wcale — obrona jest za mocna).

## 3. Ludność

- Chata daje rodziny: poziom 1 — 6 osób, poziom 2 — 10, poziom 3 — 14. Ludzie
  przybywają po jednym co 40 s, dopóki chata jest najedzona; z głodnej
  odchodzą.
- Każdy człowiek ma jedną rolę: **pracownik** (przypisany do budynku),
  **tragarz**, **budowniczy** albo **żołnierz**. Przydział jest automatyczny:
  najpierw obsada budynków w kolejności ich budowy, reszta dzieli się na
  tragarzy i budowniczych 3 : 1. Gracz widzi licznik („wolni: 4, tragarze: 9,
  budowniczowie: 3”) i może wyłączyć budynek, żeby zwolnić pracownika.
- Budynek rzemieślniczy potrzebuje 1 pracownika (poziom 3: 2). Pracownik idzie
  z chaty do warsztatu; bez niego budynek stoi.
- **Werbunek zabiera ludzi**: regiment to 12 (jazda 8, balisty 6, trebusz 8)
  mieszkańców, którzy idą do koszar po ekwipunek i dopiero wtedy stają w szyku.
  Limit armii to nadal 100, ale realnym ograniczeniem jest ludność.
- Rozwiązany oddział wraca do pracy; ekwipunek wraca do magazynu.
- Podatek: 1 złota na osobę na 50 s, tylko od najedzonych.

Cel projektowy: pełne miasto to około 110–130 osób, z czego 25–35 trzyma
gospodarkę. Armia stu ludzi jest możliwa, ale kosztem produkcji — to ma boleć.

## 4. Logistyka

- Budynek ma **skład wyjściowy** (do 8 sztuk każdego wyrobu) i **wejściowy**
  (do 6 sztuk każdego surowca). Pełny skład wyjściowy zatrzymuje produkcję.
- **Spichlerz** to zamek (później osobny budynek „Skład”). Tu trafia nadwyżka i
  stąd bierze się towar na budowę i dla wojska.
- Tragarz bierze najstarsze zlecenie: brak w składzie wejściowym → przynieś z
  najbliższego źródła (skład wyjściowy producenta albo spichlerz). Niesie do 3
  sztuk jednego towaru; idzie ścieżkami miasta z prędkością 1,4 m/s, poza
  ścieżką 1,0 m/s.
- **Budowa**: plac budowy zamawia drewno i kamień; każda dostawa to część
  postępu, resztę dokładają budowniczowie na miejscu (czas dzielony przez ich
  liczbę, najwyżej 3). Budynek rośnie etapami: fundament → szkielet → ściany →
  dach.
- **Jedzenie** trafia do chat (skład wejściowy: chleb, kiełbasy). Głodna chata
  = jej ludzie pracują o połowę wolniej i nie płacą podatku. Wojsko w polu je
  ze spichlerza; brak racji obniża morale jak dziś.
- Cykle produkcji wydłużają się około dwukrotnie względem dzisiejszych, bo
  dochodzi czas przenoszenia; strojenie w teście „łańcuch chlewnia → garbarnia
  daje 12 zbroi w 6 minut przy 3 tragarzach”.
- **Zagrożenie**: gdy wrogi oddział jest bliżej niż 30 m, pracownicy i tragarze
  uciekają do zamku i praca staje. Zabity mieszkaniec to strata ludności.

Etap pośredni (żeby nie czekać na całość): najpierw sami tragarze i składy przy
budynkach jako **obraz** dzisiejszej ekonomii (towar znika z magazynu i pojawia
się u odbiorcy tak jak teraz, a postacie tylko to pokazują), potem przełączenie
na prawdziwe czasy dostaw. Przełącznik w `config.ts`, oba tryby pod testami.

## 5. Miasto i mapa

- **Zamek ma trzy poziomy** (jak poziom osady): 1 — dwór z palisadą, 8 działek
  w mieście, koszary do poziomu 1; 2 — kamienna wieża, 12 działek, koszary do
  poziomu 2, brama; 3 — zamek, 14 działek, koszary do poziomu 3, mocniejszy
  garnizon. Koszt rośnie w złocie i kamieniu.
- **Działki mają rodzaj**: miejskie (chaty, rzemiosło, koszary), polne (pole,
  chlewnia, stajnia — 4 na stronę, 60–90 m od zamku), leśne (drwal — 2),
  skalne (kamieniołom — 1, kopalnia — 1). Działki poza miastem są celem
  zagonów: to tam lekka jazda ma co robić.
- **Punkty na środku mapy** (zajmuje je oddział, który stoi przy nich 20 s bez
  wroga w pobliżu): bogata kopalnia (ruda bez kopalni własnej), kamieniołom,
  wieś (6 osób i ich podatek). Punkt daje dochód, dopóki jest trzymany.
- **Trzy układy mapy**, każdy z ziarnem losowym: *Otwarte pole* (dzisiejsza),
  *Przeprawa* (rzeka z mostem i dwoma brodami — wąskie gardła), *Trakt przez
  bór* (dwie polany połączone drogą przez las — zasadzki piechoty, jazda
  bezużyteczna między drzewami).
- **Wzniesienia liczą się**: strzelcy z góry mają +15 % zasięgu, szarża w dół
  +25 % premii, walka pod górę −1 do ataku.

## 6. Wojsko

Skład zostaje (milicja, pikinierzy, łucznicy, miecznicy, halabardnicy,
kusznicy, lekka i ciężka jazda, balisty, trebusz). Dochodzi:

| Element | Zasada |
|---|---|
| **Szyki** | linia (domyślna); kolumna (marsz +20 %, front węższy); jeż pikinierów (stoi, kontra na jazdę z każdej strony, −50 % ruchu); klin ciężkiej jazdy (+30 % premii szarży, słabsze boki); luźny szyk strzelców (−40 % strat od pocisków, −morale w zwarciu) |
| **Szerokość szyku** | przeciągnięcie prawym przyciskiem ustawia front i liczbę ludzi w szeregu (4–12) |
| **Postawy** | trzymaj pozycję / pilnuj (domyślna: odpowiada na atak w promieniu 12 m) / harcuj (strzelcy cofają się przed piechotą); osobno „wstrzymaj ogień” |
| **Rozkazy** | marsz, bieg, atak, szarża (bieg od razu), cofaj się frontem do wroga, stój, odwrót do zamku, obsadź zamek |
| **Weterani** | trzy stopnie za zabitych i przetrwane bitwy: +1 atak, +1 obrona, +5 morale każdy; uzupełnienie rozcieńcza stopień |
| **Kapitan** | jeden oddział przyboczny (ciężka jazda z chorągwią); w promieniu 40 m +10 morale; jego śmierć to wstrząs dla całej armii; nowy dopiero po 3 minutach |
| **Uzupełnienia** | oddział stojący do 60 m od koszar, poza walką, dobiera ludzi z ludności za ekwipunek na głowę |
| **Żołd** | wojsko zawodowe (klasa 2–3 i machiny) kosztuje złoto co minutę; milicja i klasa 1 tylko jedzenie. Bez żołdu morale spada |
| **Oblężenie** | palisada i brama od 2. poziomu zamku: bramę rozbija piechota (wolno), balista (średnio), trebusz (szybko); garnizon strzela z murów |

Aktywna pauza (spacja): gra stoi, rozkazy można wydawać i układać w kolejkę
(Shift). To jest główny sposób grania bitew na telefonie.

Miary bitwy (test macierzy pojedynków, 30 ziaren na parę, jak w sesji z
2026-11-11): równy pojedynek 45–75 s kontaktu; szarża w bok kończy starcie w
10–15 s; strzały zabierają 15–25 % nieopancerzonych w drodze z 80 m; żadna
jednostka nie wygrywa z każdą inną; każda ma kontrę tańszą od siebie.

## 7. Przeciwnik

- Gra tymi samymi komendami i tą samą ekonomią (już jest). Dochodzą **trzy
  charaktery**: *Gospodarz* (rozbudowa, późna duża armia), *Zagończyk* (wczesna
  lekka jazda na pola i drwali), *Rycerz* (szybki 3. poziom zamku, ciężka
  jazda i machiny). Charakter losuje ziarno; trudność go nie zmienia.
- **Kontry**: co minutę liczy klasy wojska gracza i przesuwa werbunek (dużo
  jazdy → piki i halabardy; dużo kolczug → kusze i balisty; dużo strzelców →
  jazda).
- **Taktyka w polu**: linia piechoty, strzelcy za nią, jazda na skrzydle, odwód
  z jednego oddziału; jazda czeka na związanie linii i uderza w bok; machiny
  stają za linią i celują w strzelców i machiny gracza; oddział poniżej 40 %
  morale jest luzowany przez odwód.
- **Trudność** to mnożnik produkcji, opóźnienie reakcji (łatwy 6 s, trudny 1 s)
  i to, czy używa flanki i luzowania. Nigdy dodatkowe wojsko z niczego.
- Fale z rosnącym progiem zostają jako rytm sesji; między falami zagony.

## 8. Tryby

1. **Potyczka** — to, co jest, na trzech układach mapy, z wyborem trudności i
   charakteru przeciwnika (albo losowo).
2. **Obrona** — dziesięć fal na jedno miasto, coraz cięższych, z przerwami na
   rozbudowę; wynik w gwiazdkach (czas, straty, ocalone budynki). Najtańszy do
   zbudowania drugi tryb: korzysta z gotowych fal komputera.
3. **Samouczek** — pierwsze 8 minut potyczki z podpowiedziami wyzwalanymi
   stanem gry („zboże leży pod polem — brakuje tragarzy”).
4. Później: **kampania** pięciu map z przenoszeniem weteranów i trzema
   zadaniami dodatkowymi na mapę.

## 9. Interfejs

- Dolny pasek kart oddziałów (jak dziś nad wojskiem, ale stały): siła, morale,
  stopień, postawa; klik zaznacza, dwuklik centruje kamerę.
- Ekran produkcji: każdy towar z bilansem na minutę i wskazaniem zatoru
  (brak surowca / brak tragarza / pełny skład / brak pracownika).
- Alarmy z klikiem „pokaż”: głód w chacie, pełny skład, zagon, oddział ucieka.
- Grupy 1–9, podwójny klik = wszystkie tego rodzaju na ekranie, zakładki
  kamery F5–F8.
- Podpowiedź kontr przy werbunku („dobre na: jazdę; słabe na: łuczników”).
- Kształt, nie tylko kolor: chorągwie stron różnią się krojem, stan oddziału
  ikoną.

## 10. Kamienie milowe

Kolejność od największego wpływu na grę. „Silny model” to praca wymagająca
projektu albo nowej techniki; „rutyna” jest rozpisana w `ROUTINE.md`; „Blender”
w `BLENDER.md`.

| # | Kamień | Zakres | Kto | Kryterium |
|---|---|---|---|---|
| M1 | **Żywe miasto** | ludność, role, tragarze, składy budynków, budowa z dostawą, głód per chata, ucieczka przed wrogiem; najpierw jako obraz, potem prawdziwe czasy | silny model | test: 12 zbroi skórzanych w 6 min przy 3 tragarzach; test: bez tragarzy produkcja staje z pełnym składem; test: werbunek zmniejsza ludność; komputer nadal wygrywa z bezczynnym graczem w 30 min |
| M2 | **Bitwa v2** | szyki, szerokość frontu, postawy, cofanie, weterani, kapitan, uzupełnienia, żołd, wzniesienia, aktywna pauza z kolejką | silny model (symulacja), rutyna (HUD) | macierz pojedynków spełnia miary z §6; test na każdy szyk i postawę |
| M3 | **Mapa ma znaczenie** | rodzaje działek, działki za miastem, punkty do zajęcia, poziomy zamku, trzy układy mapy, rzeka i brody | silny model (generator, zasady), rutyna (panele) | komputer–komputer kończy partię w 25–40 min na każdym układzie; zagon na pole zatrzymuje jego produkcję |
| M4 | **Obraz** | żołnierze i robotnicy z modeli (animacja wypalona do tekstur), konie, las z impostorów, trawa przy kamerze, okluzja, pył i dym, budynki z modeli, etapy budowy | silny model (technika), Blender (modele) | zrzuty z ustalonych widoków obok wzorców; budżety z `BRIEF.md` §8 dotrzymane |
| M5 | **Przeciwnik v2 i tryby** | charaktery, kontry, taktyka linii i flanki, tryb Obrona, samouczek | silny model (taktyka), rutyna (tryby, samouczek) | każdy charakter wygrywa z dzisiejszym komputerem w ≥ 60 % z 20 ziaren |
| M6 | **Telefon i wydanie** | KTX2, przycisk Benchmark, ustawienia, zapis gry, wariant Android | rutyna | pomiar na telefonie w `RESULTS.md`; APK w wydaniu |

M1 i M2 nie zależą od modeli z Blendera i idą pierwsze. M4 startuje, gdy
przyjdą pliki z `BLENDER.md`; do tego czasu postacie zostają z kodu.

## 11. Ryzyka i jak je rozstrzygamy

| Ryzyko | Sygnał | Decyzja |
|---|---|---|
| Logistyka robi z gry układankę zatorów | w teście bez gracza komputer głoduje albo stoi | tragarz niesie 3 sztuki, nie 1; spichlerz przyjmuje wszystko; tryb „obraz” zostaje jako ułatwienie na poziomie łatwym |
| Ludność blokuje armię | pierwsza bitwa po 15. minucie | więcej osób na chatę, nie tańsze wojsko |
| Za dużo rozkazów na telefon | gracz nie nadąża bez pauzy | aktywna pauza z kolejką jest w M2, nie później |
| 200 animowanych postaci i 60 robotników nie mieści się w klatce | pomiar na telefonie | animacja w teksturze i jeden instancjonowany mesh na rodzaj; dalsze poziomy szczegółów; robotnicy bez cieni na Low |
| Obrona silniejsza od ataku (dziś) | komputer–komputer bez zwycięzcy w 60 min | trebusz i brama w M2/M3, słabszy ostrzał zamku, żołd |
