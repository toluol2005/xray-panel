"""Xray Panel: пункт «VPN» в меню Home Assistant и сущности узлов/групп xray-panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_PASSWORD, CONF_URL, CONF_USERNAME, Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import XrayPanelApi
from .const import (
    CONF_ADMIN_ONLY, CONF_TITLE, DEFAULT_TITLE, DOMAIN, PANEL_ELEMENT, PANEL_ICON,
    PANEL_URL_PATH, STATIC_URL, VERSION,
)
from .coordinator import XrayPanelCoordinator
from .entity import group_identifier, hub_identifier, node_identifier

PLATFORMS = [Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SELECT, Platform.SENSOR]

type XrayPanelConfigEntry = ConfigEntry[XrayPanelCoordinator]


async def async_setup_entry(hass: HomeAssistant, entry: XrayPanelConfigEntry) -> bool:
    api = XrayPanelApi(async_get_clientsession(hass), entry.data[CONF_URL],
                       entry.data.get(CONF_USERNAME, ""), entry.data.get(CONF_PASSWORD, ""))
    coordinator = XrayPanelCoordinator(hass, entry, api)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    _remove_stale_devices(hass, entry, coordinator)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    await _register_panel(hass, entry)

    # Добавили/удалили/переименовали узел или группу в панели — пересоздаём сущности.
    layout = coordinator.layout()

    @callback
    def _check_layout() -> None:
        if coordinator.last_update_success and coordinator.layout() != layout:
            hass.config_entries.async_schedule_reload(entry.entry_id)

    entry.async_on_unload(coordinator.async_add_listener(_check_layout))
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: XrayPanelConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _options_updated(hass: HomeAssistant, entry: XrayPanelConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _register_panel(hass: HomeAssistant, entry: XrayPanelConfigEntry) -> None:
    """Пункт бокового меню: свой web-компонент, внутри — панель в iframe (?embed=1)."""
    if not hass.data.get(f"{DOMAIN}_static"):
        # Статику регистрируем один раз за жизнь HA: маршрут aiohttp не снять при перезагрузке записи.
        await hass.http.async_register_static_paths([
            StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "www"), cache_headers=False),
        ])
        hass.data[f"{DOMAIN}_static"] = True
    frontend.async_remove_panel(hass, PANEL_URL_PATH, warn_if_unknown=False)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=entry.options.get(CONF_TITLE) or DEFAULT_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{STATIC_URL}/xray-panel.js?v={VERSION}",
        config={"url": entry.data[CONF_URL]},
        require_admin=entry.options.get(CONF_ADMIN_ONLY, True),
    )


def _remove_stale_devices(hass: HomeAssistant, entry: XrayPanelConfigEntry,
                          coordinator: XrayPanelCoordinator) -> None:
    """Отвязывает устройства узлов/групп, которых в панели больше нет."""
    valid = {hub_identifier(entry)}
    valid |= {node_identifier(entry, nid) for nid in coordinator.data["nodes"]}
    valid |= {group_identifier(entry, gid) for gid in coordinator.data["groups"]}
    reg = dr.async_get(hass)
    for device in dr.async_entries_for_config_entry(reg, entry.entry_id):
        if not device.identifiers & valid:
            reg.async_update_device(device.id, remove_config_entry_id=entry.entry_id)
