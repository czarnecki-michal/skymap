"""Config and options flow for Mapa nieba."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers import selector

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
from .objects import CATALOG


def _num(lo: float, hi: float, step: float = 0.1) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(min=lo, max=hi, step=step, mode=selector.NumberSelectorMode.BOX)
    )


class MapaNiebaConfigFlow(ConfigFlow, domain=DOMAIN):
    """Single-step flow that stores default options."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return MapaNiebaOptionsFlow()

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


class MapaNiebaOptionsFlow(OptionsFlow):
    """Objects, twilight threshold and window geometry (obstructions stay untouched)."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        opts = self.config_entry.options
        geo = {**DEFAULT_GEOMETRY, **opts.get(CONF_GEOMETRY, {})}
        if user_input is not None:
            new_geo = {k: float(user_input[k]) for k in DEFAULT_GEOMETRY}
            return self.async_create_entry(
                data={
                    **opts,
                    CONF_OBJECTS: list(user_input[CONF_OBJECTS]),
                    CONF_TWILIGHT: float(user_input[CONF_TWILIGHT]),
                    CONF_GEOMETRY: new_geo,
                }
            )
        schema = vol.Schema(
            {
                vol.Required(CONF_OBJECTS, default=opts.get(CONF_OBJECTS, DEFAULT_OBJECTS)):
                    selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                selector.SelectOptionDict(value=o.id, label=o.name_pl)
                                for o in CATALOG.values()
                            ],
                            multiple=True,
                        )
                    ),
                vol.Required(CONF_TWILIGHT, default=opts.get(CONF_TWILIGHT, DEFAULT_TWILIGHT)): _num(-18, 0),
                vol.Required("az_center", default=geo["az_center"]): _num(0, 360),
                vol.Required("alt_center", default=geo["alt_center"]): _num(-10, 90),
                vol.Required("hfov", default=geo["hfov"]): _num(10, 120),
                vol.Required("aspect", default=geo["aspect"]): _num(0.3, 3, 0.01),
                vol.Required("roll", default=geo["roll"]): _num(-180, 180),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
