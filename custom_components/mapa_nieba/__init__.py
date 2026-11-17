"""Mapa nieba – what is visible from the balcony."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # keep pure modules importable without Home Assistant
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: "HomeAssistant", entry: "ConfigEntry") -> bool:
    from homeassistant.exceptions import ConfigEntryError

    from . import astro
    from .const import PLATFORMS
    from .coordinator import MapaNiebaCoordinator

    if hass.config.latitude == 0 and hass.config.longitude == 0:
        _LOGGER.warning(
            "Lokalizacja Home Assistant to 0/0 - ustaw ją w Ustawienia > System > Ogólne"
        )
    try:
        await hass.async_add_executor_job(astro.ensure_ephemeris)
    except FileNotFoundError as err:
        raise ConfigEntryError(str(err)) from err

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
