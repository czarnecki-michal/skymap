# Mapa nieba

Integracja Home Assistant pokazująca, co jest teraz (i za kilka godzin) widoczne na niebie z Twojego balkonu: planety, Księżyc, Słońce i jasne gwiazdy. Zawiera sensory dla każdego obiektu oraz kartę Lovelace, która rysuje mapę nieba pod półprzezroczystym zdjęciem okna.

Wszystko liczone lokalnie (skyfield + efemeryda DE421), bez zewnętrznych API. Zorza polarna nie jest jeszcze obsługiwana.

## Instalacja

1. Skopiuj `custom_components/mapa_nieba` do `/config/custom_components/` (albo dodaj repo do HACS jako *Integration*) i zrestartuj HA.
2. *Ustawienia → Urządzenia i usługi → Dodaj integrację → Mapa nieba*.
3. Upewnij się, że lokalizacja HA jest ustawiona (*Ustawienia → System → Ogólne*) – pozycje liczone są dla niej.

Plik JS karty jest serwowany przez integrację i rejestruje się automatycznie.

## Karta

Zdjęcie balkonu jest opcjonalne. Jeśli chcesz mieć widok „jak przez okno", wrzuć je do `/config/www/balkon.jpg`, potem dodaj kartę (bez `photo` dostaniesz samą mapę nieba na ciemnym tle):

```yaml
type: custom:mapa-nieba-card
photo: /local/balkon.jpg
photo_opacity: 0.5
```

Najechanie na obiekt pokazuje wysokość, azymut i stan; kliknięcie otwiera encję. Suwak pod mapą pokazuje niebo do 12 h wstecz i w przód.

### Kalibracja (tylko administrator)

1. Kliknij **Kalibruj**.
2. Przeciągnij mapę i kółkiem myszy zmień zoom, aż jasny obiekt (np. Księżyc, Wenus, Jowisz) wyląduje tam, gdzie widzisz go na zdjęciu. Suwak „Obrót" koryguje przekrzywione zdjęcie.
3. **Dodaj przeszkodę**: klikaj narożniki słupka, budynku lub drzewa na zdjęciu, potem **Zamknij kształt**.
4. **Zapisz** – geometria i przeszkody trafiają do opcji integracji, więc sensory używają tych samych wartości co karta.

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
