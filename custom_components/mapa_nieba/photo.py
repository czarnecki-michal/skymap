"""Balcony photo stored by the integration (upload via the card's wizard)."""
from __future__ import annotations

import time
from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.http import KEY_HASS

from .const import CONF_PHOTO, DOMAIN, PHOTO_MAX_BYTES, PHOTO_TYPES, PHOTO_URL


def _entry(hass: HomeAssistant):
    entries = [e for e in hass.config_entries.async_entries(DOMAIN) if hasattr(e, "runtime_data")]
    return entries[0] if entries else None


def photo_dir(hass: HomeAssistant) -> Path:
    return Path(hass.config.path(DOMAIN))


def _write(folder: Path, name: str, data: bytes) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("photo.*"):
        old.unlink()
    (folder / name).write_bytes(data)


def remove_photo_files(folder: Path) -> None:
    for old in folder.glob("photo.*"):
        old.unlink()


class MapaNiebaPhotoView(HomeAssistantView):
    url = PHOTO_URL
    name = "api:mapa_nieba:photo"
    requires_auth = True

    async def get(self, request: web.Request) -> web.StreamResponse:
        hass = request.app[KEY_HASS]
        entry = _entry(hass)
        meta = entry.options.get(CONF_PHOTO) if entry else None
        if not meta:
            return web.Response(status=404)
        path = photo_dir(hass) / meta["file"]
        if not await hass.async_add_executor_job(path.exists):
            return web.Response(status=404)
        return web.FileResponse(path, headers={"Cache-Control": "no-cache"})

    async def post(self, request: web.Request) -> web.Response:
        hass = request.app[KEY_HASS]
        if not request["hass_user"].is_admin:
            return web.Response(status=403, text="Tylko administrator może wgrać zdjęcie")
        ext = PHOTO_TYPES.get(request.content_type)
        if ext is None:
            return web.Response(status=415, text="Obsługiwane formaty: JPEG, PNG, WebP")
        if request.content_length and request.content_length > PHOTO_MAX_BYTES:
            return web.Response(status=413, text="Zdjęcie jest za duże (maks. 15 MB)")
        data = await request.content.read(PHOTO_MAX_BYTES + 1)
        if len(data) > PHOTO_MAX_BYTES:
            return web.Response(status=413, text="Zdjęcie jest za duże (maks. 15 MB)")
        entry = _entry(hass)
        if entry is None:
            return web.Response(status=404, text="Mapa nieba nie jest skonfigurowana")
        name = f"photo.{ext}"
        await hass.async_add_executor_job(_write, photo_dir(hass), name, data)
        version = int(time.time())
        hass.config_entries.async_update_entry(
            entry, options={**entry.options, CONF_PHOTO: {"file": name, "version": version}}
        )
        return self.json({"version": version})
