"""Генерация config.json для xray-core из состояния панели.

Теги: outbound узла = id узла (n…), inbound группы = id группы (g…),
балансировщик группы = b-<gid>, тестовый inbound узла = t-<nid> (127.0.0.1, http).
"""

API_PORT = 10085
METRICS_PORT = 10086
TEST_PORT_BASE = 20100
DNS_TAG = "dns-int"  # запросы встроенного DNS
DNS_IN = "dns-in"  # DNS-сервер для локальной сети


def _split(s):
    return [x.strip() for x in str(s or "").split(",") if x.strip()]


def node_outbound(n):
    if n.get("raw"):
        ob = dict(n["raw"])
        ob["tag"] = n["id"]
        return ob
    p, addr, port = n["protocol"], n["address"], n["port"]
    if p == "vless":
        user = {"id": n["uuid"], "encryption": n["encryption"] or "none"}
        if n["flow"]:
            user["flow"] = n["flow"]
        settings = {"vnext": [{"address": addr, "port": port, "users": [user]}]}
    elif p == "vmess":
        settings = {"vnext": [{"address": addr, "port": port, "users": [
            {"id": n["uuid"], "alterId": n["alterId"], "security": n["encryption"] if n["encryption"] not in ("", "none") else "auto"}]}]}
    elif p == "trojan":
        settings = {"servers": [{"address": addr, "port": port, "password": n["password"]}]}
    elif p == "shadowsocks":
        settings = {"servers": [{"address": addr, "port": port, "method": n["method"] or "aes-128-gcm",
                                 "password": n["password"]}]}
    else:  # socks / http
        srv = {"address": addr, "port": port}
        if n["username"]:
            srv["users"] = [{"user": n["username"], "pass": n["password"]}]
        settings = {"servers": [srv]}

    ob = {"tag": n["id"], "protocol": p, "settings": settings}
    if p in ("socks", "http") and n["security"] == "none" and n["network"] == "tcp":
        return ob

    st = {"network": n["network"], "security": n["security"]}
    if n["security"] == "tls":
        tls = {"serverName": n["sni"] or (n["host"] or addr)}
        if n["fingerprint"]:
            tls["fingerprint"] = n["fingerprint"]
        if _split(n["alpn"]):
            tls["alpn"] = _split(n["alpn"])
        if n["allowInsecure"]:
            tls["allowInsecure"] = True
        st["tlsSettings"] = tls
    elif n["security"] == "reality":
        st["realitySettings"] = {
            "serverName": n["sni"], "fingerprint": n["fingerprint"] or "chrome",
            "publicKey": n["publicKey"], "shortId": n["shortId"], "spiderX": n["spiderX"] or "",
        }
    net = n["network"]
    if net == "ws":
        st["wsSettings"] = {"path": n["path"] or "/", "host": n["host"]}
    elif net == "httpupgrade":
        st["httpupgradeSettings"] = {"path": n["path"] or "/", "host": n["host"]}
    elif net == "xhttp":
        xs = {"path": n["path"] or "/", "host": n["host"]}
        if n["mode"]:
            xs["mode"] = n["mode"]
        st["xhttpSettings"] = xs
    elif net == "grpc":
        st["grpcSettings"] = {"serviceName": n["serviceName"]}
    ob["streamSettings"] = st
    return ob


def _inbound(tag, listen, port, udp, username="", password="", protocol="socks"):
    settings = {"udp": udp} if protocol == "socks" else {}
    if username:
        settings["auth"] = "password"
        settings["accounts"] = [{"user": username, "pass": password}]
    elif protocol == "socks":
        settings["auth"] = "noauth"
    return {
        "tag": tag, "listen": listen, "port": port, "protocol": protocol, "settings": settings,
        "sniffing": {"enabled": True, "destOverride": ["http", "tls", "quic"], "routeOnly": True},
    }


def _domains(items):
    """Строки пользователя → матчеры xray (голый домен = domain:)."""
    out = []
    for d in items:
        if ":" in d or d.startswith("regexp"):
            out.append(d)
        else:
            out.append("domain:" + d.lstrip("."))
    return out


def _dns_host(server):
    """Адрес DNS-сервера xray (8.8.8.8, tcp://1.1.1.1:53, https://dns.google/dns-query) → хост."""
    host = server.split("://", 1)[-1].split("/", 1)[0]
    if host.startswith("["):
        return host[1:].split("]", 1)[0]
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def _dns_rule(servers, target):
    """Правило для запросов встроенного DNS (inbound dns-int) к указанным серверам."""
    ips, domains = [], []
    for srv in servers:
        host = _dns_host(srv)
        if host.replace(".", "").isdigit() or ":" in host:
            ips.append(host)
        else:
            domains.append("full:" + host)
    out = []
    if ips:
        out.append({"inboundTag": [DNS_TAG], "ip": ips, **target})
    if domains:
        out.append({"inboundTag": [DNS_TAG], "domain": domains, **target})
    return out


