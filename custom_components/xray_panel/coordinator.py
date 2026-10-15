"""Опрос панели: /api/status (живые данные) + /api/state (имена, состав групп)."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import XrayPanelApi, XrayPanelAuthError, XrayPanelError
from .const import DOMAIN, SCAN_INTERVAL

_LOGGER = logging.getLogger(__name__)


class XrayPanelCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, api: XrayPanelApi) -> None:
        super().__init__(hass, _LOGGER, config_entry=entry, name=DOMAIN, update_interval=SCAN_INTERVAL)
        self.api = api

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            status = await self.api.status()
            state = await self.api.state()
        except XrayPanelAuthError as err:
            raise ConfigEntryAuthFailed(str(err)) from err
        except XrayPanelError as err:
            raise UpdateFailed(str(err)) from err
        return {
            "status": status,
            "nodes": {n["id"]: n for n in state.get("nodes", [])},
            "groups": {g["id"]: g for g in state.get("groups", [])},
        }

    def layout(self) -> tuple:
        """Состав узлов/групп: при его смене интеграция перезагружается и пересоздаёт сущности."""
        d = self.data or {}
        return (
            tuple((nid, n.get("name")) for nid, n in d.get("nodes", {}).items()),
            tuple((gid, g.get("name"), tuple(g.get("nodes", []))) for gid, g in d.get("groups", {}).items()),
        )

    def node_name(self, nid: str | None) -> str | None:
        n = (self.data or {}).get("nodes", {}).get(nid or "")
        return n.get("name") if n else None
