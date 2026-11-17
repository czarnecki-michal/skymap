from .test_sensor import NOW, make_entry, setup


async def test_card_js_is_served(hass, hass_client, freezer):
    await setup(hass, make_entry())
    client = await hass_client()
    resp = await client.get("/mapa_nieba/mapa-nieba-card.js")
    assert resp.status == 200
    assert "mapa-nieba-card" in await resp.text()