def build(state):
    """Возвращает (config, meta). meta.test_ports: {nid: port}."""
    settings, routing = state["settings"], state["routing"]
    nodes = [n for n in state["nodes"] if n["enabled"]]
    alive_ids = {n["id"] for n in nodes}
    groups = [g for g in state["groups"] if g["enabled"]]

    inbounds, rules, balancers = [], [], []
    test_ports = {}
    rules.append({"inboundTag": ["api"], "outboundTag": "api"})

    for i, n in enumerate(state["nodes"]):
        if n["id"] not in alive_ids:
            continue
        port = TEST_PORT_BASE + i
        test_ports[n["id"]] = port
        inbounds.append({"tag": "t-" + n["id"], "listen": "127.0.0.1", "port": port,
                         "protocol": "http", "settings": {}})
        rules.append({"inboundTag": ["t-" + n["id"]], "outboundTag": n["id"]})

    targets = {}  # gid -> {"balancerTag": ...} | {"outboundTag": ...}
    for g in groups:
        inbounds.append(_inbound(g["id"], g["listen"], g["port"], g["udp"], g["username"], g["password"]))
        members = [nid for nid in g["nodes"] if nid in alive_ids]
        if members:
            strategy = {"type": "leastPing"} if g["strategy"] == "leastPing" else {"type": "random"}
            balancers.append({"tag": "b-" + g["id"], "selector": members, "strategy": strategy,
                              "fallbackTag": g["fallback"]})
            targets[g["id"]] = {"balancerTag": "b-" + g["id"]}
        else:
            targets[g["id"]] = {"outboundTag": g["fallback"]}

    # DNS: локальный сервер → встроенный DNS; его запросы — российские напрямую, остальные через группу
    dns_servers = list(settings["dns"])
    if settings["dnsDirect"]:
        dns_servers = [{"address": a, "domains": ["geosite:category-ru"], "skipFallback": True}
                       for a in settings["dnsDirect"]] + dns_servers
        rules.extend(_dns_rule(settings["dnsDirect"], {"outboundTag": "direct"}))
    rules.extend(_dns_rule(settings["dns"], targets.get(settings["dnsGroup"], {"outboundTag": "direct"})))
    if settings["dnsPort"]:
        inbounds.append({"tag": DNS_IN, "listen": "0.0.0.0", "port": settings["dnsPort"],
                         "protocol": "dokodemo-door",
                         "settings": {"address": "1.1.1.1", "port": 53, "network": "tcp,udp"}})
        rules.insert(1, {"inboundTag": [DNS_IN], "outboundTag": "dns-out"})

    # глобальные списки — выше гео-правил
    block = _domains(routing["blockDomains"])
    if routing["blockAds"]:
        block.append("geosite:category-ads-all")
    if block:
        rules.append({"domain": block, "outboundTag": "block"})
    if routing["directDomains"]:
        rules.append({"domain": _domains(routing["directDomains"]), "outboundTag": "direct"})
    if routing["directIPs"]:
        rules.append({"ip": routing["directIPs"], "outboundTag": "direct"})
    rules.append({"ip": ["geoip:private"], "outboundTag": "direct"})
    if routing["proxyDomains"]:
        for g in groups:
            rules.append({"inboundTag": [g["id"]], "domain": _domains(routing["proxyDomains"]), **targets[g["id"]]})

    geo_groups = [g["id"] for g in groups if g["routing"] == "geo"]
    if geo_groups:
        rules.append({"inboundTag": geo_groups, "domain": ["geosite:category-ru"], "outboundTag": "direct"})
        rules.append({"inboundTag": geo_groups, "ip": ["geoip:ru"], "outboundTag": "direct"})
    for g in groups:
        rules.append({"inboundTag": [g["id"]], **targets[g["id"]]})

    inbounds.insert(0, {"tag": "api", "listen": "127.0.0.1", "port": API_PORT,
                        "protocol": "dokodemo-door", "settings": {"address": "127.0.0.1"}})

    config = {
        "log": {"loglevel": settings["logLevel"], "access": "", "dnsLog": False},
        "api": {"tag": "api", "services": ["HandlerService", "RoutingService", "StatsService", "LoggerService"]},
        "metrics": {"tag": "metrics", "listen": f"127.0.0.1:{METRICS_PORT}"},
        "stats": {},
        "policy": {
            "levels": {"0": {"handshake": 8, "connIdle": 300}},
            "system": {"statsInboundUplink": True, "statsInboundDownlink": True,
                       "statsOutboundUplink": True, "statsOutboundDownlink": True},
        },
        "dns": {"servers": dns_servers, "queryStrategy": "UseIPv4", "tag": DNS_TAG},
        "inbounds": inbounds,
        "outbounds": [{"tag": "direct", "protocol": "freedom", "settings": {},
                       "streamSettings": {"sockopt": {"domainStrategy": "UseIPv4"}}},
                      {"tag": "block", "protocol": "blackhole"},
                      {"tag": "dns-out", "protocol": "dns", "settings": {"nonIPQuery": "skip"}}]
                     + [node_outbound(n) for n in nodes],
        "routing": {"domainStrategy": "IPIfNonMatch", "balancers": balancers, "rules": rules},
    }
    if nodes:
        config["observatory"] = {
            "subjectSelector": sorted(alive_ids),
            "probeURL": settings["probeURL"],
            "probeInterval": f"{settings['probeInterval']}s",
            "enableConcurrency": True,
        }
    return config, {"test_ports": test_ports}
