"""Разбор и сборка ссылок vless:// vmess:// trojan:// ss:// и подписок."""
import base64
import json
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit


def _b64decode(s):
    s = s.strip().replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return base64.b64decode(s).decode("utf-8", "replace")


def _q(qs, *keys, default=""):
    for k in keys:
        if k in qs and qs[k]:
            return qs[k][0]
    return default


def _common(qs, n):
    n["network"] = {"raw": "tcp", "http": "tcp", "h2": "tcp", "splithttp": "xhttp"}.get(
        _q(qs, "type", default="tcp"), _q(qs, "type", default="tcp"))
    n["security"] = _q(qs, "security", default=n.get("security", "none")) or "none"
    if n["security"] == "xtls":
        n["security"] = "tls"
    n["sni"] = _q(qs, "sni", "peer")
    n["fingerprint"] = _q(qs, "fp", default="chrome")
    n["alpn"] = _q(qs, "alpn")
    n["allowInsecure"] = _q(qs, "allowInsecure", "insecure") in ("1", "true")
    n["publicKey"] = _q(qs, "pbk")
    n["shortId"] = _q(qs, "sid")
    n["spiderX"] = _q(qs, "spx")
    n["path"] = _q(qs, "path")
    n["host"] = _q(qs, "host")
    n["serviceName"] = _q(qs, "serviceName")
    n["mode"] = _q(qs, "mode")
    return n


def parse_link(link):
    link = link.strip()
    scheme = link.split("://", 1)[0].lower()
    if scheme == "vmess":
        j = json.loads(_b64decode(link[8:]))
        tls = j.get("tls") or "none"
        return {
            "name": j.get("ps", ""), "protocol": "vmess", "address": j.get("add", ""),
            "port": int(j.get("port") or 443), "uuid": j.get("id", ""), "alterId": int(j.get("aid") or 0),
            "encryption": j.get("scy") or "auto", "network": j.get("net") or "tcp",
            "security": "tls" if tls == "tls" else "none", "sni": j.get("sni", ""),
            "fingerprint": j.get("fp") or "chrome", "alpn": j.get("alpn", ""),
            "path": j.get("path", ""), "host": j.get("host", ""),
            "serviceName": j.get("path", "") if j.get("net") == "grpc" else "",
        }
    u = urlsplit(link)
    name = unquote(u.fragment or "")
    qs = parse_qs(u.query)
    if scheme == "vless":
        n = {"name": name, "protocol": "vless", "address": u.hostname, "port": u.port or 443,
             "uuid": unquote(u.username or ""), "flow": _q(qs, "flow"),
             "encryption": _q(qs, "encryption", default="none")}
        return _common(qs, n)
    if scheme == "trojan":
        n = {"name": name, "protocol": "trojan", "address": u.hostname, "port": u.port or 443,
             "password": unquote(u.username or ""), "security": "tls"}
        n = _common(qs, n)
        if not _q(qs, "security"):
            n["security"] = "tls"
        return n
    if scheme == "ss":
        body = link[5:].split("#", 1)[0]
        if "@" in body:
            userinfo, hostport = body.rsplit("@", 1)
            userinfo = unquote(userinfo)
            if ":" not in userinfo:
                userinfo = _b64decode(userinfo)
        else:
            dec = _b64decode(body.split("?", 1)[0])
            userinfo, hostport = dec.rsplit("@", 1)
        method, password = userinfo.split(":", 1)
        hostport = hostport.split("?", 1)[0].split("/", 1)[0]
        host, port = hostport.rsplit(":", 1)
        return {"name": name, "protocol": "shadowsocks", "address": host.strip("[]"),
                "port": int(port), "method": method, "password": password}
    if scheme in ("socks", "socks5", "http", "https"):
        return {"name": name, "protocol": "socks" if scheme.startswith("socks") else "http",
                "address": u.hostname, "port": u.port or 1080,
                "username": unquote(u.username or ""), "password": unquote(u.password or ""),
                "security": "tls" if scheme == "https" else "none"}
    raise ValueError(f"неизвестная схема {scheme}://")


def parse_text(text):
    """Текст со ссылками (или base64-подписка) → (узлы, ошибки)."""
    text = text.strip()
    if text and "://" not in text:
        try:
            text = _b64decode(text)
        except Exception:
            pass
    nodes, errors = [], []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            n = parse_link(line)
            if not n.get("address"):
                raise ValueError("нет адреса")
            nodes.append(n)
        except Exception as e:
            errors.append(f"{line[:60]}…: {e}")
    return nodes, errors


def build_link(n):
    if n.get("raw"):
        return ""
    p = n["protocol"]
    tag = quote(n["name"])
    host = f"[{n['address']}]" if ":" in n["address"] else n["address"]
    if p == "vmess":
        j = {"v": "2", "ps": n["name"], "add": n["address"], "port": str(n["port"]), "id": n["uuid"],
             "aid": str(n["alterId"]), "scy": n["encryption"] if n["encryption"] != "none" else "auto",
             "net": n["network"], "type": "none", "host": n["host"],
             "path": n["serviceName"] if n["network"] == "grpc" else n["path"],
             "tls": "tls" if n["security"] == "tls" else "", "sni": n["sni"], "alpn": n["alpn"],
             "fp": n["fingerprint"]}
        return "vmess://" + base64.b64encode(json.dumps(j, ensure_ascii=False).encode()).decode()
    if p == "shadowsocks":
        ui = base64.urlsafe_b64encode(f"{n['method']}:{n['password']}".encode()).decode().rstrip("=")
        return f"ss://{ui}@{host}:{n['port']}#{tag}"
    if p in ("socks", "http"):
        auth = f"{quote(n['username'])}:{quote(n['password'])}@" if n["username"] else ""
        return f"{p}://{auth}{host}:{n['port']}#{tag}"
    q = {"type": n["network"], "security": n["security"]}
    if p == "vless":
        q["encryption"] = n["encryption"] or "none"
        if n["flow"]:
            q["flow"] = n["flow"]
    for k, v in (("sni", n["sni"]), ("fp", n["fingerprint"]), ("alpn", n["alpn"]),
                 ("pbk", n["publicKey"]), ("sid", n["shortId"]), ("spx", n["spiderX"]),
                 ("path", n["path"]), ("host", n["host"]), ("serviceName", n["serviceName"]),
                 ("mode", n["mode"])):
        if v:
            q[k] = v
    if n["allowInsecure"]:
        q["allowInsecure"] = "1"
    secret = quote(n["uuid"] if p == "vless" else n["password"], safe="")
    return f"{p}://{secret}@{host}:{n['port']}?{urlencode(q, quote_via=quote)}#{tag}"
