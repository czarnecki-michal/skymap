# Mapa nieba – plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integracja Home Assistant `mapa_nieba` (sensory widoczności obiektów nieba z balkonu) + własna karta Lovelace rysująca mapę nieba pod półprzezroczystym zdjęciem balkonu, z kalibracją i maską przeszkód.

**Architecture:** Czysta logika (astronomia, geometria okna, widoczność) w modułach bez zależności od HA, testowana osobno. Na tym cienka warstwa HA (coordinator, sensory, config/options flow, komendy websocket). Karta (Lit + TypeScript) czyta geometrię i pozycje ciał z integracji przez websocket, gwiazdy liczy sama; rzut mapy jest współdzielony przez wektory testowe Python↔JS.

**Tech Stack:** Python 3.13, Home Assistant (aktualna stabilna), `skyfield` + efemeryda DE421, `pytest-homeassistant-custom-component`; karta: Lit, TypeScript, Rollup, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-mapa-nieba-design.md`

## Global Constraints

- Lokalizacja z `hass.config` (lat/lon/elevation), brak zewnętrznych API, całość lokalnie.
- Geometria okna (azymut, wysokość środka kadru, kąt poziomy, proporcje zdjęcia, roll) i maska przeszkód żyją w opcjach config entry; jedno źródło prawdy dla sensorów i karty.
- Wartości startowe: azymut środka 135° (południowy wschód), poziomy kąt widzenia 67°, roll 0, próg zmierzchu −12° (globalny).
- Stany sensora: `visible`, `obstructed`, `out_of_frame`, `hidden` (polskie etykiety w tłumaczeniach).
- Domyślnych 14 obiektów: Słońce, Księżyc, Merkury, Wenus, Mars, Jowisz, Saturn, Syriusz, Arktur, Wega, Kapella, Betelgeza, Rigel, Polaris; każdy ma sensor; jedno urządzenie „Mapa nieba"; `unique_id` = `mapa_nieba_<id>`.
- Obliczenia astronomiczne poza event loopem (`async_add_executor_job`).
- Język UI polski + angielski; zorza poza zakresem.
- Czas wszędzie w UTC wewnątrz logiki.

## Review Focus

1. Azymut przechodzący przez północ (środek kadru 0°/360°, obiekt 359°, wielokąt przeszkody przecinający 0°) – ma działać tak samo jak gdziekolwiek indziej. (Task 3)
2. Obiekt okołobiegunowy (Polaris) i obiekt niewschodzący – wschód/zachód = `None`, nie wyjątek. (Task 2)
3. Planeta/gwiazda nad horyzontem za dnia → `hidden`; Księżyc w dzień w kadrze → `visible`. (Task 4)
4. Brak pliku efemerydy albo lokalizacja 0/0 (domyślna w nowym HA) – setup kończy się czytelnym błędem/ostrzeżeniem, nie crashem. (Task 5)
5. Zdjęcie portretowe (aspect < 1), pusta lista przeszkód, roll ≠ 0 – rzut i pionowy kąt widzenia poprawne. (Task 3)

## Struktura plików

```
hacs.json  README.md  pyproject.toml  requirements_test.txt
custom_components/mapa_nieba/
  manifest.json const.py __init__.py config_flow.py coordinator.py sensor.py websocket_api.py
  objects.py        # katalog obiektów (czyste)
  astro.py          # skyfield: pozycje, wschód/zachód, faza (czyste)
  geometry.py       # okno, rzut, przeszkody (czyste)
  visibility.py     # stany widoczności (czyste)
  strings.json  translations/{pl,en}.json  data/de421.bsp  www/mapa-nieba-card.js (build)
