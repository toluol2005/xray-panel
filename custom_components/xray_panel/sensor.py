"""Сенсоры: трафик/скорость панели, активный узел группы, задержка/трафик узлов."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass, SensorEntity, SensorEntityDescription, SensorStateClass,
)
from homeassistant.const import EntityCategory, UnitOfDataRate, UnitOfInformation, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import GROUP_STATES
from .entity import XrayEntity, XrayGroupEntity, XrayNodeEntity


@dataclass(frozen=True, kw_only=True)
class XraySensorDescription(SensorEntityDescription):
    value: Callable[[dict[str, Any]], Any]


RATE = dict(device_class=SensorDeviceClass.DATA_RATE, state_class=SensorStateClass.MEASUREMENT,
            native_unit_of_measurement=UnitOfDataRate.BYTES_PER_SECOND,
            suggested_unit_of_measurement=UnitOfDataRate.KILOBYTES_PER_SECOND, suggested_display_precision=1)
TOTAL = dict(device_class=SensorDeviceClass.DATA_SIZE, state_class=SensorStateClass.TOTAL_INCREASING,
             native_unit_of_measurement=UnitOfInformation.BYTES,
             suggested_unit_of_measurement=UnitOfInformation.MEGABYTES, suggested_display_precision=1)

HUB_SENSORS = (
    XraySensorDescription(key="upload_rate", value=lambda s: s["traffic"]["upRate"], **RATE),
    XraySensorDescription(key="download_rate", value=lambda s: s["traffic"]["downRate"], **RATE),
    XraySensorDescription(key="uploaded", value=lambda s: s["traffic"]["up"], **TOTAL),
    XraySensorDescription(key="downloaded", value=lambda s: s["traffic"]["down"], **TOTAL),
    XraySensorDescription(key="xray_uptime", value=lambda s: s["xray"].get("uptime") if s["xray"].get("running") else None,
                          device_class=SensorDeviceClass.DURATION, native_unit_of_measurement=UnitOfTime.SECONDS,
                          suggested_unit_of_measurement=UnitOfTime.HOURS, suggested_display_precision=1,
                          entity_category=EntityCategory.DIAGNOSTIC),
    XraySensorDescription(key="last_event", value=lambda s: (s.get("events") or [{}])[0].get("text", "")[:255] or None,
                          entity_category=EntityCategory.DIAGNOSTIC),
)


async def async_setup_entry(hass: HomeAssistant, entry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    c = entry.runtime_data
    entities: list[SensorEntity] = [XrayHubSensor(c, d) for d in HUB_SENSORS]
    for gid in c.data["groups"]:
        entities += [GroupActiveSensor(c, gid), GroupStateSensor(c, gid),
                     GroupRateSensor(c, gid, "upload_rate", "upRate"), GroupRateSensor(c, gid, "download_rate", "downRate")]
    for nid in c.data["nodes"]:
        entities += [NodeDelaySensor(c, nid),
                     NodeValueSensor(c, nid, "upload_rate", "upRate", RATE), NodeValueSensor(c, nid, "download_rate", "downRate", RATE),
                     NodeValueSensor(c, nid, "uploaded", "up", TOTAL), NodeValueSensor(c, nid, "downloaded", "down", TOTAL)]
    async_add_entities(entities)


class XrayHubSensor(XrayEntity, SensorEntity):
    entity_description: XraySensorDescription

    def __init__(self, coordinator, description: XraySensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self):
        return self.entity_description.value(self.status)


class GroupActiveSensor(XrayGroupEntity, SensorEntity):
    """Через какой узел сейчас идёт трафик группы — главное для автоматизаций."""

    def __init__(self, coordinator, gid) -> None:
        super().__init__(coordinator, gid, "active")

    @property
    def native_value(self):
        gs = self.group_status
        return gs["activeName"][:255] if gs else None

    @property
    def extra_state_attributes(self):
        gs = self.group_status or {}
        return {"node_id": gs.get("active"), "pinned": gs.get("pinned"), "port": gs.get("port"),
                "strategy": gs.get("strategy"), "fallback": gs.get("fallback")}


class GroupStateSensor(XrayGroupEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = GROUP_STATES

    def __init__(self, coordinator, gid) -> None:
        super().__init__(coordinator, gid, "state")

    @property
    def native_value(self):
        gs = self.group_status
        return gs["state"] if gs and gs["state"] in GROUP_STATES else None


class GroupRateSensor(XrayGroupEntity, SensorEntity):
    def __init__(self, coordinator, gid, key, field) -> None:
        super().__init__(coordinator, gid, key)
        self._field = field
        for k, v in RATE.items():
            setattr(self, f"_attr_{k}", v)

    @property
    def native_value(self):
        gs = self.group_status
        return gs.get(self._field) if gs else None


class NodeDelaySensor(XrayNodeEntity, SensorEntity):
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfTime.MILLISECONDS
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator, nid) -> None:
        super().__init__(coordinator, nid, "delay")

    @property
    def native_value(self):
        ns = self.node_status
        return ns.get("delay") if ns else None

    @property
    def extra_state_attributes(self):
        ns = self.node_status or {}
        n = self.node or {}
        tspu = ns.get("tspu") or {}
        return {"address": n.get("address"), "port": n.get("port"), "protocol": n.get("protocol"),
                "last_error": ns.get("lastError") or None,
                "tspu_blocked": tspu.get("blocked"), "location": tspu.get("location")}


class NodeValueSensor(XrayNodeEntity, SensorEntity):
    def __init__(self, coordinator, nid, key, field, attrs) -> None:
        super().__init__(coordinator, nid, key)
        self._field = field
        for k, v in attrs.items():
            setattr(self, f"_attr_{k}", v)

    @property
    def native_value(self):
        ns = self.node_status
        return ns.get(self._field) if ns else None
