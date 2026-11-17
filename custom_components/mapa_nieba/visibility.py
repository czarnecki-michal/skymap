"""Visibility rules (pure Python)."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Sequence

from .geometry import Point, WindowGeometry, in_frame, point_in_obstruction
from .objects import SkyObject


class VisState(StrEnum):
    VISIBLE = "visible"
    OBSTRUCTED = "obstructed"
    OUT_OF_FRAME = "out_of_frame"
    HIDDEN = "hidden"


def visibility(
    obj: SkyObject,
    alt: float,
    az: float,
    sun_alt: float,
    geometry: WindowGeometry,
    obstructions: Sequence[Sequence[Point]],
    twilight: float = -12.0,
) -> VisState:
    if alt <= 0:
        return VisState.HIDDEN
    if obj.kind in ("planet", "star") and sun_alt > twilight:
        return VisState.HIDDEN
    if not in_frame(geometry, az, alt):
        return VisState.OUT_OF_FRAME
    if point_in_obstruction(obstructions, az, alt):
        return VisState.OBSTRUCTED
    return VisState.VISIBLE


def next_visible(states: Sequence[tuple[datetime, VisState]]) -> datetime | None:
    """First time the object becomes VISIBLE; None if it is visible now or never."""
    if not states or states[0][1] == VisState.VISIBLE:
        return None
    for when, state in states[1:]:
        if state == VisState.VISIBLE:
            return when
    return None
