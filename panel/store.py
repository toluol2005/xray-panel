"""Состояние панели: узлы, группы, подписки, маршрутизация, настройки (data/state.json)."""
import copy
import json
import os
import secrets
from urllib.parse import urlsplit

NODE_DEFAULTS = {
    "name": "", "enabled": True, "note": "",
    "protocol": "vless", "address": "", "port": 443,
    "uuid": "", "flow": "", "encryption": "none", "alterId": 0,
    "password": "", "method": "", "username": "",
    "network": "tcp", "security": "none",
    "sni": "", "fingerprint": "chrome", "alpn": "", "allowInsecure": False,
    "publicKey": "", "shortId": "", "spiderX": "",
    "path": "", "host": "", "serviceName": "", "mode": "",
    "raw": None,
    "sub": None,   # id подписки, из которой пришёл узел
}

GROUP_DEFAULTS = {
    "name": "", "enabled": True, "listen": "0.0.0.0", "port": 7891, "udp": True,
    "nodes": [], "strategy": "priority", "fallback": "direct", "pinned": None,
    "routing": "geo", "username": "", "password": "",
}

SUB_DEFAULTS = {"name": "", "url": "", "group": "", "updatedAt": 0}

ROUTING_DEFAULTS = {
    "directDomains": [], "proxyDomains": [], "blockDomains": [],
    "directIPs": [], "blockAds": False,
}

SETTINGS_DEFAULTS = {
    "probeURL": "https://www.gstatic.com/generate_204",
    "probeInterval": 30,
    "logLevel": "warning",
    "dns": ["https://1.1.1.1/dns-query", "8.8.8.8"],
    "dnsDirect": [],  # серверы для российских доменов, ходят напрямую
    "dnsGroup": "",  # через какую группу ходят остальные DNS-серверы ("" — напрямую)
    "dnsPort": 0,  # DNS-сервер для локальной сети (0 — выключен)
    "tspuInterval": 360,
    "subProxyHosts": [],  # хосты, подписки с которых качаются только через прокси узлов
    "geoipURL": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat",
    "geositeURL": "https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat",
}

STRATEGIES = ("priority", "leastPing", "random")
PROTOCOLS = ("vless", "vmess", "trojan", "shadowsocks", "socks", "http")
NETWORKS = ("tcp", "ws", "grpc", "xhttp", "httpupgrade")
SECURITIES = ("none", "tls", "reality")


class ValidationError(Exception):
    pass


def new_id(prefix, taken):
    while True:
        i = prefix + secrets.token_hex(3)
        if i not in taken:
            return i


def _merge(defaults, data):
    out = copy.deepcopy(defaults)
    for k in defaults:
        if k in data and (data[k] is not None or k in ("raw", "pinned")):
            out[k] = data[k]
    return out


def _as_list(v):
    if isinstance(v, str):
        v = v.replace(",", "\n").splitlines()
    return [str(x).strip() for x in (v or []) if str(x).strip()]


def clean_node(data, nid):
    n = _merge(NODE_DEFAULTS, data)
    n["id"] = nid
    n["name"] = str(n["name"]).strip() or n["address"] or nid
    if n["raw"] in ("", {}):
        n["raw"] = None
    if isinstance(n["raw"], str):
        try:
            n["raw"] = json.loads(n["raw"])
        except ValueError as e:
            raise ValidationError(f"JSON outbound не разбирается: {e}")
    if n["raw"] is not None and not isinstance(n["raw"], dict):
        raise ValidationError("JSON outbound должен быть объектом")
    if n["raw"] is None:
        if n["protocol"] not in PROTOCOLS:
            raise ValidationError(f"Неизвестный протокол {n['protocol']}")
        if n["network"] not in NETWORKS:
            raise ValidationError(f"Неизвестный транспорт {n['network']}")
        if n["security"] not in SECURITIES:
            raise ValidationError(f"Неизвестная безопасность {n['security']}")
        n["address"] = str(n["address"]).strip()
        if not n["address"]:
            raise ValidationError("Не указан адрес сервера")
        try:
            n["port"] = int(n["port"])
            n["alterId"] = int(n["alterId"] or 0)
        except (TypeError, ValueError):
            raise ValidationError("Порт должен быть числом")
        if not 0 < n["port"] < 65536:
            raise ValidationError("Порт вне диапазона 1–65535")
        if n["protocol"] in ("vless", "vmess") and not n["uuid"]:
            raise ValidationError("Не указан UUID")
        if n["protocol"] in ("trojan", "shadowsocks") and not n["password"]:
            raise ValidationError("Не указан пароль")
        if n["security"] == "reality" and not n["publicKey"]:
            raise ValidationError("Для Reality нужен publicKey")
    n["enabled"] = bool(n["enabled"])
    n["allowInsecure"] = bool(n["allowInsecure"])
    n["sub"] = str(n["sub"]) if n["sub"] else None
    return n


