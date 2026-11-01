"""Ядро панели: применение конфига, мониторинг, приоритеты, трафик, события, ТСПУ."""
import asyncio
import collections
import json
import os
import socket
import time
from urllib.parse import urlsplit

import httpx

from . import links, xraygen
from .store import Store, ValidationError, clean_node
from .xray import Xray

SAMPLE = 5            # шаг истории трафика, с
HISTORY = 720         # точек истории (1 час)
CHEBURCHECK = "https://cheburcheck.ru/api/v1/check"

# поля узла, которые обновляются из подписки при сверке (id, enabled, note, sub, ключи — не трогаем)
_SUB_SYNC = ("name", "network", "security", "sni", "fingerprint", "alpn", "allowInsecure",
             "publicKey", "shortId", "spiderX", "path", "host", "serviceName", "mode",
             "encryption", "flow", "alterId", "method")


def _sub_key(n):
    """Ключ узла для сверки подписки: протокол + адрес + порт + секрет."""
    return (n["protocol"], n["address"], int(n["port"]),
            n.get("uuid") or n.get("password") or n.get("username") or "")


def _sub_net_hint(e):
    """Человеческое объяснение сетевой ошибки при скачивании подписки."""
    s = (str(e) or repr(e) or "").lower().replace("_", " ")
    if isinstance(e, httpx.TimeoutException) or "timed out" in s:
        return "сервер подписки не ответил (таймаут)"
    if "unexpected eof" in s or "eof while reading" in s or "eof occurred" in s:
        return "TLS-соединение обрывается при рукопожатии (похоже на блокировку ТСПУ)"
    if "certificate verify" in s or ("certificate" in s and "eof" not in s):
        return "ошибка TLS-сертификата сервера"
    if ("name or service not known" in s or "nodename" in s or "no address associated" in s
            or "name resolution" in s):
        return "имя сервера не разрешается в IP (DNS)"
    if "refused" in s:
        return "соединение отклонено (порт закрыт)"
    if "unreachable" in s:
        return "сеть недостижима"
    if "reset" in s:
        return "соединение сброшено"
    if "connect" in s:
        return "не удалось установить соединение"
    return (str(e) or e.__class__.__name__)[:200]


def _sub_body_kind(text):
    """Что сервер отдал вместо подписки (или None, если похоже на правду)."""
    body = (text or "").strip()
    if not body:
        return "пустой ответ"
    low = body.lower()
    if low.startswith(("<!doctype", "<html")) or "<html" in low[:300]:
        return "HTML-страница вместо подписки (страница входа, ошибка или подписка истекла)"
    if "proxies:" in low[:2000]:
        return "конфиг Clash — панель понимает ссылки vless://…, vmess://… и base64"
    return None


def _sub_head(text, n=120):
    return " ".join((text or "").strip()[:n].split())


def _sub_text_hint(text):
    kind = _sub_body_kind(text)
    head = _sub_head(text)
    if kind:
        return f"{kind}. Начало ответа: «{head}»"
    return f"Начало ответа сервера: «{head}»"


def _sub_host(url):
    """Имя хоста из ссылки подписки (нижний регистр) или None."""
    try:
        return (urlsplit(url).hostname or "").lower() or None
    except ValueError:
        return None


def _host_in_list(host, hosts):
    """host совпадает с записью или является её поддоменом (example.com покрывает sub.example.com)."""
    return any(host == h or host.endswith("." + h) for h in hosts)


class ApplyError(Exception):
    def __init__(self, message, detail=""):
        super().__init__(message)
        self.detail = detail


