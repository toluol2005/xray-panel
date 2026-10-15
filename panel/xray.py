"""Запуск xray как дочернего процесса, сбор журнала, API-вызовы и метрики."""
import asyncio
import collections
import json
import os
import re
import time
import urllib.request

from . import xraygen

LEVEL_RE = re.compile(r"\[(Debug|Info|Warning|Error)\]")
ACCESS_RE = re.compile(
    r"from (?:(?P<snet>tcp|udp):)?(?P<src>[\[\]0-9a-fA-F.:]+?):\d+ (?P<verdict>accepted|rejected) "
    r"(?P<net>tcp|udp):(?P<dest>\S+) \[(?P<inb>[^\]\s]+) (?:->|>>) (?P<out>[^\]\s]+)\]")
TS_RE = re.compile(r"^\d{4}/\d\d/\d\d \d\d:\d\d:\d\d(?:\.\d+)? ")
NODE_TAG_RE = re.compile(r"\bn[0-9a-f]{6}\b")


class Xray:
    def __init__(self, binary, data_dir, asset_dir, on_event):
        self.binary = binary
        self.dir = os.path.join(data_dir, "xray")
        os.makedirs(self.dir, exist_ok=True)
        self.config_path = os.path.join(self.dir, "config.json")
        self.asset_dir = asset_dir
        self.on_event = on_event
        self.proc = None
        self.started_at = 0
        self.restarts = 0
        self.last_error = ""
        self.version = ""
        self.want_running = False
        self.seq = 0
        self.lines = collections.deque(maxlen=5000)
        self.line_listeners = []
        self._lock = asyncio.Lock()
        self._watch_task = None

    # --- конфиг ------------------------------------------------------------
    def env(self):
        return {**os.environ, "XRAY_LOCATION_ASSET": self.asset_dir}

    async def detect_version(self):
        try:
            p = await asyncio.create_subprocess_exec(self.binary, "version", stdout=asyncio.subprocess.PIPE)
            out, _ = await p.communicate()
            m = re.search(r"Xray (\S+)", out.decode())
            self.version = m.group(1) if m else "?"
        except FileNotFoundError:
            self.version = "не найден"
        return self.version

    async def test_config(self, config):
        """Проверить конфиг через `xray run -test`. Возвращает (ok, вывод)."""
        path = self.config_path[:-5] + ".test.json"
        with open(path, "w") as f:
            json.dump(config, f, ensure_ascii=False, indent=1)
        p = await asyncio.create_subprocess_exec(
            self.binary, "run", "-test", "-c", path, env=self.env(),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await p.communicate()
        os.unlink(path)
        text = out.decode("utf-8", "replace")
        lines = [ln for ln in text.splitlines() if ln.strip() and not any(s in ln for s in ("Reading config", "[Warning]", "Penetrates Everything", "unified platform"))]
        return p.returncode == 0, "\n".join(lines[-15:])

    def write_config(self, config):
        tmp = self.config_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(config, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.config_path)

    # --- процесс -------------------------------------------------------------
    @property
    def running(self):
        return self.proc is not None and self.proc.returncode is None

    async def start(self):
        async with self._lock:
            await self._start()

    async def _start(self):
        self.want_running = True
        if self.running:
            return
        self.proc = await asyncio.create_subprocess_exec(
            self.binary, "run", "-c", self.config_path, env=self.env(),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        self.started_at = time.time()
        self.last_error = ""
        self._watch_task = asyncio.create_task(self._watch(self.proc))

    async def _stop(self):
        self.want_running = False
        p = self.proc
        if p and p.returncode is None:
            p.terminate()
            try:
                await asyncio.wait_for(p.wait(), 5)
            except asyncio.TimeoutError:
                p.kill()
                await p.wait()

    async def restart(self):
        async with self._lock:
            await self._stop()
            await self._start()

    async def _watch(self, proc):
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            self._push(raw.decode("utf-8", "replace").rstrip())
        code = await proc.wait()
        if proc is not self.proc or not self.want_running:
            return
        self.last_error = self.last_error or f"xray завершился с кодом {code}"
        self.on_event("error", f"xray упал (код {code}), перезапуск через 3 с")
        await asyncio.sleep(3)
        async with self._lock:
            if proc is self.proc and self.want_running:
                self.restarts += 1
                self.proc = None
                await self._start()

    def _push(self, text):
        if not text:
            return
        self.seq += 1
        m = LEVEL_RE.search(text)
        acc = ACCESS_RE.search(text) if not m else None
        level = m.group(1).lower() if m else ("access" if acc else "info")
        body = TS_RE.sub("", text)
        node = NODE_TAG_RE.search(body)
        item = {"seq": self.seq, "ts": time.time(), "level": level, "text": body}
        if node:
            item["node"] = node.group(0)
        if level == "error":
            self.last_error = body[:300]
        self.lines.append(item)
        for cb in self.line_listeners:
            cb(item, acc)

    def logs_since(self, since, limit):
        items = [x for x in self.lines if x["seq"] > since]
        return items[-limit:]

    # --- API xray ------------------------------------------------------------
    async def api(self, *args, timeout=5):
        p = await asyncio.create_subprocess_exec(
            self.binary, "api", *args[:1], "-s", f"127.0.0.1:{xraygen.API_PORT}", *args[1:],
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        try:
            out, _ = await asyncio.wait_for(p.communicate(), timeout)
        except asyncio.TimeoutError:
            p.kill()
            return False, "timeout"
        return p.returncode == 0, out.decode("utf-8", "replace")

    async def override(self, balancer, target):
        if target:
            return await self.api("bo", "-b", balancer, target)
        return await self.api("bo", "-b", balancer, "-r")

    def metrics(self):
        """Синхронно (вызывать в потоке): /debug/vars → (observatory, stats)."""
        url = f"http://127.0.0.1:{xraygen.METRICS_PORT}/debug/vars"
        with urllib.request.urlopen(url, timeout=2) as r:
            d = json.load(r)
        return d.get("observatory") or {}, d.get("stats") or {}
