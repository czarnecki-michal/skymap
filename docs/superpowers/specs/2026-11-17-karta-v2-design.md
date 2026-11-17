# Karta Mapa nieba v2 – nowoczesny, interaktywny widok i kreator

Data: 2026-11-17 · Poprzednia wersja: `2026-11-17-mapa-nieba-design.md` (integracja i karta v1 – działają, ten dokument zmienia głównie kartę)

## Intencja i po co

Karta v1 działa, ale jest statyczna i nieczytelna: za dnia pokazuje puste tło, kontrolki wypadają pod zgięcie ekranu, a kalibracja to przeciąganie na ślepo. Użytkownik chce przeglądać niebo interaktywnie i „ładnie, nowocześnie jak w Stellarium": rozglądać się po całym niebie z domyślnym centrowaniem na kierunek okna, widzieć konstelacje, oglądać noc w animacji. Kierunek patrzenia i zdjęcie ma ustawiać kreator, najlepiej przez dopasowanie znanego obiektu (np. Wenus) na nocnym zdjęciu. Zdjęcie jest opcjonalne – karta ma działać i bez niego.

## Cele

1. **Wygląd (wariant A z makiet):** mapa wypełnia kartę; pływający półprzezroczysty pasek na dole (▶ animacja, suwak czasu ±12 h, godzina, ⚙ kreator); kompas z kierunkiem widoku u góry; przycisk ⌖ wraca do kadru okna. Wszystkie kontrolki mieszczą się na mapie – nic nie wymaga przewijania strony.
2. **Rozglądanie się:** przeciąganie przesuwa widok po całym niebie, kółko/pinch zmienia zoom; domyślny widok = geometria okna z opcji integracji.
3. **Rendering w stylu Stellarium:** gradient nieba zależny od wysokości Słońca (dzień / zmierzch / noc), gwiazdy z poświatą i jasnością wg magnitudo, linie i **polskie nazwy konstelacji**, ciemny grunt poniżej horyzontu, planety, Słońce, Księżyc z fazą.
4. **Dzień:** gwiazdy, linie i planety rysowane bardzo słabo („ledwo widoczne"), płynnie jaśnieją wraz z zapadaniem zmroku.
5. **Animacja nocy:** ▶ przewija czas płynnie po zakresie suwaka.
6. **Zdjęcie przyklejone do nieba:** opcjonalne zdjęcie leży w swoim kierunku; przy rozglądaniu się jest perspektywicznie przekształcane; poza nim widać samo niebo.
7. **Kreator ⚙ (tylko admin), każdy krok opcjonalny:**
   - *Zdjęcie:* wgranie pliku (przeciągnij/wybierz); integracja przechowuje je u siebie. Można pominąć.
   - *Kalibracja po gwiazdach (główna, zdjęcie nocne):* godzina zdjęcia z EXIF (z możliwością ręcznej korekty); użytkownik wybiera obiekt z listy i klika go na zdjęciu; 1 punkt → kierunek i wysokość kadru; 2 punkty → także kąt widzenia i przekrzywienie.
   - *Kalibracja po kompasie (zapasowa, zdjęcie dzienne lub brak zdjęcia):* tarcza kompasu / wpisany azymut; przeciągnięcie linii horyzontu na zdjęciu; kąt widzenia z presetów (zwykły ~67°, szeroki ~105°, własny); na horyzoncie znaczniki dzisiejszego wschodu Słońca i Księżyca jako pomoc.
   - *Przeszkody:* wielokąty klikane na zdjęciu (jak w v1).
   - *Podgląd:* animacja dzisiejszej nocy w kadrze, potem Zapisz.
8. Karta pojawia się w wyborze kart HA bez YAML (`getStubConfig`).

## Nie-cele

- Zmiana logiki sensorów: „widoczny" dalej liczony tylko dla kadru okna (v1).
- Zorza, satelity, obiekty głębokiego nieba, Droga Mleczna jako tekstura.
- Projekcje inne niż rektyliniowa (np. stereograficzna/rybie oko).
- Wiele zdjęć / wiele okien.

## Anty-cele

- Zacinanie się przy przeciąganiu lub animacji na tablecie ściennym.
- Kontrolki wymagające przewijania strony.
- Kreator, który wymaga ręcznego mierzenia czegokolwiek, gdy jest zdjęcie nocne z jasnym obiektem.
- Rozjechanie się karty i sensorów co do geometrii okna.

## Ograniczenia

- Integracja HA z v1 zostaje; geometria okna i przeszkody nadal w opcjach config entry (jedno źródło prawdy), zapis przez istniejące `mapa_nieba/save_geometry`.
- Zgodność rzutu Python↔JS nadal pilnowana wspólnymi wektorami testowymi.
- Bez dużych bibliotek renderujących (WebGL/three.js odrzucone).
- Czas w EXIF nie ma strefy – przyjmujemy strefę czasową HA, chyba że plik ma `OffsetTimeOriginal`.

## Rozważone podejścia

| | Opis | Za | Przeciw |
|---|---|---|---|
| A | SVG jak w v1 + perspektywa zdjęcia przez CSS `matrix3d` | najmniej zmian | ~3000 elementów SVG zacina się przy przeciąganiu/animacji; poświata i gradienty ciężkie |
| **B (wybrane)** | Niebo na **Canvas 2D**, zdjęcie jako `<img>` z perspektywą **CSS `matrix3d`** wyliczaną z 4 narożników | płynne 60 kl./s, poświata, gradienty; zostaje rzut, katalog i API z v1 | wymiana warstwy rysowania karty |
| C | WebGL (sfera 3D) | najbliżej Stellarium | duży bundle, nowa matematyka do zgrania z sensorami, trudne testy |

Użytkownik wybrał **B**.

## Decyzje projektowe (moje)

1. **Dwie geometrie:** `window` (z opcji integracji, używana przez sensory i do umieszczenia zdjęcia) oraz `view` (stan karty: azymut, wysokość, kąt widzenia; roll widoku = 0). Rozglądanie się zmienia tylko `view`. ⌖ ustawia `view` = `window`. Zoom widoku 20–120°.
2. **Zdjęcie:** cztery narożniki zdjęcia → `unproject(window)` → `project(view)` → homografia → `matrix3d`. Gdy którykolwiek narożnik jest za obserwatorem, zdjęcie jest ukrywane.
3. **Przechowywanie zdjęcia:** nowy endpoint HTTP integracji (`POST`, tylko admin) zapisuje plik w katalogu konfiguracji integracji (np. `<config>/mapa_nieba/photo.jpg`); karta wyświetla je przez podpisany URL (`auth/sign_path`). Proporcje zdjęcia trafiają do geometrii okna (`aspect`).
4. **Solver kalibracji:** 1 punkt rozwiązuje (az_center, alt_center) przy stałym kącie widzenia i roll; 2 punkty rozwiązują (az_center, alt_center, hfov, roll). Numerycznie (Gauss–Newton z numerycznym jakobianem) na funkcji `project` – testowane na syntetycznych geometriach (odtworzenie z dokładnością < 0.1°).
5. **Jasność w dzień:** współczynnik widoczności nieba zależny od wysokości Słońca (pełny w nocy przy Słońcu ≤ −18°, minimalny „ledwo widoczny" przy Słońcu > 0°).
6. **Nazwy konstelacji:** polskie nazwy 88 gwiazdozbiorów w katalogu karty; etykieta w środku ciężkości widocznych gwiazd danej konstelacji.
7. **Czas animacji:** ▶ przechodzi przez zakres ±12 h w ok. 20 s, zaczynając od bieżącej pozycji suwaka.

8. **Warstwy (od spodu):** canvas nieba (gradient, gwiazdy, linie konstelacji, grunt) → `<img>` zdjęcia półprzezroczyste (przezroczystość ustawiana w kreatorze, domyślnie 0.6, jak `photo_opacity` w v1) → canvas nakładek (planety, Słońce, Księżyc, nazwy, przeszkody, znaczniki kreatora; obsługuje też trafianie kliknięć/hover). Dzięki temu na nocnym zdjęciu prawdziwe gwiazdy prześwitują przez narysowane, co ułatwia ocenę kalibracji.
9. **Wydajność (brak konkretnego urządzenia – budżet przyjęty przeze mnie):** przerysowanie tylko przy interakcji, animacji lub zmianie danych (nie w pętli bezczynnej); sprite'y poświaty gwiazd cache'owane w offscreen canvas; uwzględniany `devicePixelRatio` (ograniczony do 2); katalog bez zmian (mag ≤ 5.5). `matrix3d` jest wspierane we wszystkich współczesnych przeglądarkach i WebView – bez fallbacku.
10. **Zgodność wstecz:** opcja YAML `photo` dalej działa (zewnętrzny URL ma pierwszeństwo przed zdjęciem z integracji); `photo_opacity` z YAML też, jeśli ustawione. Karta bez opcji (`type` tylko) używa zdjęcia z integracji lub działa bez zdjęcia.
11. **Przeszkody:** zapisywane jak w v1 w układzie az/alt, więc przeżywają zmianę zdjęcia i rekalibrację (nie są czyszczone; kreator pozwala je usunąć). Bez zdjęcia rysuje się je na wyrenderowanym niebie w widoku kadru okna.
12. **Ciała Układu Słonecznego zawsze rysowane:** `mapa_nieba/sky` zwraca Słońce, Księżyc i wszystkie planety niezależnie od listy encji, a także azymut Słońca; lista z opcji decyduje tylko o sensorach i wyróżnieniu. Znaczniki wschodu Słońca i Księżyca liczone z toru (pierwsze przejście przez horyzont w zakresie suwaka lub w ciągu doby) – nowa pozycja w odpowiedzi API.

## Co zostaje decyzji wykonawcy

- Podział karty na moduły (renderer canvas, interakcje, kreator, solver, EXIF).
- Parser EXIF (własny, mały) i obsługa formatów (JPEG obowiązkowo; HEIC – brak EXIF → ręczna godzina).
- Dokładny wygląd: kolory, czcionki, sprite'y gwiazd, animacje przejść.
- Limit rozmiaru wgrywanego pliku, ewentualne zmniejszanie zdjęcia przed wysłaniem.
- Testy wizualne (zrzuty w przeglądarce z atrapą `hass`).