class Panel:
    def __init__(self, data_dir, xray_bin, asset_dir):
        self.data_dir = data_dir
        self.asset_dir = asset_dir
        self.store = Store(data_dir)
        self.xray = Xray(xray_bin, data_dir, asset_dir, self.event)
        self.xray.line_listeners.append(self._on_line)
        self.lock = asyncio.Lock()
        self.events = collections.deque(maxlen=300)
        self.meta = {"test_ports": {}}
        # мониторинг
        self.observatory = {}
        self.node_rates = {}          # tag -> (up/s, down/s)
        self.group_rates = {}
        self.total_rate = (0, 0)
        self._prev_stats = None
        self._prev_ts = 0
        self.overrides = {}           # gid -> применённое переопределение балансировщика
        self.active = {}              # gid -> tag | None
        self.prev_alive = {}
        self.delay_hist = collections.defaultdict(lambda: collections.deque(maxlen=48))  # tag -> задержки проверок
        self._last_try = {}
        # трафик
        self.hist_total = collections.deque(maxlen=HISTORY)
        self.hist_nodes = collections.defaultdict(lambda: collections.deque(maxlen=HISTORY))
        self._acc = collections.defaultdict(lambda: [0, 0])   # байты за текущий шаг истории
        self._acc_total = [0, 0]
        self._acc_ts = time.time()
        self.totals = collections.defaultdict(lambda: {"up": 0, "down": 0})
        self.days = self._load_json("traffic.json", {})
        # подключения
        self.recent = collections.deque(maxlen=200)
        self.clients = {}
        self.domains = {}
        # ТСПУ
        self.tspu = self._load_json("tspu.json", {})

    # --- служебное -----------------------------------------------------------
    def _load_json(self, name, default):
        try:
            with open(os.path.join(self.data_dir, name), encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return default

    def _save_json(self, name, data):
        path = os.path.join(self.data_dir, name)
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(path + ".tmp", path)

    def event(self, level, text):
        self.events.appendleft({"ts": time.time(), "level": level, "text": text})

    def tag_name(self, tag):
        if tag in ("direct", "block"):
            return {"direct": "напрямую", "block": "блокировка"}[tag]
        n = self.store.node(tag)
        return n["name"] if n else tag

    # --- применение ----------------------------------------------------------
    async def start(self):
        await self.xray.detect_version()
        config, self.meta = xraygen.build(self.store.state)
        ok, out = await self.xray.test_config(config)
        if not ok:
            self.event("error", "Сохранённый конфиг не прошёл проверку xray: " + out[-300:])
        self.xray.write_config(config)
        await self.xray.start()
        self.event("info", f"Панель запущена, xray {self.xray.version}")
        asyncio.create_task(self._monitor_loop())
        asyncio.create_task(self._tspu_loop())
        asyncio.create_task(self._persist_loop())

    async def apply(self, mutate, restart=True):
        """Изменить состояние, проверить конфиг xray, сохранить и перезапустить.

        При ошибке состояние откатывается и бросается ApplyError.
        """
        async with self.lock:
            snap = self.store.snapshot()
            try:
                result = mutate()
                config, meta = xraygen.build(self.store.state)
                ok, out = await self.xray.test_config(config)
                if not ok:
                    raise ApplyError("xray отклонил конфигурацию", out)
            except (ValidationError, ApplyError, KeyError) as e:
                self.store.restore(snap)
                if isinstance(e, KeyError):
                    raise ApplyError("Объект не найден")
                if isinstance(e, ValidationError):
                    raise ApplyError(str(e))
                raise
            self.store.save()
            self.meta = meta
            self.xray.write_config(config)
            if restart:
                await self.xray.restart()
                self.overrides.clear()
                self._prev_stats = None
            await self._apply_overrides()
            return result

    async def restart_xray(self):
        async with self.lock:
            await self.xray.restart()
            self.overrides.clear()
            self._prev_stats = None
        self.event("info", "xray перезапущен вручную")

    # --- приоритеты / закрепление ----------------------------------------------
    def _alive(self, tag):
        o = self.observatory.get(tag)
        if o is None:
            return None
        return bool(o.get("alive"))

    def _decide(self, g):
        """Куда должен идти трафик группы: (override_target|None, active_tag|None)."""
        members = [nid for nid in g["nodes"] if (self.store.node(nid) or {}).get("enabled")]
        if not members:
            return None, g["fallback"]
        if g["pinned"]:
            return g["pinned"], g["pinned"]
        if g["strategy"] == "priority":
            for nid in members:
                if self._alive(nid) is not False:     # жив или ещё не проверен
                    return nid, nid
            return g["fallback"], g["fallback"]
        alive = [nid for nid in members if self._alive(nid)]
        if not alive:
            return None, g["fallback"]
        if g["strategy"] == "leastPing":
            return None, min(alive, key=lambda t: self.observatory[t].get("delay", 1e9))
        return None, None   # random — конкретный узел не определён

    async def _apply_overrides(self):
        if not self.xray.running:
            return
        for g in self.store.groups:
            if not g["enabled"]:
                continue
            target, active = self._decide(g)
            old_active = self.active.get(g["id"], "-")
            self.active[g["id"]] = active
            if old_active not in ("-", active) and active is not None:
                level = "info" if g["nodes"] and active == g["nodes"][0] else "warn"
                self.event(level, f"{g['name']}: {self.tag_name(old_active) if old_active else '—'} → {self.tag_name(active)}")
            has_balancer = any(nid for nid in g["nodes"] if (self.store.node(nid) or {}).get("enabled"))
            if not has_balancer or self.overrides.get(g["id"], "-") == target:
                continue
            ok, out = await self.xray.override("b-" + g["id"], target)
            if ok:
                self.overrides[g["id"]] = target
            elif self.xray.running and time.time() - self.xray.started_at > 5:
                self.event("error", f"{g['name']}: не удалось переключить балансировщик: {out.strip()[:200]}")

    async def pin(self, gid, node):
        g = self.store.group(gid)
        if not g:
            raise ApplyError("Группа не найдена")
        if node not in (None, "direct", "block") and node not in g["nodes"]:
            raise ApplyError("Узел не входит в группу")
        async with self.lock:
            g["pinned"] = node
            self.store.save()
            await self._apply_overrides()
        self.event("info", f"{g['name']}: " + (f"закреплён «{self.tag_name(node)}»" if node else "автоматический выбор"))

    # --- мониторинг ----------------------------------------------------------
    async def _monitor_loop(self):
        while True:
            try:
                await self._tick()
            except Exception as e:                       # не роняем цикл
                if self.xray.running and time.time() - self.xray.started_at > 10:
                    self.event("warn", f"мониторинг: {e}")
            await asyncio.sleep(2)

    async def _tick(self):
        if not self.xray.running:
            return
        obs, stats = await asyncio.to_thread(self.xray.metrics)
        self.observatory = obs
        now = time.time()
        for tag, o in obs.items():
            alive = bool(o.get("alive"))
            prev = self.prev_alive.get(tag)
            if prev is not None and prev != alive and self.store.node(tag):
                if alive:
                    self.event("info", f"узел «{self.tag_name(tag)}» снова доступен ({o.get('delay')} мс)")
                else:
                    reason = (o.get("last_error_reason") or "").split(">")[-1].strip()[:160]
                    self.event("error", f"узел «{self.tag_name(tag)}» недоступен: {reason}")
            self.prev_alive[tag] = alive
            tried = o.get("last_try_time")
            if tried and tried != self._last_try.get(tag):
                self._last_try[tag] = tried
                self.delay_hist[tag].append(o.get("delay") if alive else None)
        self._account(stats, now)
        await self._apply_overrides()

    def _account(self, stats, now):
        cur = {"outbound": {k: (v.get("uplink", 0), v.get("downlink", 0)) for k, v in stats.get("outbound", {}).items()},
               "inbound": {k: (v.get("uplink", 0), v.get("downlink", 0)) for k, v in stats.get("inbound", {}).items()}}
        prev, dt = self._prev_stats, now - self._prev_ts
        self._prev_stats, self._prev_ts = cur, now
        if prev is None or dt <= 0:
            return
        today = time.strftime("%Y-%m-%d")
        day = self.days.setdefault(today, {})
        tot_up = tot_down = 0
        rates = {}
        for tag, (u, d) in cur["outbound"].items():
            pu, pd = prev["outbound"].get(tag, (0, 0))
            du, dd = max(0, u - pu), max(0, d - pd)
            rates[tag] = (du / dt, dd / dt)
            if tag in ("block", "api") or tag.startswith("t-"):
                continue
            tot_up += du
            tot_down += dd
            if du or dd:
                self.totals[tag]["up"] += du
                self.totals[tag]["down"] += dd
                rec = day.setdefault(tag, {"up": 0, "down": 0})
                rec["up"] += du
                rec["down"] += dd
                self._acc[tag][0] += du
                self._acc[tag][1] += dd
        self.node_rates = rates
        self.group_rates = {}
        for tag, (u, d) in cur["inbound"].items():
            pu, pd = prev["inbound"].get(tag, (0, 0))
            self.group_rates[tag] = (max(0, u - pu) / dt, max(0, d - pd) / dt)
        self.total_rate = (tot_up / dt, tot_down / dt)
        self._acc_total[0] += tot_up
        self._acc_total[1] += tot_down
        span = now - self._acc_ts
        if span >= SAMPLE:
            ts = int(now)
            self.hist_total.append([ts, round(self._acc_total[0] / span), round(self._acc_total[1] / span)])
            keys = set(self.hist_nodes) | set(self._acc)
            for tag in keys:
                u, d = self._acc.get(tag, (0, 0))
                self.hist_nodes[tag].append([ts, round(u / span), round(d / span)])
            self._acc.clear()
            self._acc_total = [0, 0]
            self._acc_ts = now

    async def _persist_loop(self):
        while True:
            await asyncio.sleep(60)
            keep = sorted(self.days)[-31:]
            self.days = {k: self.days[k] for k in keep}
            self._save_json("traffic.json", self.days)

    # --- журнал подключений --------------------------------------------------
    def _on_line(self, item, acc):
        if not acc:
            return
        inb = acc.group("inb")
        if inb in ("api",) or inb.startswith("t-"):
            return
        dest = acc.group("dest")
        host = dest.rsplit(":", 1)[0]
        out = acc.group("out")
        g = self.store.group(inb)
        rec = {"ts": item["ts"], "src": acc.group("src").strip("[]"), "dest": dest,
               "net": acc.group("net"), "inbound": g["name"] if g else inb,
               "route": self.tag_name(out) if acc.group("verdict") == "accepted" else "отклонено",
               "routeTag": out}
        self.recent.appendleft(rec)
        c = self.clients.setdefault(rec["src"], {"ip": rec["src"], "count": 0, "lastSeen": 0})
        c["count"] += 1
        c["lastSeen"] = item["ts"]
        d = self.domains.setdefault(host, {"domain": host, "count": 0, "route": "", "lastSeen": 0})
        d["count"] += 1
        d["route"] = rec["route"]
        d["lastSeen"] = item["ts"]
        if len(self.domains) > 3000:
            for k in sorted(self.domains, key=lambda k: self.domains[k]["lastSeen"])[:1000]:
                del self.domains[k]

    def connections(self):
        return {
            "recent": list(self.recent),
            "clients": sorted(self.clients.values(), key=lambda c: -c["lastSeen"])[:100],
            "domains": sorted(self.domains.values(), key=lambda d: -d["count"])[:100],
        }

    # --- статус --------------------------------------------------------------
    def status(self):
        x = self.xray
        groups = []
        for g in self.store.groups:
            active = self.active.get(g["id"]) if g["enabled"] else None
            members = [nid for nid in g["nodes"] if (self.store.node(nid) or {}).get("enabled")]
            if not g["enabled"]:
                state = "disabled"
            elif not x.running:
                state = "down"
            elif active == "block" or (active is None and g["strategy"] != "random"):
                state = "down"
            elif active == "direct":
                state = "down" if g["fallback"] == "block" else "degraded"
            elif g["strategy"] == "priority" and members and active != members[0] and not g["pinned"]:
                state = "degraded"
            elif g["strategy"] == "random" and not any(self._alive(n) for n in members):
                state = "degraded" if g["fallback"] == "direct" else "down"
            else:
                state = "ok"
            if active:
                active_name = self.tag_name(active)
            elif g["strategy"] == "random":
                active_name = f"случайный из {sum(1 for n in members if self._alive(n))} живых"
            else:
                active_name = "—"
            ru, rd = self.group_rates.get(g["id"], (0, 0))
            groups.append({k: g[k] for k in ("id", "name", "port", "enabled", "strategy", "fallback", "pinned", "routing")}
                          | {"active": active, "activeName": active_name, "state": state,
                             "upRate": round(ru), "downRate": round(rd)})
        nodes = {}
        for n in self.store.nodes:
            o = self.observatory.get(n["id"])
            ru, rd = self.node_rates.get(n["id"], (0, 0))
            t = self.totals.get(n["id"], {"up": 0, "down": 0})
            nodes[n["id"]] = {
                "alive": (bool(o.get("alive")) if o else None) if n["enabled"] else False,
                "delay": (o or {}).get("delay") if (o or {}).get("alive") else None,
                "lastError": "" if not o or o.get("alive") else _short_reason(o.get("last_error_reason", "")),
                "lastSeen": (o or {}).get("last_seen_time"), "lastTry": (o or {}).get("last_try_time"),
                "upRate": round(ru), "downRate": round(rd), "up": t["up"], "down": t["down"],
                "tspu": self.tspu.get(n["address"]) if not n.get("raw") else None,
                "delayHist": list(self.delay_hist.get(n["id"], ())),
            }
        return {
            "xray": {"running": x.running, "version": x.version, "pid": x.proc.pid if x.running else None,
                     "uptime": int(time.time() - x.started_at) if x.running else 0,
                     "restarts": x.restarts, "lastError": x.last_error},
            "traffic": {"upRate": round(self.total_rate[0]), "downRate": round(self.total_rate[1]),
                        "up": sum(t["up"] for t in self.totals.values()),
                        "down": sum(t["down"] for t in self.totals.values())},
            "groups": groups, "nodes": nodes, "events": list(self.events)[:20],
        }

    def traffic(self):
        days = [{"date": d, "nodes": self.days[d]} for d in sorted(self.days, reverse=True)[:31]]
        return {"interval": SAMPLE, "total": list(self.hist_total),
                "nodes": {k: list(v) for k, v in self.hist_nodes.items()},
                "totals": dict(self.totals), "days": days}

    # --- ТСПУ / РКН (cheburcheck.ru) -------------------------------------------
    async def tspu_check(self, target):
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=20, headers={"User-Agent": "xray-panel", "Accept": "application/json"}) as c:
                r = await c.get(CHEBURCHECK, params={"target": target})
            if r.status_code == 404:
                return {"target": target, "blocked": False, "error": "не найдено", "checkedAt": int(time.time())}
            if r.status_code == 429:
                return {"target": target, "blocked": None, "error": "слишком много запросов, повторите позже",
                        "checkedAt": int(time.time())}
            r.raise_for_status()
            d = r.json()
        except Exception as e:
            return {"target": target, "blocked": None, "error": f"cheburcheck недоступен: {e}", "checkedAt": int(time.time())}
        geo = d.get("geo") or {}
        return {"target": target, "blocked": bool(d.get("blocked")), "ips": d.get("ips", []),
                "blockedSubnets": d.get("blocked_subnets", []), "location": geo.get("location", ""),
                "org": geo.get("organisation", ""), "asn": geo.get("asn", ""), "country": geo.get("country_code", ""),
                "rknDomain": d.get("rkn_domain"), "error": "", "checkedAt": int(time.time())}

    async def tspu_refresh(self):
        addrs = []
        for n in self.store.nodes:
            if n["address"] and not n.get("raw") and n["address"] not in addrs:
                addrs.append(n["address"])
        for a in addrs:
            res = await self.tspu_check(a)
            old = self.tspu.get(a)
            if res["blocked"] is None and old and old.get("blocked") is not None:
                old["error"] = res["error"]
                continue
            if old and old.get("blocked") is False and res["blocked"]:
                self.event("error", f"ТСПУ: адрес {a} попал в реестр РКН!")
            self.tspu[a] = res
            await asyncio.sleep(2)
        self._save_json("tspu.json", self.tspu)

    async def _tspu_loop(self):
        await asyncio.sleep(15)
        while True:
            try:
                await self.tspu_refresh()
            except Exception as e:
                self.event("warn", f"ТСПУ-проверка: {e}")
            await asyncio.sleep(self.store.state["settings"]["tspuInterval"] * 60)

    # --- импорт / подписки -----------------------------------------------------
    async def _fetch_sub(self, url):
        """Скачать подписку: напрямую (с повтором через IPv4), при сбое — через локальные
        http-прокси узлов. Хосты из «всегда через прокси» сразу качаются через узлы."""
        host = _sub_host(url)
        marked = bool(host) and _host_in_list(host, self.store.state["settings"].get("subProxyHosts") or [])
        last = None
        if not marked:
            for v4_only in (False, True):
                try:
                    kw = {"transport": httpx.AsyncHTTPTransport(local_address="0.0.0.0")} if v4_only else {}
                    async with httpx.AsyncClient(trust_env=False, timeout=20, follow_redirects=True,
                                                 headers={"User-Agent": "v2rayN/7.0"}, **kw) as c:
                        r = await c.get(url)
                    break
                except Exception as e:
                    last = e
            else:
                r, last = await self._fetch_sub_via_nodes(url, last)
                if r is None:
                    raise ApplyError("Не удалось скачать подписку: " + _sub_net_hint(last)
                                     + ". Через прокси узлов тоже не вышло (" + _sub_net_hint(last) + ")",
                                     str(last) or repr(last))
                await self._remember_sub_host(host)
        else:
            r, last = await self._fetch_sub_via_nodes(url, None)
            if r is None:
                raise ApplyError("Не удалось скачать подписку через прокси узлов: "
                                 + (_sub_net_hint(last) if last else "нет включённых узлов"),
                                 str(last) or "")
        return self._check_sub_resp(r)

    def _check_sub_resp(self, r):
        if r.status_code >= 400:
            raise ApplyError(f"Подписка недоступна: сервер вернул HTTP {r.status_code}",
                             _sub_text_hint(r.text) + " Проверьте ссылку и срок действия подписки.")
        if _sub_body_kind(r.text):
            raise ApplyError("Сервер подписки отдал не подписку", _sub_text_hint(r.text))
        return r.text

    async def _remember_sub_host(self, host):
        """Запомнить хост подписки как «всегда через прокси» (IP у CDN плавает — храним домен)."""
        if not host or _host_in_list(host, self.store.state["settings"].get("subProxyHosts") or []):
            return
        ips = ""
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(host, None)
            ips = ", ".join(sorted({i[4][0] for i in infos})[:4])
        except Exception:
            pass
        self.store.state["settings"]["subProxyHosts"] = \
            (self.store.state["settings"].get("subProxyHosts") or []) + [host]
        self.store.save()
        self.event("info", f"Хост подписки {host}" + (f" ({ips})" if ips else "")
                   + " добавлен в «всегда через прокси» — дальше качается только через VPN")

    async def _fetch_sub_via_nodes(self, url, last):
        """Резерв: скачать подписку через http-прокси тестовых inbound'ов узлов
        (127.0.0.1:20100+, живут в том же xray). Сначала пробуем живые узлы."""
        nodes = [self.store.node(nid) for nid in self.meta.get("test_ports", {})]
        nodes = [n for n in nodes if n and n["enabled"]]
        nodes.sort(key=lambda n: not bool((self.observatory.get(n["id"]) or {}).get("alive")))
        for n in nodes[:4]:
            port = self.meta["test_ports"][n["id"]]
            try:
                async with httpx.AsyncClient(trust_env=False, proxy=f"http://127.0.0.1:{port}",
                                             timeout=10, follow_redirects=True,
                                             headers={"User-Agent": "v2rayN/7.0"}) as c:
                    r = await c.get(url)
                self.event("info", f"Подписка скачана через прокси узла «{n['name']}»")
                return r, last
            except Exception as e:
                last = e
        return None, last

    async def import_links(self, text, gid=None):
        text = text.strip()
        errors = []
        if text.startswith(("http://", "https://")) and "\n" not in text:
            existing = self.store.subscription_by_url(text)
            if existing:
                # та же ссылка — это обновление существующей подписки
                if gid and gid != existing["group"]:
                    await self.apply(lambda: self.store.update_subscription(existing["id"], {"group": gid}),
                                     restart=False)
                return await self.refresh_subscription(existing["id"])
            return await self._import_subscription(text, gid)
        parsed, errors = links.parse_text(text)
        if not parsed:
            raise ApplyError("Не найдено ни одной ссылки", "\n".join(errors))
        added = []

        def mutate():
            for p in parsed:
                try:
                    added.append(self.store.add_node(p))
                except ValidationError as e:
                    errors.append(f"{p.get('name') or p.get('address')}: {e}")
            g = self.store.group(gid) if gid else None
            if g:
                g["nodes"] += [n["id"] for n in added]
        await self.apply(mutate)
        return {"added": added, "errors": errors}

    async def _import_subscription(self, url, gid):
        text = await self._fetch_sub(url)
        parsed, errors = links.parse_text(text)
        if not parsed:
            detail = _sub_text_hint(text)
            if errors:
                detail += "\n\n" + "\n".join(errors[:5])
            raise ApplyError("В подписке нет распознанных ссылок (vless://, vmess://, trojan://, ss://)", detail)
        desired = {}
        for p in parsed:
            try:
                clean_node(p, "tmp")          # проверка корректности, p не меняется
            except ValidationError as e:
                errors.append(f"{p.get('name') or p.get('address')}: {e}")
                continue
            desired[_sub_key(p)] = p
        added = []
        adopted = [0]
        removed = [0]
        sub = [None]

        def mutate():
            sub[0] = self.store.add_subscription({"url": url, "group": gid or ""})
            s = sub[0]
            claimed = set()
            adopted_ids = set()
            # узлы, добавленные раньше вручную с теми же реквизитами, привязываем к подписке
            for n in self.store.nodes:
                k = _sub_key(n)
                if n.get("sub") is None and k in desired and k not in claimed:
                    claimed.add(k)
                    self.store.update_node(n["id"], {f: desired[k].get(f) for f in _SUB_SYNC} | {"sub": s["id"]})
                    adopted_ids.add(n["id"])
                    adopted[0] += 1
            # оставшиеся ручные дубликаты тех же серверов убираем
            dups = [n for n in self.store.nodes
                    if n.get("sub") is None and n["id"] not in adopted_ids and _sub_key(n) in claimed]
            removed[0] = len(dups)
            for n in dups:
                self.store.delete_node(n["id"])
            for k, p in desired.items():
                if k in claimed:
                    continue
                try:
                    added.append(self.store.add_node({**p, "sub": s["id"]}))
                except ValidationError as e:
                    errors.append(f"{p.get('name') or p.get('address')}: {e}")
            g = self.store.group(s["group"])
            if g:
                g["nodes"] += [n["id"] for n in added if n["id"] not in g["nodes"]]
            s["updatedAt"] = int(time.time())
        await self.apply(mutate)
        msg = f"Подписка «{sub[0]['name']}»: добавлено узлов {len(added)}"
        if adopted[0]:
            msg += f", привязано существующих {adopted[0]}"
        if removed[0]:
            msg += f", убрано дубликатов {removed[0]}"
        self.event("info", msg)
        return {"added": added, "adopted": adopted[0], "removed": removed[0],
                "errors": errors, "subscription": sub[0]}

    async def refresh_subscription(self, sid):
        """Перекачать подписку и сверить узлы: обновить, привязать ручные с теми же
        реквизитами, добавить новые, удалить исчезнувшие."""
        sub = self.store.subscription(sid)
        if not sub:
            raise ApplyError("Подписка не найдена")
        text = await self._fetch_sub(sub["url"])
        parsed, errors = links.parse_text(text)
        existing = [x for x in self.store.nodes if x.get("sub") == sid]
        if not parsed and existing:
            # страховка: сбойный (пустой/кривой) ответ не должен удалить все узлы подписки
            raise ApplyError("В подписке нет ни одной ссылки — обновление отменено, узлы не тронуты",
                             _sub_text_hint(text))
        desired = {}
        for p in parsed:
            try:
                clean_node(p, "tmp")          # проверка корректности, p не меняется
            except ValidationError as e:
                errors.append(f"{p.get('name') or p.get('address')}: {e}")
                continue
            desired[_sub_key(p)] = p
        updates, adopts, removed = [], [], []
        claimed = set()
        for n in existing:
            k = _sub_key(n)
            p = desired.get(k)
            if p is None:
                removed.append(n)
            else:
                claimed.add(k)
                updates.append((n["id"], p))
        for n in self.store.nodes:
            k = _sub_key(n)
            if n.get("sub") is None and k in desired and k not in claimed:
                claimed.add(k)
                adopts.append((n["id"], desired[k]))
        # оставшиеся ручные дубликаты тех же серверов убираем вместе с исчезнувшими
        adopted_ids = {nid for nid, _ in adopts}
        removed.extend(n for n in self.store.nodes
                       if n.get("sub") is None and n["id"] not in adopted_ids and _sub_key(n) in claimed)
        new = [p for k, p in desired.items() if k not in claimed]
        added = []
        updated = [0]

        def mutate():
            for nid, p in updates:
                self.store.update_node(nid, {f: p.get(f) for f in _SUB_SYNC})
                updated[0] += 1
            for nid, p in adopts:
                self.store.update_node(nid, {f: p.get(f) for f in _SUB_SYNC} | {"sub": sid})
            for n in removed:
                self.store.delete_node(n["id"])
            for p in new:
                try:
                    added.append(self.store.add_node({**p, "sub": sid}))
                except ValidationError as e:
                    errors.append(f"{p.get('name') or p.get('address')}: {e}")
            g = self.store.group(sub["group"])
            if g:
                g["nodes"] += [n["id"] for n in added if n["id"] not in g["nodes"]]
            self.store.update_subscription(sid, {"updatedAt": int(time.time())})
        await self.apply(mutate)
        msg = (f"Подписка «{sub['name']}»: добавлено {len(added)}, обновлено {updated[0]}, "
               f"привязано {len(adopts)}, удалено {len(removed)}")
        self.event("warn" if errors else "info", msg + (f"; не распознано строк: {len(errors)}" if errors else ""))
        return {"added": added, "updated": updated[0], "adopted": len(adopts), "removed": len(removed),
                "errors": errors, "subscription": self.store.subscription(sid)}

    async def delete_subscription(self, sid, with_nodes=False):
        sub = self.store.subscription(sid)
        if not sub:
            raise ApplyError("Подписка не найдена")
        if with_nodes:
            await self.apply(lambda: self.store.delete_subscription(sid, True))
        else:
            self.store.delete_subscription(sid, False)
            self.store.save()
        self.event("info", f"Подписка «{sub['name']}» удалена" + (" вместе с узлами" if with_nodes else ""))

    # --- диагностика узла ------------------------------------------------------
    async def test_node(self, nid):
        n = self.store.node(nid)
        if not n:
            raise ApplyError("Узел не найден")
        steps, verdict = [], ""
        seq0 = self.xray.seq
        t_start = time.time()
        addr = n["address"] or ((n.get("raw") or {}).get("settings", {}).get("vnext") or [{}])[0].get("address", "")
        port = n["port"]
        res = {"ok": False, "exitIp": "", "exitCountry": "", "latency": None}

        # 1. DNS
        ip = None
        t = time.time()
        try:
            infos = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(addr, port, type=socket.SOCK_STREAM), 5)
            ip = infos[0][4][0]
            steps.append({"name": "DNS", "ok": True, "detail": ip, "ms": _ms(t)})
        except Exception as e:
            steps.append({"name": "DNS", "ok": False, "detail": str(e) or "не разрешается", "ms": _ms(t)})
            verdict = "Имя сервера не разрешается в IP — проверьте адрес или DNS."

        # 2. TCP
        if ip:
            t = time.time()
            try:
                _, w = await asyncio.wait_for(asyncio.open_connection(ip, port), 6)
                w.close()
                steps.append({"name": "TCP-подключение", "ok": True, "detail": f"{ip}:{port} открыт", "ms": _ms(t)})
            except Exception as e:
                steps.append({"name": "TCP-подключение", "ok": False, "detail": _err(e), "ms": _ms(t)})
                verdict = ("Порт сервера не отвечает: сервер выключен, сменил порт, или IP заблокирован "
                           "(ТСПУ режет соединение до рукопожатия).")

        # 3. через прокси
        tport = self.meta["test_ports"].get(nid)
        if not n["enabled"]:
            steps.append({"name": "Через прокси", "ok": False, "detail": "узел выключен", "ms": 0})
            verdict = verdict or "Узел выключен — включите его, чтобы проверить работу через прокси."
        elif tport and not verdict:
            proxy = f"http://127.0.0.1:{tport}"
            t = time.time()
            try:
                async with httpx.AsyncClient(trust_env=False, proxy=proxy, timeout=12) as c:
                    r = await c.get(self.store.state["settings"]["probeURL"])
                res["latency"] = _ms(t)
                steps.append({"name": "Через прокси", "ok": r.status_code < 400,
                              "detail": f"HTTP {r.status_code} за {res['latency']} мс", "ms": res["latency"]})
                t = time.time()
                async with httpx.AsyncClient(trust_env=False, proxy=proxy, timeout=12) as c:
                    r = await c.get("http://ip-api.com/json/?fields=query,countryCode,country,isp")
                    j = r.json()
                res["exitIp"], res["exitCountry"] = j.get("query", ""), j.get("countryCode", "")
                steps.append({"name": "Внешний IP", "ok": True,
                              "detail": f"{j.get('query')} · {j.get('country', '')} · {j.get('isp', '')}", "ms": _ms(t)})
                res["ok"] = True
            except Exception as e:
                steps.append({"name": "Через прокси", "ok": False, "detail": _err(e), "ms": _ms(t)})

        # 4. ТСПУ
        if addr:
            tr = await self.tspu_check(addr)
            if tr["blocked"] is not None:
                self.tspu[addr] = tr
            steps.append({"name": "ТСПУ / реестр РКН", "ok": tr["blocked"] is False,
                          "detail": tr["error"] or (("В РЕЕСТРЕ: " + ", ".join(tr["blockedSubnets"] or [tr.get("rknDomain") or addr]))
                                                    if tr["blocked"] else f"не в реестре ({tr['location']}, {tr['org']})")})

        await asyncio.sleep(0.3)
        logs = [x["text"] for x in self.xray.lines
                if x["seq"] > seq0 and x["level"] != "access" and (nid in x["text"] or (ip and ip in x["text"]) or addr in x["text"]
                                                                     or "reality" in x["text"].lower())]
        joined = "\n".join(logs).lower()
        if not res["ok"] and not verdict:
            verdict = _diagnose(joined, n)
        if res["ok"]:
            verdict = f"Узел работает: выход через {res['exitIp']} ({res['exitCountry']}), задержка {res['latency']} мс."
        o = self.observatory.get(nid)
        if o and not o.get("alive") and o.get("last_error_reason"):
            logs.append("observatory: " + o["last_error_reason"])
        return res | {"verdict": verdict, "steps": steps, "logs": logs[-30:], "duration": _ms(t_start)}


