from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResultType

from custom_components.mapa_nieba.const import (
    CONF_GEOMETRY, CONF_OBJECTS, CONF_OBSTRUCTIONS, CONF_TWILIGHT,
    DEFAULT_GEOMETRY, DEFAULT_OBJECTS, DEFAULT_TWILIGHT, DOMAIN,
)


async def test_user_flow_creates_entry(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert result["type"] == FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] == FlowResultType.CREATE_ENTRY
    opts = result["options"]
    assert opts[CONF_GEOMETRY] == DEFAULT_GEOMETRY
    assert opts[CONF_OBJECTS] == DEFAULT_OBJECTS and len(DEFAULT_OBJECTS) == 14
    assert opts[CONF_OBSTRUCTIONS] == [] and opts[CONF_TWILIGHT] == DEFAULT_TWILIGHT


async def test_single_instance(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    await hass.config_entries.flow.async_configure(result["flow_id"], {})
    again = await hass.config_entries.flow.async_init(DOMAIN, context={"source": config_entries.SOURCE_USER})
    assert again["type"] == FlowResultType.ABORT
    assert again["reason"] == "single_instance_allowed"
