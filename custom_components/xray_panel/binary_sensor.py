"""Бинарные сенсоры: xray запущен, узел доступен."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .entity import XrayEntity, XrayNodeEntity


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    c = entry.runtime_data
    async_add_entities([XrayRunning(c)] + [NodeAlive(c, nid) for nid in c.data["nodes"]])


class XrayRunning(XrayEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.RUNNING

    def __init__(self, coordinator) -> None:
        super().__init__(coordinator, "xray_running")

    @property
    def is_on(self):
        return bool(self.status["xray"].get("running"))

    @property
    def extra_state_attributes(self):
        x = self.status["xray"]
        return {"version": x.get("version"), "restarts": x.get("restarts"), "last_error": x.get("lastError") or None}


class NodeAlive(XrayNodeEntity, BinarySensorEntity):
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator, nid) -> None:
        super().__init__(coordinator, nid, "alive")

    @property
    def is_on(self):
        ns = self.node_status
        return ns.get("alive") if ns else None