card/  package.json rollup.config.mjs  src/{mapa-nieba-card.ts, sky-math.ts, projection.ts, calibration.ts, obstructions.ts, data/stars.json}
scripts/build_star_catalog.py  scripts/fetch_ephemeris.py
tests/  (pytest)  tests/fixtures/projection_vectors.json  card/test/ (vitest)
```

---

### Task 1: Szkielet repo i integracji

**Files:** Create: `hacs.json`, `pyproject.toml`, `requirements_test.txt`, `custom_components/mapa_nieba/{manifest.json,const.py,__init__.py,config_flow.py,strings.json,translations/pl.json,translations/en.json}`, `tests/conftest.py`, `tests/test_config_flow.py`. Uruchom `git init` w `C:\Users\mcz\OneDrive\mapa_nieba`.

**Interfaces:** Produces: `const.py` ze stałymi `DOMAIN="mapa_nieba"`, `CONF_GEOMETRY`, `CONF_OBSTRUCTIONS`, `CONF_OBJECTS`, `CONF_TWILIGHT`, `DEFAULT_GEOMETRY: dict` (`az_center=135, alt_center=15, hfov=67, aspect=4/3, roll=0`), `DEFAULT_TWILIGHT=-12.0`, `DEFAULT_OBJECTS: list[str]` (id-y 14 obiektów).

- [ ] **Step 1:** Test `test_config_flow.py::test_user_flow_creates_entry`: start flow z `DOMAIN`, potwierdź formularz bez pól → entry utworzony, `entry.options` zawiera wartości domyślne z `const.py`; `test_single_instance`: drugi flow → abort `single_instance_allowed`.
- [ ] **Step 2:** Uruchom `pytest tests/test_config_flow.py -v` → FAIL (brak integracji).
- [ ] **Step 3:** Zaimplementuj manifest (`config_flow: true`, `requirements: ["skyfield>=1.49"]`, `iot_class: calculated`), `hacs.json` (kategoria integration), config flow z jednym pustym krokiem zapisującym domyślne opcje, `async_setup_entry` zwracający `True` (platformy dojdą później). Tłumaczenia pl/en.
- [ ] **Step 4:** Uruchom testy → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: integration skeleton with config flow"`.

### Task 2: Katalog obiektów i astronomia

**Files:** Create: `objects.py`, `astro.py`, `scripts/fetch_ephemeris.py`, `data/de421.bsp` (pobrany skryptem, commitowany); Test: `tests/test_astro.py`.

**Interfaces:**
- Produces `objects.py`: `@dataclass(frozen=True) SkyObject(id: str, name_pl: str, kind: Literal["sun","moon","planet","star"], target: str | None, ra_deg: float | None, dec_deg: float | None, mag: float | None)`; `CATALOG: dict[str, SkyObject]` (7 ciał + 25 najjaśniejszych gwiazd, współrzędne J2000; planety target np. `"venus barycenter"`/`"mars barycenter"` jak w DE421); `DEFAULT_OBJECT_IDS` = 14 z Global Constraints.
- Produces `astro.py`: `@dataclass(frozen=True) Observer(lat: float, lon: float, elevation_m: float)`; `@dataclass(frozen=True) BodyPosition(id: str, alt: float, az: float, magnitude: float | None, rise: datetime | None, set: datetime | None, transit: datetime | None, illumination: float | None, phase: float | None)` (illumination 0..1 i phase 0..1 cyklu, 0=nów, 0.5=pełnia – tylko Księżyc); `compute_positions(objects: Sequence[SkyObject], observer: Observer, when: datetime) -> dict[str, BodyPosition]`; `compute_track(objects, observer, times: Sequence[datetime]) -> dict[str, list[tuple[float, float]]]` (alt, az na czas); `sun_altitudes(observer, times) -> list[float]`; `load_ephemeris(path: Path)` rzucający `FileNotFoundError` z czytelnym komunikatem.

- [ ] **Step 1:** Testy (Szczecin 53.4285 N, 14.5528 E): Słońce w górowaniu 2026-06-21 ma wysokość 60.0° ±0.3; Polaris alt ≈ szerokość geogr. ±1°, `rise is None and set is None`; Księżyc `illumination < 0.01` o 2026-02-17 12:01 UTC i `> 0.99` o 2026-03-03 11:38 UTC; `compute_track` zwraca listę długości `len(times)` dla każdego obiektu; wszystkie azymuty w [0, 360).
- [ ] **Step 2:** `pytest tests/test_astro.py -v` → FAIL.
- [ ] **Step 3:** Zaimplementuj powyższe sygnatury; planety/Słońce/Księżyc z efemerydy (apparent, refrakcja pomijana), gwiazdy z RA/Dec przez `Star`; wschód/zachód/górowanie przez `skyfield.almanac` na dobę od `when`; jasność planet z `skyfield.magnitudes` jeśli dostępne, inaczej stałe przybliżenie z katalogu. Skrypt `fetch_ephemeris.py` pobiera DE421 do `data/`.
- [ ] **Step 4:** Testy → PASS.
- [ ] **Step 5:** Commit `feat: sky catalog and astronomy`.

