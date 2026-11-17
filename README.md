# Mapa nieba

Integracja Home Assistant pokazująca, co jest teraz (i za kilka godzin) widoczne na niebie z Twojego balkonu: planety, Księżyc, Słońce i jasne gwiazdy. Zawiera sensory dla każdego obiektu oraz kartę Lovelace, która rysuje mapę nieba pod półprzezroczystym zdjęciem okna.

Wszystko liczone lokalnie (skyfield + efemeryda DE421), bez zewnętrznych API. Zorza polarna nie jest jeszcze obsługiwana.

## Instalacja

1. Skopiuj `custom_components/mapa_nieba` do `/config/custom_components/` (albo dodaj repo do HACS jako *Integration*) i zrestartuj HA.
2. *Ustawienia → Urządzenia i usługi → Dodaj integrację → Mapa nieba*.
3. Upewnij się, że lokalizacja HA jest ustawiona (*Ustawienia → System → Ogólne*) – pozycje liczone są dla niej.

Plik JS karty jest serwowany przez integrację i rejestruje się automatycznie.

## Karta

Dodaj kartę z listy kart (*Mapa nieba*) albo ręcznie:

```yaml
type: custom:mapa-nieba-card
```

Karta działa jak małe planetarium:

- **przeciąganie** rozgląda się po całym niebie, **kółko / dwa palce** zmieniają zoom, **⌖** wraca do kierunku okna,
- pasek na dole: **▶** odtwarza noc, suwak przewija czas ±12 h, **●** wraca do „teraz”, **⚙** otwiera kreator (administrator),
- konstelacje z polskimi nazwami, za dnia gwiazdy i planety są ledwo widoczne i jaśnieją wraz ze zmierzchem,
- najechanie na obiekt pokazuje wysokość, azymut i stan sensora; kliknięcie otwiera encję.

### Kreator ⚙ (tylko administrator)

1. **Zdjęcie** (opcjonalne) – przeciągnij plik; integracja przechowuje je sama. Godzina zrobienia jest odczytywana z pliku (EXIF), a gdy jej brak, wpisujesz ją ręcznie. Tu ustawiasz też przezroczystość.
2. **Metoda dopasowania**:
   - **po gwiazdach** (zdjęcie nocne): wybierz obiekt z listy (np. Wenus) i kliknij go na zdjęciu; drugi obiekt ustawia też kąt widzenia i przekrzywienie. Niebieskie kropki to gwiazdy z obliczeń – po dopasowaniu leżą na prawdziwych.
   - **po kompasie** (zdjęcie dzienne lub brak zdjęcia): kierunek na tarczy (z pomocą znaczników dzisiejszego wschodu Słońca i Księżyca), linia horyzontu, kąt widzenia.
3. **Przeszkody** – klikaj narożniki słupka, budynku czy drzewa, potem **Zamknij kształt**.
4. **Podgląd** dzisiejszej nocy i **Zapisz** – geometria i przeszkody trafiają do opcji integracji, więc sensory liczą „widoczny” dokładnie dla tego kadru.

Opcjonalnie w YAML: `photo: /local/balkon.jpg` (zewnętrzne zdjęcie, ma pierwszeństwo przed wgranym w kreatorze) i `photo_opacity: 0.5`.

Wartości startowe: azymut kadru 135° (południowy wschód), poziomy kąt widzenia 67° (typowy aparat telefonu).

## Sensory

Dla każdego obiektu powstaje sensor (`sensor.mapa_nieba_<nazwa>`) o stanie:

| stan | znaczenie |
|---|---|
| `visible` (widoczny) | nad horyzontem, w kadrze, nie za przeszkodą (planety i gwiazdy: Słońce poniżej progu zmierzchu, domyślnie −12°) |
| `obstructed` (zasłonięty) | w kadrze, ale za przeszkodą |
| `out_of_frame` (poza kadrem) | nad horyzontem, ale poza oknem |
| `hidden` (niewidoczny) | pod horyzontem albo za jasne niebo |

Atrybuty: `altitude`, `azimuth`, `magnitude`, `rise`, `set`, `transit`, `illumination` i `phase` (Księżyc), `reveals_at` (kiedy obiekt stanie się widoczny w ciągu 12 h).

Listę obiektów (planety i 25 najjaśniejszych gwiazd), próg zmierzchu i geometrię okna zmienisz w *Konfiguruj* przy integracji.

## Rozwój

```bash
pytest                      # testy integracji (wymaga pytest-homeassistant-custom-component, Linux/WSL)
cd card && npm install && npm test && npm run build
python scripts/fetch_ephemeris.py       # pobranie DE421
python scripts/build_star_catalog.py    # katalog gwiazd karty
```