def clean_group(data, gid, node_ids):
    g = _merge(GROUP_DEFAULTS, data)
    g["id"] = gid
    g["name"] = str(g["name"]).strip() or gid
    try:
        g["port"] = int(g["port"])
    except (TypeError, ValueError):
        raise ValidationError("Порт должен быть числом")
    if not 1 <= g["port"] <= 65535:
        raise ValidationError("Порт вне диапазона 1–65535")
    if g["strategy"] not in STRATEGIES:
        raise ValidationError("Неизвестная стратегия")
    if g["fallback"] not in ("direct", "block"):
        raise ValidationError("fallback: direct или block")
    if g["routing"] not in ("geo", "all"):
        raise ValidationError("routing: geo или all")
    seen = []
    for nid in g["nodes"]:
        if nid in node_ids and nid not in seen:
            seen.append(nid)
    g["nodes"] = seen
    if g["pinned"] not in (None, "direct") and g["pinned"] not in seen:
        g["pinned"] = None
    g["enabled"] = bool(g["enabled"])
    g["udp"] = bool(g["udp"])
    return g


def clean_subscription(data, sid, group_ids):
    s = _merge(SUB_DEFAULTS, data)
    s["id"] = sid
    s["url"] = str(s["url"]).strip()
    if not s["url"].startswith(("http://", "https://")):
        raise ValidationError("URL подписки должен начинаться с http:// или https://")
    s["name"] = str(s["name"]).strip() or urlsplit(s["url"]).netloc or sid
    s["group"] = str(s["group"] or "")
    if s["group"] and s["group"] not in group_ids:
        s["group"] = ""
    try:
        s["updatedAt"] = int(s["updatedAt"] or 0)
    except (TypeError, ValueError):
        s["updatedAt"] = 0
    return s


def clean_routing(data):
    r = _merge(ROUTING_DEFAULTS, data)
    for k in ("directDomains", "proxyDomains", "blockDomains", "directIPs"):
        r[k] = _as_list(r[k])
    r["blockAds"] = bool(r["blockAds"])
    return r


def clean_settings(data):
    s = _merge(SETTINGS_DEFAULTS, data)
    try:
        s["probeInterval"] = max(5, int(s["probeInterval"]))
        s["tspuInterval"] = max(10, int(s["tspuInterval"]))
    except (TypeError, ValueError):
        raise ValidationError("Интервалы должны быть числами")
    if s["logLevel"] not in ("debug", "info", "warning", "error"):
        raise ValidationError("Неизвестный уровень журнала")
    s["dns"] = _as_list(s["dns"]) or list(SETTINGS_DEFAULTS["dns"])
    s["dnsDirect"] = _as_list(s["dnsDirect"])
    s["subProxyHosts"] = _as_list(s["subProxyHosts"])
    s["dnsGroup"] = str(s["dnsGroup"] or "")
    try:
        s["dnsPort"] = int(s["dnsPort"] or 0)
    except (TypeError, ValueError):
        raise ValidationError("Порт DNS должен быть числом")
    if not 0 <= s["dnsPort"] <= 65535:
        raise ValidationError("Порт DNS вне диапазона 0–65535")
    return s


