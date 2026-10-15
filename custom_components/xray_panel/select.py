"""Выбор узла группы: «Авто» = приоритет/фолбэк панели, иначе закрепление узла."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import XrayPanelError
from .const import OPTION_AUTO, OPTION_DIRECT
from .entity import XrayGroupEntity


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    c = entry.runtime_data
    async_add_entities(GroupNodeSelect(c, gid) for gid in c.data["groups"])


class GroupNodeSelect(XrayGroupEntity, SelectEntity):
    def __init__(self, coordinator, gid) -> None:
        super().__init__(coordinator, gid, "node")

    def _choices(self) -> dict[str, str | None]:
        """Подпись → значение для POST /api/groups/<id>/pin."""
        out: dict[str, str | None] = {OPTION_AUTO: None}
        for nid in (self.group or {}).get("nodes", []):
            out[self.coordinator.node_name(nid) or nid] = nid
        out[OPTION_DIRECT] = "direct"
        return out

    @property
    def options(self) -> list[str]:
        return list(self._choices())

    @property
    def current_option(self) -> str | None:
        pinned = (self.group_status or {}).get("pinned")
        for label, value in self._choices().items():
            if value == pinned:
                return label
        return OPTION_AUTO

    async def async_select_option(self, option: str) -> None:
        choices = self._choices()
        if option not in choices:
            raise HomeAssistantError(f"Нет такого варианта: {option}")
        try:
            await self.coordinator.api.pin(self.gid, choices[option])
        except XrayPanelError as err:
            raise HomeAssistantError(str(err)) from err
        await self.coordinator.async_request_refresh()
