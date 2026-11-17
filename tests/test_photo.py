from custom_components.mapa_nieba.const import CONF_PHOTO, PHOTO_MAX_BYTES

from .test_sensor import make_entry, setup

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 100 + b"\xff\xd9"


async def _setup(hass):
    entry = make_entry()
    await setup(hass, entry)
    return entry


async def test_upload_and_get(hass, hass_client, hass_ws_client):
    entry = await _setup(hass)
    client = await hass_client()
    resp = await client.post("/api/mapa_nieba/photo", data=JPEG, headers={"Content-Type": "image/jpeg"})
    assert resp.status == 200
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries("mapa_nieba")[0]
    assert entry.options[CONF_PHOTO]["file"] == "photo.jpg"
    resp = await client.get("/api/mapa_nieba/photo")
    assert resp.status == 200 and await resp.read() == JPEG
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "mapa_nieba/config"})
    assert (await ws.receive_json())["result"]["photo"]["version"] > 0


async def test_upload_rejections(hass, hass_client, hass_read_only_access_token):
    await _setup(hass)
    admin = await hass_client()
    resp = await admin.post("/api/mapa_nieba/photo", data=b"hello", headers={"Content-Type": "text/plain"})
    assert resp.status == 415
    big = b"\xff\xd8" + b"0" * (PHOTO_MAX_BYTES + 10)
    resp = await admin.post("/api/mapa_nieba/photo", data=big, headers={"Content-Type": "image/jpeg"})
    assert resp.status == 413
    ro = await hass_client(hass_read_only_access_token)
    resp = await ro.post("/api/mapa_nieba/photo", data=JPEG, headers={"Content-Type": "image/jpeg"})
    assert resp.status == 403
    assert (await admin.get("/api/mapa_nieba/photo")).status == 404


async def test_delete_photo_and_opacity(hass, hass_client, hass_ws_client):
    await _setup(hass)
    client = await hass_client()
    await client.post("/api/mapa_nieba/photo", data=JPEG, headers={"Content-Type": "image/jpeg"})
    await hass.async_block_till_done()
    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "delete_photo": True, "photo_opacity": 0.4})
    assert (await ws.receive_json())["success"]
    await hass.async_block_till_done()
    await ws.send_json({"id": 2, "type": "mapa_nieba/config"})
    res = (await ws.receive_json())["result"]
    assert res["photo"] is None and res["photo_opacity"] == 0.4


async def test_large_upload_is_stored_completely(hass, hass_client):
    await _setup(hass)
    client = await hass_client()
    big = b"\xff\xd8" + bytes(range(256)) * (6 * 1024 * 1024 // 256) + b"\xff\xd9"
    resp = await client.post("/api/mapa_nieba/photo", data=big, headers={"Content-Type": "image/jpeg"})
    assert resp.status == 200
    await hass.async_block_till_done()
    got = await (await client.get("/api/mapa_nieba/photo")).read()
    assert len(got) == len(big) and got == big


async def test_save_geometry_right_after_upload(hass, hass_client, hass_ws_client):
    await _setup(hass)
    client = await hass_client()
    ws = await hass_ws_client(hass)
    resp = await client.post("/api/mapa_nieba/photo", data=JPEG, headers={"Content-Type": "image/jpeg"})
    assert resp.status == 200
    geo = {"az_center": 100, "alt_center": 10, "hfov": 60, "aspect": 1.5, "roll": 0}
    await ws.send_json({"id": 1, "type": "mapa_nieba/save_geometry", "geometry": geo})
    msg = await ws.receive_json()
    assert msg["success"], msg
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries("mapa_nieba")[0]
    assert entry.options["geometry"]["az_center"] == 100
    assert entry.options[CONF_PHOTO]["file"] == "photo.jpg"
