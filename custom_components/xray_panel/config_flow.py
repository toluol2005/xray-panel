"""Настройка через UI: адрес панели + логин (если вход в панели включён)."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_PASSWORD, CONF_URL, CONF_USERNAME
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import XrayPanelApi, XrayPanelAuthError, XrayPanelError
from .const import CONF_ADMIN_ONLY, CONF_TITLE, DEFAULT_TITLE, DEFAULT_URL, DOMAIN


async def _validate(hass, data: dict[str, Any]) -> str:
    """Возвращает имя хоста панели; бросает ошибки api."""
    api = XrayPanelApi(async_get_clientsession(hass), data[CONF_URL],
                       data.get(CONF_USERNAME, ""), data.get(CONF_PASSWORD, ""))
    auth = await api.auth_status()
    if auth.get("authRequired"):
        await api.login()
    await api.status()
    system = await api.system()
    return system.get("hostname") or "xray-panel"


class XrayPanelConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            user_input[CONF_URL] = user_input[CONF_URL].strip().rstrip("/")
            try:
                await _validate(self.hass, user_input)
            except XrayPanelAuthError:
                errors["base"] = "invalid_auth"
            except XrayPanelError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title="Xray Panel", data=user_input)
        schema = vol.Schema({
            vol.Required(CONF_URL, default=(user_input or {}).get(CONF_URL, DEFAULT_URL)): str,
            vol.Optional(CONF_USERNAME, default=(user_input or {}).get(CONF_USERNAME, "")): str,
            vol.Optional(CONF_PASSWORD, default=""): str,
        })
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_reauth(self, entry_data: Mapping[str, Any]) -> ConfigFlowResult:
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}
        if user_input is not None:
            data = {**entry.data, **user_input}
            try:
                await _validate(self.hass, data)
            except XrayPanelAuthError:
                errors["base"] = "invalid_auth"
            except XrayPanelError:
                errors["base"] = "cannot_connect"
            else:
                return self.async_update_reload_and_abort(entry, data=data)
        schema = vol.Schema({
            vol.Required(CONF_USERNAME, default=entry.data.get(CONF_USERNAME, "")): str,
            vol.Required(CONF_PASSWORD): str,
        })
        return self.async_show_form(step_id="reauth_confirm", data_schema=schema, errors=errors)

    @staticmethod
    def async_get_options_flow(config_entry) -> OptionsFlow:
        return XrayPanelOptionsFlow()


class XrayPanelOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        o = self.config_entry.options
        schema = vol.Schema({
            vol.Required(CONF_TITLE, default=o.get(CONF_TITLE, DEFAULT_TITLE)): str,
            vol.Required(CONF_ADMIN_ONLY, default=o.get(CONF_ADMIN_ONLY, True)): bool,
        })
        return self.async_show_form(step_id="init", data_schema=schema)
