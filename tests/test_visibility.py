from datetime import datetime, timedelta, timezone

from custom_components.mapa_nieba.geometry import WindowGeometry
from custom_components.mapa_nieba.objects import CATALOG
from custom_components.mapa_nieba.visibility import VisState, next_visible, visibility

G = WindowGeometry(135, 15, 67, 4 / 3, 0)
V, S, M = CATALOG["venus"], CATALOG["sun"], CATALOG["moon"]


def test_planet_by_day_hidden_at_night_visible():
    assert visibility(V, 20, 135, 30, G, []) == VisState.HIDDEN
    assert visibility(V, 20, 135, -15, G, []) == VisState.VISIBLE


def test_moon_visible_by_day_in_frame():
    assert visibility(M, 20, 135, 30, G, []) == VisState.VISIBLE


def test_sun_below_horizon_hidden():
    assert visibility(S, -5, 135, -20, G, []) == VisState.HIDDEN


def test_obstructed_and_out_of_frame():
    poly = [[(130, 0), (140, 0), (140, 40), (130, 40)]]
    assert visibility(V, 20, 135, -15, G, poly) == VisState.OBSTRUCTED
    assert visibility(V, 20, 300, -15, G, []) == VisState.OUT_OF_FRAME


def test_next_visible():
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    st = [(t0 + timedelta(minutes=10 * i), s) for i, s in enumerate(
        [VisState.OBSTRUCTED, VisState.OBSTRUCTED, VisState.VISIBLE])]
    assert next_visible(st) == t0 + timedelta(minutes=20)
    assert next_visible([(t0, VisState.HIDDEN)]) is None
    assert next_visible([(t0, VisState.VISIBLE)]) is None
