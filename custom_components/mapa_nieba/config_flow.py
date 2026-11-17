"""Config flow for Mapa nieba."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import (
    CONF_GEOMETRY,
    CONF_OBJECTS,
    CONF_OBSTRUCTIONS,
    CONF_TWILIGHT,
    DEFAULT_GEOMETRY,
    DEFAULT_OBJECTS,
    DEFAULT_TWILIGHT,
    DOMAIN,
)


class MapaNiebaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Single-step flow that stores default options."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
        return self.async_create_entry(
            title="Mapa nieba",
            data={},
            options={
                CONF_GEOMETRY: dict(DEFAULT_GEOMETRY),
                CONF_OBSTRUCTIONS: [],
                CONF_OBJECTS: list(DEFAULT_OBJECTS),
                CONF_TWILIGHT: DEFAULT_TWILIGHT,
            },
        )