class Store:
    def __init__(self, data_dir):
        self.path = os.path.join(data_dir, "state.json")
        self.state = {"nodes": [], "groups": [], "subscriptions": [],
                      "routing": clean_routing({}), "settings": clean_settings({})}
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                self.replace(json.load(f), save=False)
        else:
            self.save()

    # --- доступ -----------------------------------------------------------
    @property
    def nodes(self):
        return self.state["nodes"]

    @property
    def groups(self):
        return self.state["groups"]

    def node(self, nid):
        return next((n for n in self.nodes if n["id"] == nid), None)

    def group(self, gid):
        return next((g for g in self.groups if g["id"] == gid), None)

    @property
    def subscriptions(self):
        return self.state["subscriptions"]

    def subscription(self, sid):
        return next((s for s in self.subscriptions if s["id"] == sid), None)

    def subscription_by_url(self, url):
        return next((s for s in self.subscriptions if s["url"] == url), None)

    def snapshot(self):
        return copy.deepcopy(self.state)

    def restore(self, snap):
        self.state = snap

    def save(self):
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)

    # --- целиком (импорт бэкапа) -------------------------------------------
    def replace(self, data, save=True):
        nodes, ids = [], set()
        for raw in data.get("nodes", []):
            nid = raw.get("id") or new_id("n", ids)
            nodes.append(clean_node(raw, nid))
            ids.add(nid)
        groups, gids, ports = [], set(), set()
        for raw in data.get("groups", []):
            gid = raw.get("id") or new_id("g", gids)
            g = clean_group(raw, gid, ids)
            if g["port"] in ports:
                raise ValidationError(f"Порт {g['port']} занят другой группой")
            ports.add(g["port"])
            groups.append(g)
            gids.add(gid)
        subs, sids = [], set()
        for raw in data.get("subscriptions", []):
            sid = raw.get("id") or new_id("s", sids)
            subs.append(clean_subscription(raw, sid, gids))
            sids.add(sid)
        self.state = {"nodes": nodes, "groups": groups, "subscriptions": subs,
                      "routing": clean_routing(data.get("routing", {})),
                      "settings": clean_settings(data.get("settings", {}))}
        if save:
            self.save()

    # --- узлы ----------------------------------------------------------------
    def add_node(self, data):
        n = clean_node(data, new_id("n", {x["id"] for x in self.nodes}))
        self.nodes.append(n)
        return n

    def update_node(self, nid, data):
        old = self.node(nid)
        if not old:
            raise KeyError(nid)
        n = clean_node({**old, **data}, nid)
        self.nodes[self.nodes.index(old)] = n
        return n

    def delete_node(self, nid):
        self.state["nodes"] = [n for n in self.nodes if n["id"] != nid]
        for g in self.groups:
            g["nodes"] = [x for x in g["nodes"] if x != nid]
            if g["pinned"] == nid:
                g["pinned"] = None

    # --- подписки ------------------------------------------------------------
    def add_subscription(self, data):
        s = clean_subscription(data, data.get("id") or new_id("s", {x["id"] for x in self.subscriptions}),
                               {g["id"] for g in self.groups})
        if self.subscription_by_url(s["url"]):
            raise ValidationError("Эта подписка уже добавлена")
        self.subscriptions.append(s)
        return s

    def update_subscription(self, sid, data):
        old = self.subscription(sid)
        if not old:
            raise KeyError(sid)
        s = clean_subscription({**old, **data}, sid, {g["id"] for g in self.groups})
        self.subscriptions[self.subscriptions.index(old)] = s
        return s

    def delete_subscription(self, sid, with_nodes=False):
        self.state["subscriptions"] = [s for s in self.subscriptions if s["id"] != sid]
        if with_nodes:
            for n in [x for x in self.nodes if x.get("sub") == sid]:
                self.delete_node(n["id"])

    def reorder(self, key, ids):
        items = self.state[key]
        pos = {i: k for k, i in enumerate(ids)}
        items.sort(key=lambda x: pos.get(x["id"], len(ids)))

    # --- группы --------------------------------------------------------------
    def _check_port(self, g):
        for other in self.groups:
            if other["id"] != g["id"] and other["port"] == g["port"]:
                raise ValidationError(f"Порт {g['port']} уже занят группой «{other['name']}»")

    def add_group(self, data):
        g = clean_group(data, new_id("g", {x["id"] for x in self.groups}),
                        {n["id"] for n in self.nodes})
        self._check_port(g)
        self.groups.append(g)
        return g

    def update_group(self, gid, data):
        old = self.group(gid)
        if not old:
            raise KeyError(gid)
        g = clean_group({**old, **data}, gid, {n["id"] for n in self.nodes})
        self._check_port(g)
        self.groups[self.groups.index(old)] = g
        return old, g

    def delete_group(self, gid):
        self.state["groups"] = [g for g in self.groups if g["id"] != gid]
        for s in self.subscriptions:
            if s["group"] == gid:
                s["group"] = ""