### Task 3: Geometria okna i przeszkody

**Files:** Create: `geometry.py`, `tests/fixtures/projection_vectors.json`; Test: `tests/test_geometry.py`.

**Interfaces:** Produces:
- `@dataclass(frozen=True) WindowGeometry(az_center: float, alt_center: float, hfov: float, aspect: float, roll: float = 0.0)` + `from_dict(d: Mapping)`/`to_dict()`.
- `vfov(g: WindowGeometry) -> float` (stopnie, `2*atan(tan(hfov/2)/aspect)`).
- `project(g, az: float, alt: float) -> tuple[float, float] | None` – rzut rektyliniowy do znormalizowanych współrzędnych obrazu (x w prawo, y w dół, [0,1]=w kadrze), `None` gdy punkt za kamerą.
- `unproject(g, x: float, y: float) -> tuple[float, float]` (odwrotność → az 0..360, alt).
- `in_frame(g, az, alt) -> bool`.
- `point_in_obstruction(polygons: Sequence[Sequence[tuple[float, float]]], az: float, alt: float) -> bool` – wielokąty w (az, alt) stopniach, odporne na przejście przez 0°/360° (rozwijanie azymutu względem pierwszego wierzchołka).
- `projection_vectors.json`: lista `{geometry, az, alt, x, y}` generowana testem i **konsumowana też przez kartę (Task 9)**; zawiera przypadki: środek→(0.5,0.5); alt_center=0, az=center+hfov/2→x=1.0; aspect<1; roll=90 i ujemny (ustala konwencję znaku); środek 0° z obiektem 359°.

- [ ] **Step 1:** Testy: `vfov` dla hfov=67, aspect=4/3 ≈ 52.8°±0.1; wszystkie wektory z JSON; `in_frame` na granicach; `point_in_obstruction`: prostokąt 130–140° az / 0–40° alt trafia (135,20), nie trafia (150,20); wielokąt 355–5° az trafia az=359 i az=2; pusta lista → `False`; `unproject(project(x))` round-trip ±1e-6 (w tym roll≠0 i aspect<1).
- [ ] **Step 2:** `pytest tests/test_geometry.py -v` → FAIL.
- [ ] **Step 3:** Zaimplementuj przez wektory jednostkowe (obrót do układu kamery: azymut→wysokość→roll). Wektory JSON zapisz skryptem w teście (flaga `--regen-vectors` lub funkcja pomocnicza), nie ręcznie.
- [ ] **Step 4:** Testy → PASS.
- [ ] **Step 5:** Commit `feat: window geometry and obstruction masks`.

### Task 4: Reguły widoczności

**Files:** Create: `visibility.py`; Test: `tests/test_visibility.py`.

**Interfaces:** Consumes: `SkyObject`, `BodyPosition`, `WindowGeometry`, `in_frame`, `point_in_obstruction`. Produces: `class VisState(StrEnum): VISIBLE="visible"; OBSTRUCTED="obstructed"; OUT_OF_FRAME="out_of_frame"; HIDDEN="hidden"`; `visibility(obj: SkyObject, alt: float, az: float, sun_alt: float, geometry: WindowGeometry, obstructions, twilight: float = -12.0) -> VisState`; `next_visible(states: Sequence[tuple[datetime, VisState]]) -> datetime | None` (pierwszy czas stanu `VISIBLE` po obecnym niewidocznym).

Reguły: `alt <= 0` → `HIDDEN`; planeta/gwiazda i `sun_alt > twilight` → `HIDDEN`; (Słońce i Księżyc zwolnione z warunku zmierzchu); poza kadrem → `OUT_OF_FRAME`; w przeszkodzie → `OBSTRUCTED`; inaczej `VISIBLE`.

