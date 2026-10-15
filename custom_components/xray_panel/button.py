"""Кнопки: перезапуск xray, проверка узла."""
from __future__ import annotations

from homeassistant.components.button import ButtonDeviceClass, ButtonEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import XrayPanelError
from .entity import XrayEntity, XrayNodeEntity


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    c = entry.runtime_data
    async_add_entities([RestartXray(c)] + [TestNode(c, nid) for nid in c.data["nodes"]])


class RestartXray(XrayEntity, ButtonEntity):
    _attr_device_class = ButtonDeviceClass.RESTART
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "restart_xray")

    async def async_press(self) -> None:
        try:
            await self.coordinator.api.restart_xray()
        except XrayPanelError as err:
            raise HomeAssistantError(str(err)) from err
        await self.coordinator.async_request_refresh()


class TestNode(XrayNodeEntity, ButtonEntity):
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator, nid) -> None:
        super().__init__(coordinator, nid, "test")

    async def async_press(self) -> None:
        try:
            await self.coordinator.api.test_node(self.nid)
        except XrayPanelError as err:
            raise HomeAssistantError(str(err)) from err
        await self.coordinator.async_request_refresh()
