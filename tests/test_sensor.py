from datetime import datetime, timezone
from pathlib import Path

from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.mapa_nieba import astro
from custom_components.mapa_nieba.const import (
    CONF_GEOMETRY, CONF_OBJECTS, CONF_OBSTRUCTIONS, CONF_TWILIGHT,
    DEFAULT_GEOMETRY, DEFAULT_OBJECTS, DEFAULT_TWILIGHT, DOMAIN,
)
from custom_components.mapa_nieba.geometry import WindowGeometry
from custom_components.mapa_nieba.objects import CATALOG
from custom_components.mapa_nieba.visibility import visibility

NOW = datetime(2026, 1, 15, 20, 0, tzinfo=timezone.utc)


def make_entry(**over):
    opts = {
        CONF_GEOMETRY: dict(DEFAULT_GEOMETRY), CONF_OBSTRUCTIONS: [],
        CONF_OBJECTS: list(DEFAULT_OBJECTS), CONF_TWILIGHT: DEFAULT_TWILIGHT,
    }
    opts.update(over)
    return MockConfigEntry(domain=DOMAIN, data={}, options=opts)


async def setup(hass, entry):
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


def sensors(hass):
    return [s for s in hass.states.async_all("sensor") if s.entity_id.startswith("sensor.mapa_nieba")]


async def test_fourteen_sensors_and_venus_state(hass, freezer):
    freezer.move_to(NOW)
    await setup(hass, make_entry())
    assert len(sensors(hass)) == 14
    reg = er.async_get(hass)
    venus = hass.states.get(reg.async_get_entity_id("sensor", DOMAIN, "mapa_nieba_venus"))
    obs = astro.Observer(hass.config.latitude, hass.config.longitude, float(hass.config.elevation))
    pos = astro.compute_positions([CATALOG["venus"]], obs, NOW)["venus"]
    sun_alt = astro.sun_altitudes(obs, [NOW])[0]
    expected = visibility(CATALOG["venus"], pos.alt, pos.az, sun_alt,
                          WindowGeometry.from_dict(DEFAULT_GEOMETRY), [], DEFAULT_TWILIGHT)
    assert venus.state == expected.value
    assert "altitude" in venus.attributes and "azimuth" in venus.attributes


async def test_changing_objects_reloads_sensors(hass, freezer):
    freezer.move_to(NOW)
    entry = make_entry()
    await setup(hass, entry)
    hass.config_entries.async_update_entry(entry, options={**entry.options, CONF_OBJECTS: ["venus", "sun"]})
    await hass.async_block_till_done()
    assert len(sensors(hass)) == 2


async def test_missing_ephemeris_is_setup_error(hass, monkeypatch, caplog):
    monkeypatch.setattr(astro, "EPHEMERIS_PATH", Path("/nonexistent/de421.bsp"))
    astro._eph.cache_clear()
    entry = make_entry()
    await setup(hass, entry)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    astro._eph.cache_clear()


async def test_zero_location_warns_but_sets_up(hass, freezer, caplog):
    freezer.move_to(NOW)
    hass.config.latitude = 0
    hass.config.longitude = 0
    entry = make_entry()
    await setup(hass, entry)
    assert entry.state is ConfigEntryState.LOADED
    assert "0/0" in caplog.text
