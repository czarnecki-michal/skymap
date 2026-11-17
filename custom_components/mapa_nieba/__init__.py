"""Mapa nieba – what is visible from the balcony."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # keep pure modules importable without Home Assistant
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: "HomeAssistant", config: dict) -> bool:
    from . import websocket_api

    from pathlib import Path

    from homeassistant.components.frontend import add_extra_js_url
    from homeassistant.components.http import StaticPathConfig

    websocket_api.async_register(hass)
    url = "/mapa_nieba/mapa-nieba-card.js"
    path = Path(__file__).parent / "www" / "mapa-nieba-card.js"
    await hass.http.async_register_static_paths([StaticPathConfig(url, str(path), False)])
    add_extra_js_url(hass, url)
    return True


async def async_setup_entry(hass: "HomeAssistant", entry: "ConfigEntry") -> bool:
    from homeassistant.exceptions import ConfigEntryError

    from .const import PLATFORMS

    if hass.config.latitude == 0 and hass.config.longitude == 0:
        _LOGGER.warning(
            "Lokalizacja Home Assistant to 0/0 - ustaw ją w Ustawienia > System > Ogólne"
        )

    def _load_astro() -> None:
        # first import of skyfield/numpy and the ephemeris read happen off the event loop
        from . import astro

        astro.ensure_ephemeris()

    try:
        await hass.async_add_executor_job(_load_astro)
    except FileNotFoundError as err:
        raise ConfigEntryError(str(err)) from err

    from .coordinator import MapaNiebaCoordinator  # imports astro, already loaded

    coordinator = MapaNiebaCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def _options_updated(hass: "HomeAssistant", entry: "ConfigEntry") -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: "HomeAssistant", entry: "ConfigEntry") -> bool:
    from .const import PLATFORMS

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