def _ms(t):
    return int((time.time() - t) * 1000)


def _err(e):
    s = str(e) or e.__class__.__name__
    if isinstance(e, (asyncio.TimeoutError, httpx.TimeoutException)):
        s = "таймаут"
    return s[:200]


def _short_reason(r):
    r = r or ""
    for key, text in (("real certificate", "REALITY: сервер вернул настоящий сертификат"),
                      ("context deadline exceeded", "таймаут проверки"),
                      ("connection refused", "соединение отклонено"),
                      ("i/o timeout", "таймаут соединения"),
                      ("closed pipe", "соединение закрыто сервером"),
                      ("EOF", "соединение оборвано (EOF)")):
        if key in r:
            return text
    return r.split(">")[-1].strip()[:160]


def _diagnose(logs, n):
    if "real certificate" in logs:
        return ("REALITY: сервер отвечает настоящим сертификатом сайта-маски. Почти всегда это неверные "
                "publicKey / shortId / SNI, ЛИБО трафик этого сервера уже идёт через другой прокси "
                "(двойное проксирование — проверьте, что мини-сервер исключён из XKeen на роутере).")
    if "invalid connection" in logs or "reality" in logs and "failed" in logs:
        return "Рукопожатие REALITY не проходит — проверьте publicKey, shortId, SNI и отпечаток (fingerprint)."
    if "invalid user" in logs or "invalid request user" in logs:
        return "Сервер не принимает пользователя — проверьте UUID / пароль и flow."
    if "connection reset" in logs or "eof" in logs:
        return ("Соединение сбрасывается после подключения — похоже на блокировку ТСПУ по протоколу/SNI "
                "или на неверный flow/UUID.")
    if "timeout" in logs or "deadline" in logs:
        return "Сервер не отвечает на рукопожатие (таймаут) — возможна блокировка ТСПУ или сервер перегружен."
    if "tls" in logs and "certificate" in logs:
        return "Ошибка TLS-сертификата — проверьте SNI или включите allowInsecure для самоподписанного сертификата."
    if n.get("security") == "reality":
        return "TCP открыт, но через прокси трафик не идёт. Попробуйте сменить отпечаток (chrome ↔ firefox) и проверьте ключи."
    return "TCP открыт, но через прокси трафик не идёт — смотрите журнал ниже."
