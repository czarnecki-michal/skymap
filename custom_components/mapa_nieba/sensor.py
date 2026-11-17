"""Sensors: one per sky object."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import MapaNiebaCoordinator
from .objects import CATALOG
from .visibility import VisState


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    coordinator: MapaNiebaCoordinator = entry.runtime_data
    reg = er.async_get(hass)
    wanted = {f"mapa_nieba_{oid}" for oid in coordinator.data}
    for ent in er.async_entries_for_config_entry(reg, entry.entry_id):
        if ent.unique_id not in wanted:
            reg.async_remove(ent.entity_id)
    async_add_entities(MapaNiebaSensor(coordinator, oid) for oid in coordinator.data)


def _iso(dt):
    return dt.isoformat() if dt else None


class MapaNiebaSensor(CoordinatorEntity[MapaNiebaCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = [s.value for s in VisState]
    _attr_translation_key = "object"

    def __init__(self, coordinator: MapaNiebaCoordinator, object_id: str) -> None:
        super().__init__(coordinator)
        self._oid = object_id
        self._attr_unique_id = f"mapa_nieba_{object_id}"
        self._attr_name = CATALOG[object_id].name_pl
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, "mapa_nieba")}, name="Mapa nieba", manufacturer="Mapa nieba"
        )

    @property
    def native_value(self) -> str | None:
        d = self.coordinator.data.get(self._oid)
        return d.state.value if d else None

    @property
    def extra_state_attributes(self) -> dict:
        d = self.coordinator.data.get(self._oid)
        if not d:
            return {}
        p = d.position
        return {
            "altitude": round(p.alt, 2),
            "azimuth": round(p.az, 2),
            "magnitude": p.magnitude,
            "rise": _iso(p.rise),
            "set": _iso(p.set),
            "transit": _iso(p.transit),
            "illumination": None if p.illumination is None else round(p.illumination, 3),
            "phase": None if p.phase is None else round(p.phase, 3),
            "reveals_at": _iso(d.reveals_at),
        }
