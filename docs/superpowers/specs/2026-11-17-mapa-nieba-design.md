# Mapa nieba z balkonu – integracja Home Assistant + karta Lovelace

Data: 2026-11-17

## Intencja i po co

Użytkownik chce w Home Assistant widzieć, co aktualnie (i za kilka godzin) jest na niebie nad jego balkonem: planety, Księżyc, jasne gwiazdy. Docelowy obraz: mapa nieba z półprzezroczystym zdjęciem balkonu nałożonym tak, jakby patrzył przez okno. Dodatkowo kilka ważnych obiektów (Wenus, Mars, Jowisz, Syriusz itd.) ma być encjami HA, żeby dało się ich użyć w automatyzacjach i powiadomieniach.

## Cele

- Integracja `mapa_nieba` (custom component, instalowana przez HACS lub ręcznie) licząca pozycje ciał niebieskich lokalnie.
- Sensor per obiekt: stan „widoczny / niewidoczny"; atrybuty: wysokość, azymut, jasność (mag), wschód, zachód, kulminacja.
- Własna karta Lovelace `mapa-nieba-card`: SVG, gwiazdy + planety + Księżyc + linie gwiazdozbiorów, półprzezroczyste zdjęcie balkonu, tooltipy, wyróżnienie obiektów będących encjami, suwak czasu.
- Tryb kalibracji w karcie: przeciąganie/skalowanie mapy względem zdjęcia, wypisanie gotowych wartości (azymut, wysokość środka kadru, kąt widzenia) do wklejenia w konfigurację.
- Maska przeszkód (słupki, budynki, drzewa): wielokąty rysowane na zdjęciu w trybie kalibracji, przeliczane na azymut/wysokość i zapisywane w opcjach integracji; sensor ma stan „zasłonięty", gdy obiekt jest w kadrze nad horyzontem, ale za przeszkodą; atrybut „odsłoni się o…".
- Działa w całości lokalnie, bez zewnętrznych API.

## Nie-cele

- Zorza polarna – świadomie odłożona na później (osobny etap; prawdopodobnie sensor Kp z NOAA).
- Automatyczne rozpoznawanie zdjęcia (plate solving).
- Kometoidy, satelity (ISS), mgławice, obiekty głębokiego nieba.
- Prognoza zachmurzenia (można później łączyć z istniejącą encją pogodową).

## Anty-cele

- Wymaganie od użytkownika ręcznego mierzenia azymutów kompasem – kalibracja ma być wizualna.
- Zależność od chmury/konta – całość ma działać offline.
- Ciężkie obliczenia blokujące event loop HA.

## Ograniczenia i ustalenia

- Lokalizacja (lat/lon/wysokość) – z konfiguracji HA (`hass.config`).
- Kierunek okna NIE jest znany HA: osobne ustawienia (azymut środka kadru, wysokość środka kadru, kąt widzenia). **Wartość startowa: balkon patrzy na południowy wschód, azymut ≈ 135°**; zdjęcie robione telefonem, **zakładany poziomy kąt widzenia ≈ 65–70°** (wartości domyślne, do korekty w kalibracji).
- Domyślna lista obiektów: Słońce, Księżyc, Merkury, Wenus, Mars, Jowisz, Saturn oraz Syriusz, Arktur, Wega, Kapella, Betelgeza, Rigel, Polaris; rozszerzalna w opcjach.
- „Widoczny" = nad horyzontem + Słońce poniżej progu zmierzchu (domyślnie zmierzch nautyczny, −12°) + obiekt mieści się w kadrze okna. Słońce i Księżyc mają odrębne reguły (np. Księżyc widoczny także w dzień, jeśli jest w kadrze).
- Pozycje planet i Księżyca liczy integracja (Python, `skyfield`, efemerydy z lokalnego pliku); mapa gwiazd w karcie rysowana po stronie przeglądarki z dołączonego, przyciętego katalogu gwiazd (do ok. mag 5–6) i linii gwiazdozbiorów.
- Język UI: polski (z możliwością tłumaczeń).

## Rozważone podejścia

| | Opis | Za | Przeciw |
|---|---|---|---|
| A | Integracja renderuje PNG (`image` entity) z nałożonym zdjęciem | Prosta, działa w każdej karcie „Picture" i w powiadomieniach | Brak interakcji, odświeżanie co 1–2 min |
| **B (wybrane)** | Integracja (encje) + własna karta Lovelace w SVG | Płynna, klikalna, suwak czasu, tryb kalibracji | Dodatkowy projekt frontendowy |
| C | A najpierw, B później | Szybszy pierwszy efekt | Użytkownik wybrał B od razu |

