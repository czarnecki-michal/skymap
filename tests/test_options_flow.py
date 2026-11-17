import pytest
from homeassistant.data_entry_flow import FlowResultType, InvalidData

from custom_components.mapa_nieba.const import CONF_GEOMETRY, CONF_OBJECTS, CONF_OBSTRUCTIONS, CONF_TWILIGHT

from .test_sensor import make_entry, setup, NOW

FORM = {"objects": ["venus"], "twilight": -9, "az_center": 120, "alt_center": 20,
        "hfov": 70, "aspect": 1.5, "roll": 2}
POLY = [[[130, 0], [140, 0], [140, 40]]]


async def test_options_saved_and_obstructions_preserved(hass, freezer):
    freezer.move_to(NOW)
    entry = make_entry(**{CONF_OBSTRUCTIONS: POLY})
    await setup(hass, entry)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(result["flow_id"], FORM)
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert entry.options[CONF_OBJECTS] == ["venus"]
    assert entry.options[CONF_TWILIGHT] == -9
    assert entry.options[CONF_GEOMETRY]["az_center"] == 120
    assert entry.options[CONF_OBSTRUCTIONS] == POLY


async def test_out_of_range_rejected(hass, freezer):
    freezer.move_to(NOW)
    entry = make_entry()
    await setup(hass, entry)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    with pytest.raises(InvalidData):
        await hass.config_entries.options.async_configure(result["flow_id"], {**FORM, "hfov": 500})
