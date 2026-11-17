from custom_components.mapa_nieba.const import CONF_GEOMETRY, CONF_OBSTRUCTIONS

from .test_sensor import NOW, make_entry, setup

TIMES = ["2026-01-15T20:00:00+00:00", "2026-01-15T21:00:00+00:00", "2026-01-15T22:00:00+00:00"]
GEO = {"az_center": 100, "alt_center": 10, "hfov": 60, "aspect": 1.5, "roll": 0}


async def _client(hass, hass_ws_client):
    entry = make_entry()
    await setup(hass, entry)
    return entry, await hass_ws_client(hass)


async def test_config_returns_objects_with_entity_ids(hass, hass_ws_client):
    entry, ws = await _client(hass, hass_ws_client)
    await ws.send_json({"id": 1, "type": "mapa_nieba/config"})
    res = (await ws.receive_json())["result"]
    assert len(res["objects"]) == 14
    assert all(o["entity_id"].startswith("sensor.mapa_nieba_") for o in res["objects"])
    assert res["geometry"]["az_center"] == 135


async def test_sky_lengths_and_limit(hass, hass_ws_client):
    entry, ws = await _client(hass, hass_ws_client)
    await ws.send_json({"id": 1, "type": "mapa_nieba/sky", "times": TIMES})
    res = (await ws.receive_json())["result"]
    assert all(len(v) == 3 for v in res["objects"].values())
    assert len(res["sun_alt"]) == 3 and len(res["moon"]["phase"]) == 3
    await ws.send_json({"id": 2, "type": "mapa_nieba/sky", "times": [TIMES[0]] * 301})
    assert (await ws.receive_json())["error"]["code"] == "too_many_times"


async def test_save_geometry_admin(hass, hass_ws_client):
    entry, ws = await _client(hass, hass_ws_client)
    poly = [[130, 0], [140, 0], [140, 40]]
    await ws.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "geometry": GEO, "obstructions": [poly]})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    assert entry.options[CONF_GEOMETRY]["az_center"] == 100
    assert entry.options[CONF_OBSTRUCTIONS] == [poly]


async def test_save_geometry_rejects_bad_polygon_and_non_admin(
    hass, hass_ws_client, hass_read_only_access_token
):
    entry, ws = await _client(hass, hass_ws_client)
    await ws.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "obstructions": [[[1, 2], [3, 4]]]})
    assert not (await ws.receive_json())["success"]
    ro = await hass_ws_client(hass, hass_read_only_access_token)
    await ro.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "geometry": GEO})
    assert (await ro.receive_json())["error"]["code"] == "unauthorized"


async def test_save_geometry_caps_vertex_count(hass, hass_ws_client):
    entry, ws = await _client(hass, hass_ws_client)
    big = [[float(i % 360), 10.0] for i in range(65)]
    await ws.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "obstructions": [big]})
    assert not (await ws.receive_json())["success"]


async def test_sky_always_has_solar_system_and_rises(hass, hass_ws_client):
    from custom_components.mapa_nieba.const import CONF_OBJECTS
    entry = make_entry(**{CONF_OBJECTS: ["sirius"]})
    await setup(hass, entry)
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "mapa_nieba/sky", "times": TIMES})
    res = (await ws.receive_json())["result"]
    assert {"sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"} <= set(res["objects"])
    assert 0 <= res["rises"]["sun"]["az"] < 360
    assert "time" in res["rises"]["moon"] or res["rises"]["moon"] is None


async def test_config_photo_defaults(hass, hass_ws_client):
    entry, ws = await _client(hass, hass_ws_client)
    await ws.send_json({"id": 1, "type": "mapa_nieba/config"})
    res = (await ws.receive_json())["result"]
    assert res["photo"] is None and res["photo_opacity"] == 0.6