Użytkownik wybrał **B**. Rekomendacja pierwotnie dotyczyła A, ale B jest decyzją użytkownika; powód: interaktywność i kalibracja.

## Co zostaje decyzji wykonawcy

- Układ plików, bundler/pakowanie karty (np. vanilla/Lit + rollup), instalacja przez HACS (`hacs.json`).
- Sposób dostarczenia efemeryd i katalogu gwiazd.
- Interwał odświeżania (sensory ok. 1 min), użycie `DataUpdateCoordinator`.
- Rzut mapy (rektyliniowy względem środka kadru) i szczegóły matematyki kalibracji.
- Konfiguracja przez UI (config flow) vs YAML; schemat konfiguracji karty.
- Testy (obliczenia astronomiczne vs referencyjne wartości).
- Sposób udostępnienia zdjęcia balkonu (np. `/local/…`).

## Decyzje projektowe (moje – do sprawdzenia przy czytaniu)

Po przeglądzie dokumentu przez niezależnego wykonawcę uzupełniłem luki. To są **moje decyzje**, nie ustalenia z użytkownikiem:

1. **Jedno źródło prawdy dla geometrii okna.** Azymut, wysokość środka kadru, kąt widzenia, roll i proporcje zdjęcia żyją w opcjach integracji (config entry). Karta czyta je przez komendę websocket; tryb kalibracji zapisuje je z powrotem do integracji (tylko administrator). Dzięki temu czujniki „widoczny w kadrze" i karta nigdy się nie rozjadą. W YAML karty zostaje tylko ścieżka zdjęcia i opcje wyglądu.
2. **Pozycje planet/Księżyca/Słońca dla suwaka czasu:** integracja udostępnia komendę websocket `mapa_nieba/sky` zwracającą pozycje na listę czasów (np. co 10 min w oknie ±12 h). Obliczenia w wątku roboczym, nie w event loopie. Gwiazdy karta liczy sama w JS (wystarczy czas gwiazdowy z czasu i lokalizacji). Na karcie pokazywane są wszystkie obiekty z listy, nie tylko te z encjami.
3. **Definicja „widoczny":** nad horyzontem **i** w kadrze okna. Pionowy kąt widzenia wynika z kąta poziomego i proporcji zdjęcia. Słońce: widoczne, gdy jest w kadrze nad horyzontem. Księżyc: w kadrze nad horyzontem o każdej porze. Planety i gwiazdy: dodatkowo Słońce poniżej progu zmierzchu (jedna globalna opcja, domyślnie −12°). Limit jasności nie jest stosowany do obiektów z listy. Obiekt nad horyzontem, ale poza kadrem: stan „poza kadrem" (osobny od „niewidoczny" = pod horyzontem/jasne niebo), atrybuty nadal podane.
4. **Zdjęcie:** statyczne, nakładane w oryginalnych proporcjach, dopasowane do karty. Dodajemy parametr **roll** (domyślnie 0) do kalibracji, bo zdjęcia z telefonu bywają przekrzywione.
5. **Zależności:** zaczynamy od `skyfield` z efemerydą DE421 (ok. 17 MB). Jeśli instalacja na docelowym sprzęcie okaże się problematyczna, plan awaryjny to prostsze własne algorytmy (czysty Python). **Potwierdzone z użytkownikiem:** HA działa na VM w Proxmoksie (x86_64), więc `skyfield` jest bezpieczny; plan awaryjny nieaktualny.
6. **Repozytorium:** jedno repo, kategoria HACS „Integration"; integracja sama serwuje plik JS karty ze ścieżki statycznej i rejestruje zasób Lovelace. Minimalna wersja HA: aktualna stabilna w chwili implementacji.
7. **Encje:** wszystkie obiekty z domyślnej listy (14) mają sensory; lista edytowalna w opcjach. Polskie nazwy, jedno urządzenie „Mapa nieba", `unique_id` z id obiektu.
8. **Księżyc:** atrybut z fazą i oświetleniem (%), na karcie rysowana faza.

9. **Przeszkody (potwierdzone przez użytkownika):** wielokąty rysowane na zdjęciu, przechowywane jako obszary w układzie azymut/wysokość w opcjach integracji; czwarty stan sensora „zasłonięty".
