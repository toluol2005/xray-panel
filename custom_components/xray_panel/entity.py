"""Базовые сущности: устройство «Xray Panel», устройства групп и узлов."""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import XrayPanelCoordinator


def hub_identifier(entry: ConfigEntry) -> tuple[str, str]:
    return (DOMAIN, entry.entry_id)


def group_identifier(entry: ConfigEntry, gid: str) -> tuple[str, str]:
    return (DOMAIN, f"{entry.entry_id}_group_{gid}")


def node_identifier(entry: ConfigEntry, nid: str) -> tuple[str, str]:
    return (DOMAIN, f"{entry.entry_id}_node_{nid}")


class XrayEntity(CoordinatorEntity[XrayPanelCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: XrayPanelCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_translation_key = key
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_{key}"
        entry = coordinator.config_entry
        self._attr_device_info = DeviceInfo(
            identifiers={hub_identifier(entry)},
            name="Xray Panel",
            manufacturer="XTLS",
            model="Xray-core",
            sw_version=coordinator.data["status"].get("xray", {}).get("version"),
            configuration_url=entry.data[CONF_URL],
        )

    @property
    def status(self) -> dict[str, Any]:
        return self.coordinator.data["status"]


class XrayGroupEntity(CoordinatorEntity[XrayPanelCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: XrayPanelCoordinator, gid: str, key: str) -> None:
        super().__init__(coordinator)
        self.gid = gid
        entry = coordinator.config_entry
        g = coordinator.data["groups"][gid]
        self._attr_translation_key = f"group_{key}"
        self._attr_unique_id = f"{entry.entry_id}_group_{gid}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={group_identifier(entry, gid)},
            name=f"VPN {g['name']}",
            manufacturer="Xray Panel",
            model=f"Группа, порт {g['port']}",
            via_device=hub_identifier(entry),
            configuration_url=f"{entry.data[CONF_URL]}/#/groups/{gid}",
        )

    @property
    def group(self) -> dict[str, Any] | None:
        return self.coordinator.data["groups"].get(self.gid)

    @property
    def group_status(self) -> dict[str, Any] | None:
        return next((g for g in self.coordinator.data["status"].get("groups", []) if g["id"] == self.gid), None)

    @property
    def available(self) -> bool:
        return super().available and self.group_status is not None


class XrayNodeEntity(CoordinatorEntity[XrayPanelCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: XrayPanelCoordinator, nid: str, key: str) -> None:
        super().__init__(coordinator)
        self.nid = nid
        entry = coordinator.config_entry
        n = coordinator.data["nodes"][nid]
        self._attr_translation_key = f"node_{key}"
        self._attr_unique_id = f"{entry.entry_id}_node_{nid}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={node_identifier(entry, nid)},
            name=f"VPN {n['name']}",
            manufacturer="Xray Panel",
            model=f"Узел {n.get('protocol', '')}".strip(),
            via_device=hub_identifier(entry),
            configuration_url=f"{entry.data[CONF_URL]}/#/nodes/{nid}",
        )

    @property
    def node(self) -> dict[str, Any] | None:
        return self.coordinator.data["nodes"].get(self.nid)

    @property
    def node_status(self) -> dict[str, Any] | None:
        return self.coordinator.data["status"].get("nodes", {}).get(self.nid)

    @property
    def available(self) -> bool:
        return super().available and self.node_status is not None