- [ ] **Step 1:** Testy: Wenus alt=20°, sun_alt=+30 → `HIDDEN`; ta sama przy sun_alt=−15 w kadrze → `VISIBLE`; Księżyc w dzień w kadrze → `VISIBLE`; Słońce poniżej horyzontu → `HIDDEN`; obiekt w kadrze w wielokącie → `OBSTRUCTED`; obiekt nad horyzontem poza kadrem → `OUT_OF_FRAME`; `next_visible` zwraca czas pierwszego `VISIBLE`, `None` gdy brak.
- [ ] **Step 2:** `pytest tests/test_visibility.py -v` → FAIL. **Step 3:** Implementacja wg reguł. **Step 4:** PASS. **Step 5:** Commit `feat: visibility rules`.

### Task 5: Coordinator i sensory

**Files:** Create: `coordinator.py`, `sensor.py`; Modify: `__init__.py`, `strings.json`, tłumaczenia; Test: `tests/test_sensor.py`.

**Interfaces:** Consumes: `compute_positions`, `compute_track`, `sun_altitudes`, `visibility`, `next_visible`, `WindowGeometry`, stałe z `const.py`. Produces: `MapaNiebaCoordinator(hass, entry)` (`update_interval=60 s`, `data: dict[str, ObjectData]`, `ObjectData(position: BodyPosition, state: VisState, reveals_at: datetime | None)`; geometria/przeszkody/lista obiektów czytane z `entry.options` przy każdym odświeżeniu; track na 12 h co 10 min liczony w tym samym wywołaniu executora); `MapaNiebaSensor` (`SensorDeviceClass.ENUM`, `options` = wartości `VisState`, `unique_id=f"mapa_nieba_{obj.id}"`, atrybuty: `altitude, azimuth, magnitude, rise, set, transit, illumination, phase, reveals_at`; jedno `DeviceInfo` „Mapa nieba"); w `__init__.py` listener opcji wywołujący `coordinator.async_request_refresh()`.

- [ ] **Step 1:** Testy z `freezer`/mockiem pozycji: po setupie istnieje 14 sensorów; stan Wenus zgodny z `visibility`; atrybuty zawierają `altitude`/`azimuth`; zmiana `entry.options[CONF_OBJECTS]` na 2 obiekty zostawia 2 sensory; **brak pliku efemerydy → setup zwraca `ConfigEntryNotReady`/błąd z czytelnym komunikatem w logu**; lokalizacja 0/0 → ostrzeżenie w logu, setup działa.
- [ ] **Step 2:** `pytest tests/test_sensor.py -v` → FAIL. **Step 3:** Implementacja; ephemeris ładowana raz w executorze i trzymana w `hass.data`. **Step 4:** PASS. **Step 5:** Commit `feat: coordinator and sensors`.

### Task 6: Options flow

**Files:** Modify: `config_flow.py`, `strings.json`, tłumaczenia; Test: `tests/test_options_flow.py`.

**Interfaces:** Produces `MapaNiebaOptionsFlow`: formularz z `objects` (multi-select z `CATALOG`, domyślnie 14), `twilight` (−18…0), oraz geometria numerycznie (`az_center` 0–360, `alt_center` −10…90, `hfov` 10–120, `aspect` 0.3–3, `roll` −180…180). Przeszkody edytowane tylko z karty, ale options flow nie może ich kasować.

- [ ] **Step 1:** Testy: zapis zmienia opcje; przeszkody w `entry.options` przeżywają zapis formularza; wartość spoza zakresu odrzucona.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit `feat: options flow`.

### Task 7: Komendy websocket

**Files:** Create: `websocket_api.py`; Modify: `__init__.py` (rejestracja); Test: `tests/test_websocket.py`.

**Interfaces:** Produces trzy komendy:
- `mapa_nieba/config` → `{geometry, obstructions, twilight, observer:{lat,lon,elevation}, objects:[{id,name,kind,entity_id}]}`.
- `mapa_nieba/sky` `{times: [ISO8601]}` (maks. 300 czasów, inaczej błąd) → `{objects: {id: [[alt, az], …]}, sun_alt: […], moon: {illumination: […], phase: […]}}` – tylko obiekty Układu Słonecznego i te z listy; liczone w executorze.
- `mapa_nieba/save_geometry` (`@websocket_api.require_admin`) `{geometry?, obstructions?, twilight?}` → zapisuje do `entry.options`, waliduje (`WindowGeometry`, wielokąty ≥3 wierzchołków).

- [ ] **Step 1:** Testy: `config` zwraca 14 obiektów z `entity_id`; `sky` dla 3 czasów zwraca listy długości 3; 301 czasów → błąd; `save_geometry` jako nie-admin → `unauthorized`; jako admin zmienia opcje i wywołuje odświeżenie; wielokąt z 2 wierzchołkami → błąd.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit `feat: websocket API`.

### Task 8: Szkielet karty i serwowanie JS

**Files:** Create: `card/{package.json,rollup.config.mjs,tsconfig.json}`, `card/src/mapa-nieba-card.ts` (placeholder: Lit element wypisujący nazwę), `card/test/card.test.ts`; Modify: `__init__.py` (rejestracja ścieżki statycznej `/mapa_nieba/mapa-nieba-card.js` z `www/` + `add_extra_js_url`); Test: `tests/test_frontend.py`.

**Interfaces:** Produces: custom element `mapa-nieba-card` (config: `photo: string`, `photo_opacity: number = 0.5`, `entry_id?: string`), `setConfig`, `getCardSize`; build `npm run build` → `custom_components/mapa_nieba/www/mapa-nieba-card.js`; komponent rejestruje się w `window.customCards`.

- [ ] **Step 1:** `test_frontend.py`: po setupie ścieżka statyczna jest zarejestrowana; vitest: `setConfig({})` rzuca błąd o brakującym `photo`.
- [ ] **Step 2:** uruchom oba → FAIL. **Step 3:** implementacja. **Step 4:** `pytest tests/test_frontend.py` i `npm test` → PASS; `npm run build` tworzy bundle. **Step 5:** Commit `feat: card scaffolding`.

### Task 9: Rysowanie nieba w karcie

**Files:** Create: `card/src/{sky-math.ts,projection.ts}`, `scripts/build_star_catalog.py`, `card/src/data/stars.json`; Modify: `mapa-nieba-card.ts`; Test: `card/test/{projection.test.ts,sky-math.test.ts,stars.test.ts}`.

**Interfaces:** Produces: `projection.ts`: `project(g: WindowGeometry, az: number, alt: number): [number, number] | null`, `unproject(g, x, y): [number, number]`; `sky-math.ts`: `localSiderealTime(date: Date, lonDeg: number): number`, `raDecToAltAz(raDeg, decDeg, latDeg, lstDeg): {alt: number, az: number}` (z precesją z J2000); `stars.json`: `{stars: [[ra,dec,mag,hip?]…], lines: [[hipA,hipB]…]}` (mag ≤ 5.5, linie gwiazdozbiorów ze Stellarium przez `skyfield.data.stellarium`); karta rysuje SVG: zdjęcie (`photo_opacity`), gwiazdy (promień wg jasności), linie gwiazdozbiorów, horyzont, ciała z `mapa_nieba/config`+`sky` (pozycja „teraz"), wszystkie w rzucie `project`.

- [ ] **Step 1:** Testy: `projection.test.ts` przechodzi **wszystkie wektory z `tests/fixtures/projection_vectors.json`** (tolerancja 1e-6); `sky-math`: Syriusz w Szczecinie o 2026-01-15 21:00 UTC zgodny z wartością z `astro.py` ±0.2° (wartość wygenerowana skryptem Pythona i zapisana w fixture); `stars.test.ts`: ≥1500 gwiazd, Syriusz (HIP 32349) i Polaris (HIP 11767) obecne, każda linia wskazuje istniejące HIP.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementacja + uruchom `build_star_catalog.py` i commituj JSON. **Step 4:** PASS, `npm run build`. **Step 5:** Commit `feat: card sky rendering`.

### Task 10: Interakcje karty

**Files:** Modify: `mapa-nieba-card.ts`; Create: `card/src/body-render.ts`; Test: `card/test/interactions.test.ts`.

**Interfaces:** Produces: tooltipy po najechaniu (nazwa, wysokość, azymut, stan z encji); obiekty będące encjami wyróżnione; kliknięcie otwiera `hass-more-info`; faza Księżyca rysowana z `moon.illumination/phase` (`moonPath(illumination: number, phase: number): string` – ścieżka SVG); suwak czasu ±12 h (krok 10 min) pobierający jedną komendą `mapa_nieba/sky` (maks. 145 czasów) i przeliczający gwiazdy lokalnie; przycisk „teraz".

- [ ] **Step 1:** Testy: `moonPath` dla illumination=0 → pusta/ciemna tarcza, =1 → pełny okrąg, phase<0.5 vs >0.5 zwraca lustrzane kształty; suwak na +3 h wywołuje `callWS` z czasem +3 h i przeliczonym LST; wyróżnienie tylko dla obiektów z `entity_id`.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit `feat: card interactions`.

### Task 11: Kalibracja i edytor przeszkód

**Files:** Create: `card/src/{calibration.ts,obstructions.ts}`; Modify: `mapa-nieba-card.ts`; Test: `card/test/{calibration.test.ts,obstructions.test.ts}`.

**Interfaces:** Produces: tryb kalibracji (przycisk „Kalibruj", tylko admin – `hass.user.is_admin`): przeciąganie = zmiana `az_center`/`alt_center`, kółko/pinch = `hfov`, uchwyt obrotu = `roll`; `applyDrag(g: WindowGeometry, dx: number, dy: number, pxPerDeg: number): WindowGeometry`, `applyZoom(g, factor): WindowGeometry` (hfov zakres 10–120); edytor wielokątów: `polygonToSky(g, pts: [number, number][], subdivide = 8): [number, number][]` (punkty obrazu→az/alt z podziałem krawędzi), `skyToPolygon(g, poly)` do wyświetlania; „Zapisz" wysyła `mapa_nieba/save_geometry` z geometrią i przeszkodami; przeszkody rysowane przyciemnionym wypełnieniem.

- [ ] **Step 1:** Testy: `applyDrag` o 1° w poziomie zmienia `az_center` o ∓1 (znak wg konwencji z wektorów); `az_center` zawsze zawinięty do 0–360; `applyZoom` obcina do 10–120; `polygonToSky` dla narożników obrazu przy `az_center=0` zwraca azymuty zawinięte, a `skyToPolygon∘polygonToSky` ≈ tożsamość; zapis wywołuje `callWS` z `type: "mapa_nieba/save_geometry"`; użytkownik nie-admin nie widzi przycisku.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit `feat: calibration and obstruction editor`.

### Task 12: Dokumentacja i weryfikacja end-to-end

**Files:** Create: `README.md` (po polsku: instalacja HACS, dodanie karty, zdjęcie w `/config/www/`, kalibracja krok po kroku, stany sensora); Modify: `hacs.json`.

- [ ] **Step 1:** `pytest -q` i `npm test` – wszystko zielone; `npm run build` aktualny, bundle zacommitowany.
- [ ] **Step 2:** Uruchom lokalną instancję HA (Docker lub dev container) z integracją; sprawdź ręcznie: 14 sensorów, karta pokazuje niebo ze zdjęciem, kalibracja zapisuje i po odświeżeniu geometria jest zachowana, przeszkoda zmienia stan obiektu na `obstructed`.
- [ ] **Step 3:** Commit `docs: README and release prep`.

---

## Self-review

- **Pokrycie spec:** encje (T2,4,5), karta/SVG/tooltipy/suwak (T9–10), kalibracja (T11), przeszkody (T3,4,11), faza Księżyca (T2,10), opcje (T6), websocket jako źródło prawdy (T7), HACS/serwowanie JS (T1,8,12). Zorza i ISS poza zakresem – zgodnie ze spec.
- **Zawężenie względem spec (do wiadomości użytkownika):** lista obiektów wybierana z wbudowanego katalogu (7 ciał + 25 gwiazd), bez wpisywania własnych współrzędnych.
- **Spójność typów:** `WindowGeometry`, `BodyPosition`, `VisState`, `project/unproject` mają te same nazwy w T3–T11; wektory `projection_vectors.json` spinają Python i JS.
