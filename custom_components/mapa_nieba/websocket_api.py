"""Websocket commands used by the Lovelace card."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from . import astro
from .const import CONF_GEOMETRY, CONF_OBJECTS, CONF_OBSTRUCTIONS, CONF_TWILIGHT, DEFAULT_GEOMETRY, DOMAIN
from .objects import CATALOG

MAX_TIMES = 300


def _entry(hass: HomeAssistant):
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if hasattr(e, "runtime_data")]
    return entries[0] if entries else None


@websocket_api.websocket_command({vol.Required("type"): "mapa_nieba/config"})
@callback
def ws_config(hass, connection, msg):
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Mapa nieba is not set up")
        return
    reg = er.async_get(hass)
    o = entry.options
    c = hass.config
    connection.send_result(msg["id"], {
        "geometry": {**DEFAULT_GEOMETRY, **o[CONF_GEOMETRY]},
        "obstructions": o.get(CONF_OBSTRUCTIONS, []),
        "twilight": o[CONF_TWILIGHT],
        "observer": {"lat": c.latitude, "lon": c.longitude, "elevation": c.elevation},
        "objects": [
            {
                "id": i, "name": CATALOG[i].name_pl, "kind": CATALOG[i].kind,
                "entity_id": reg.async_get_entity_id("sensor", DOMAIN, f"mapa_nieba_{i}"),
            }
            for i in o[CONF_OBJECTS] if i in CATALOG
        ],
    })


@websocket_api.websocket_command({
    vol.Required("type"): "mapa_nieba/sky",
    vol.Required("times"): [str],
})
@websocket_api.async_response
async def ws_sky(hass, connection, msg):
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Mapa nieba is not set up")
        return
    if len(msg["times"]) > MAX_TIMES:
        connection.send_error(msg["id"], "too_many_times", f"At most {MAX_TIMES} times")
        return
    times = [dt_util.parse_datetime(t) for t in msg["times"]]
    if any(t is None for t in times):
        connection.send_error(msg["id"], "invalid_time", "Bad ISO8601 time")
        return
    times = [dt_util.as_utc(t) for t in times]
    objs = [CATALOG[i] for i in entry.options[CONF_OBJECTS]
            if i in CATALOG and CATALOG[i].kind != "star"]
    c = hass.config
    obs = astro.Observer(c.latitude, c.longitude, float(c.elevation or 0))

    def work():
        track = astro.compute_track(objs, obs, times)
        sun = astro.sun_altitudes(obs, times)
        moon = astro.moon_phases(times)
        return track, sun, moon

    track, sun, moon = await hass.async_add_executor_job(work)
    connection.send_result(msg["id"], {
        "objects": {k: [[a, z] for a, z in v] for k, v in track.items()},
        "sun_alt": sun,
        "moon": {"illumination": [m[0] for m in moon], "phase": [m[1] for m in moon]},
    })


_POLY = vol.All([vol.All([vol.Coerce(float)], vol.Length(min=2, max=2))], vol.Length(min=3))


@websocket_api.websocket_command({
    vol.Required("type"): "mapa_nieba/save_geometry",
    vol.Optional("geometry"): {
        vol.Required("az_center"): vol.All(vol.Coerce(float), vol.Range(0, 360)),
        vol.Required("alt_center"): vol.All(vol.Coerce(float), vol.Range(-10, 90)),
        vol.Required("hfov"): vol.All(vol.Coerce(float), vol.Range(10, 120)),
        vol.Required("aspect"): vol.All(vol.Coerce(float), vol.Range(0.3, 3)),
        vol.Optional("roll", default=0.0): vol.All(vol.Coerce(float), vol.Range(-180, 180)),
    },
    vol.Optional("obstructions"): [_POLY],
    vol.Optional("twilight"): vol.All(vol.Coerce(float), vol.Range(-18, 0)),
})
@websocket_api.require_admin
@callback
def ws_save_geometry(hass, connection, msg):
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Mapa nieba is not set up")
        return
    opts = dict(entry.options)
    if "geometry" in msg:
        opts[CONF_GEOMETRY] = msg["geometry"]
    if "obstructions" in msg:
        opts[CONF_OBSTRUCTIONS] = msg["obstructions"]
    if "twilight" in msg:
        opts[CONF_TWILIGHT] = msg["twilight"]
    hass.config_entries.async_update_entry(entry, options=opts)
    connection.send_result(msg["id"], {"saved": True})


def async_register(hass: HomeAssistant) -> None:
    for cmd in (ws_config, ws_sky, ws_save_geometry):
        websocket_api.async_register_command(hass, cmd)
