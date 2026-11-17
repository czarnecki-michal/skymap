"""Data coordinator for Mapa nieba."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from . import astro
from .const import (
    CONF_GEOMETRY,
    CONF_OBJECTS,
    CONF_OBSTRUCTIONS,
    CONF_TWILIGHT,
    DEFAULT_TWILIGHT,
    DOMAIN,
)
from .geometry import WindowGeometry
from .objects import CATALOG
from .visibility import VisState, next_visible, visibility

_LOGGER = logging.getLogger(__name__)

TRACK_STEP = timedelta(minutes=10)
TRACK_POINTS = 73  # 12 h


@dataclass
class ObjectData:
    position: astro.BodyPosition
    state: VisState
    reveals_at: datetime | None


def compute_all(
    object_ids: list[str],
    observer: astro.Observer,
    geometry: WindowGeometry,
    obstructions: list,
    twilight: float,
    now: datetime,
) -> dict[str, ObjectData]:
    """Blocking: runs in the executor."""
    objs = [CATALOG[i] for i in object_ids if i in CATALOG]
    positions = astro.compute_positions(objs, observer, now)
    times = [now + TRACK_STEP * i for i in range(TRACK_POINTS)]
    track = astro.compute_track(objs, observer, times)
    sun_alts = astro.sun_altitudes(observer, times)
    out: dict[str, ObjectData] = {}
    for obj in objs:
        pos = positions[obj.id]
        states = [
            (t, visibility(obj, alt, az, sa, geometry, obstructions, twilight))
            for t, (alt, az), sa in zip(times, track[obj.id], sun_alts)
        ]
        state = visibility(obj, pos.alt, pos.az, sun_alts[0], geometry, obstructions, twilight)
        out[obj.id] = ObjectData(pos, state, next_visible([(now, state)] + states[1:]))
    return out


class MapaNiebaCoordinator(DataUpdateCoordinator[dict[str, ObjectData]]):
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass, _LOGGER, name=DOMAIN, config_entry=entry, update_interval=timedelta(minutes=1)
        )

    def observer(self) -> astro.Observer:
        c = self.hass.config
        return astro.Observer(c.latitude, c.longitude, float(c.elevation or 0))

    async def _async_update_data(self) -> dict[str, ObjectData]:
        o = self.config_entry.options
        return await self.hass.async_add_executor_job(
            compute_all,
            list(o[CONF_OBJECTS]),
            self.observer(),
            WindowGeometry.from_dict(o[CONF_GEOMETRY]),
            [[tuple(p) for p in poly] for poly in o.get(CONF_OBSTRUCTIONS, [])],
            float(o.get(CONF_TWILIGHT, DEFAULT_TWILIGHT)),
            dt_util.utcnow(),
        )
