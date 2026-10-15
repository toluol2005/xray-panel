"""Клиент HTTP API xray-panel (FastAPI на .95:2017)."""
from __future__ import annotations

import asyncio
from typing import Any

import aiohttp

TIMEOUT = aiohttp.ClientTimeout(total=15)


class XrayPanelError(Exception):
    """Панель недоступна или вернула ошибку."""


class XrayPanelAuthError(XrayPanelError):
    """Неверный логин/пароль или вход требуется, а он не задан."""


class XrayPanelApi:
    def __init__(self, session: aiohttp.ClientSession, url: str,
                 username: str = "", password: str = "") -> None:
        self._session = session
        self.url = url.rstrip("/")
        self._username = username
        self._password = password
        # Сессия панели — cookie xp_session; храним сами, т.к. общий cookie jar
        # aiohttp не принимает cookie от хостов, заданных IP-адресом.
        self._token: str | None = None

    async def login(self) -> None:
        if not self._username:
            raise XrayPanelAuthError("Панель требует вход, а логин не задан")
        try:
            async with self._session.post(
                f"{self.url}/api/auth/login",
                json={"username": self._username, "password": self._password},
                timeout=TIMEOUT,
            ) as resp:
                if resp.status == 401:
                    raise XrayPanelAuthError("Неверный логин или пароль")
                if resp.status >= 400:
                    raise XrayPanelError(f"Вход: HTTP {resp.status}")
                cookie = resp.cookies.get("xp_session")
                self._token = cookie.value if cookie else None
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise XrayPanelError(f"Панель недоступна: {err}") from err

    async def request(self, method: str, path: str, body: Any = None, *, _retry: bool = True) -> Any:
        headers = {"Cookie": f"xp_session={self._token}"} if self._token else None
        try:
            async with self._session.request(
                method, f"{self.url}{path}", json=body, headers=headers, timeout=TIMEOUT,
            ) as resp:
                if resp.status == 401:
                    if _retry and self._username:
                        await self.login()
                        return await self.request(method, path, body, _retry=False)
                    raise XrayPanelAuthError("Панель требует вход")
                data = await resp.json(content_type=None)
                if resp.status >= 400:
                    msg = data.get("error") if isinstance(data, dict) else None
                    raise XrayPanelError(msg or f"HTTP {resp.status}")
                return data
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise XrayPanelError(f"Панель недоступна: {err}") from err

    async def auth_status(self) -> dict:
        return await self.request("GET", "/api/auth/status")

    async def status(self) -> dict:
        return await self.request("GET", "/api/status")

    async def state(self) -> dict:
        return await self.request("GET", "/api/state")

    async def system(self) -> dict:
        return await self.request("GET", "/api/system")

    async def pin(self, gid: str, node: str | None) -> None:
        await self.request("POST", f"/api/groups/{gid}/pin", {"node": node})

    async def test_node(self, nid: str) -> dict:
        return await self.request("POST", f"/api/nodes/{nid}/test")

    async def restart_xray(self) -> None:
        await self.request("POST", "/api/xray/restart")
