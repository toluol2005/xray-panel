"""HTTP API и раздача фронтенда (FastAPI)."""
import asyncio
import hashlib
import hmac
import json
import os
import secrets
import time

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import links
from .core import ApplyError, Panel
from .store import ValidationError

VERSION = "1.1.3"
HERE = os.path.dirname(__file__)
CONFIG_PATH = os.environ.get("PANEL_CONFIG", "/data/panel.yaml")

DEFAULT_CONFIG = """\
# xray-panel. Изменения применяются после перезапуска контейнера.
listen: 0.0.0.0
port: 2017
# Пользователи панели. Если список пуст или закомментирован — вход БЕЗ пароля.
# Пароль можно указать открыто или хешем: sha256:<hex> (echo -n 'пароль' | sha256sum)
users: []
#  - username: admin
#    password: sha256:8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
session_days: 30
"""


def load_config():
    if not os.path.exists(CONFIG_PATH):
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG)
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    cfg.setdefault("listen", "0.0.0.0")
    cfg.setdefault("port", 2017)
    cfg["users"] = [u for u in (cfg.get("users") or []) if u and u.get("username")]
    cfg.setdefault("session_days", 30)
    return cfg


CFG = load_config()
DATA_DIR = os.environ.get("PANEL_DATA", os.path.dirname(CONFIG_PATH) or "/data")
ASSET_DIR = os.path.join(DATA_DIR, "geo")
panel = Panel(DATA_DIR, os.environ.get("XRAY_BIN", "/usr/local/bin/xray"), ASSET_DIR)
sessions = {}   # token -> (user, expires)

app = FastAPI(title="xray-panel", docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=os.path.join(HERE, "static")), name="static")


# --- авторизация --------------------------------------------------------------
def auth_required():
    return bool(CFG["users"])


def check_password(stored, given):
    stored = str(stored)
    if stored.startswith("sha256:"):
        return hmac.compare_digest(stored[7:].lower(), hashlib.sha256(given.encode()).hexdigest())
    return hmac.compare_digest(stored, given)


def current_user(request):
    tok = request.cookies.get("xp_session")
    s = sessions.get(tok) if tok else None
    if s and s[1] > time.time():
        return s[0]
    return None


@app.middleware("http")
async def auth_mw(request: Request, call_next):
    path = request.url.path
    if auth_required() and path.startswith("/api/") and not path.startswith("/api/auth/"):
        if not current_user(request):
            return JSONResponse({"error": "Требуется вход"}, status_code=401)
    resp = await call_next(request)
    if path.startswith("/static/"):
        # Статика обновляется вместе с панелью — браузер обязан перепроверять
        # (ETag/Last-Modified оставляют 304, так что трафика почти нет).
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.exception_handler(ApplyError)
async def apply_error(_, e: ApplyError):
    return JSONResponse({"error": str(e), "detail": e.detail}, status_code=400)


@app.exception_handler(ValidationError)
async def validation_error(_, e: ValidationError):
    return JSONResponse({"error": str(e)}, status_code=400)


@app.exception_handler(HTTPException)
async def http_error(_, e: HTTPException):
    return JSONResponse({"error": str(e.detail)}, status_code=e.status_code)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    user = current_user(request)
    return {"authRequired": auth_required(), "authenticated": bool(user) or not auth_required(), "user": user}


@app.post("/api/auth/login")
async def login(request: Request):
    body = await request.json()
    await asyncio.sleep(0.4)   # замедляем перебор
    for u in CFG["users"]:
        if u["username"] == body.get("username") and check_password(u.get("password", ""), body.get("password", "")):
            tok = secrets.token_urlsafe(32)
            sessions[tok] = (u["username"], time.time() + CFG["session_days"] * 86400)
            resp = JSONResponse({"ok": True})
            resp.set_cookie("xp_session", tok, max_age=CFG["session_days"] * 86400, httponly=True, samesite="lax")
            return resp
    return JSONResponse({"error": "Неверный логин или пароль"}, status_code=401)


@app.post("/api/auth/logout")
async def logout(request: Request):
    sessions.pop(request.cookies.get("xp_session"), None)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("xp_session")
    return resp


# --- статус -------------------------------------------------------------------
@app.get("/api/status")
async def status():
    return panel.status()


@app.get("/api/state")
async def state():
    return panel.store.state


# --- узлы ---------------------------------------------------------------------
def _node_or_404(nid):
    n = panel.store.node(nid)
    if not n:
        raise HTTPException(404, "Узел не найден")
    return n


@app.post("/api/nodes")
async def add_node(request: Request):
    body = await request.json()
    n = await panel.apply(lambda: panel.store.add_node(body))
    panel.event("info", f"добавлен узел «{n['name']}»")
    return n


@app.put("/api/nodes/{nid}")
async def update_node(nid: str, request: Request):
    body = await request.json()
    _node_or_404(nid)
    return await panel.apply(lambda: panel.store.update_node(nid, body))


@app.delete("/api/nodes/{nid}")
async def delete_node(nid: str):
    n = _node_or_404(nid)
    await panel.apply(lambda: panel.store.delete_node(nid))
    panel.event("info", f"удалён узел «{n['name']}»")
    return {"ok": True}


@app.post("/api/nodes/reorder")
async def reorder_nodes(request: Request):
    ids = (await request.json()).get("ids", [])
    panel.store.reorder("nodes", ids)
    panel.store.save()
    return {"ok": True}


@app.post("/api/nodes/import")
async def import_nodes(request: Request):
    body = await request.json()
    return await panel.import_links(body.get("text", ""), body.get("group"))


# --- подписки ------------------------------------------------------------------
@app.post("/api/subscriptions/{sid}/refresh")
async def subscription_refresh(sid: str):
    return await panel.refresh_subscription(sid)


@app.delete("/api/subscriptions/{sid}")
async def subscription_delete(sid: str, nodes: bool = False):
    await panel.delete_subscription(sid, nodes)
    return {"ok": True}


@app.get("/api/nodes/{nid}/link")
async def node_link(nid: str):
    return {"link": links.build_link(_node_or_404(nid))}


@app.post("/api/nodes/{nid}/test")
async def node_test(nid: str):
    return await panel.test_node(nid)


# --- группы -------------------------------------------------------------------
@app.post("/api/groups")
async def add_group(request: Request):
    body = await request.json()
    g = await panel.apply(lambda: panel.store.add_group(body))
    panel.event("info", f"создана группа «{g['name']}» на порту {g['port']}")
    return g


@app.put("/api/groups/{gid}")
async def update_group(gid: str, request: Request):
    body = await request.json()
    old = panel.store.group(gid)
    if not old:
        raise HTTPException(404, "Группа не найдена")
    # смена только порядка/закрепления при стратегии priority — без перезапуска xray
    soft_keys = {"nodes", "pinned", "name"}
    changed = {k for k in body if k in old and body[k] != old[k]}
    soft = (changed <= soft_keys and sorted(body.get("nodes", old["nodes"])) == sorted(old["nodes"]))
    _, g = await panel.apply(lambda: panel.store.update_group(gid, body), restart=not soft)
    return g


@app.delete("/api/groups/{gid}")
async def delete_group(gid: str):
    g = panel.store.group(gid)
    if not g:
        raise HTTPException(404, "Группа не найдена")
    await panel.apply(lambda: panel.store.delete_group(gid))
    panel.event("info", f"удалена группа «{g['name']}»")
    return {"ok": True}


@app.post("/api/groups/reorder")
async def reorder_groups(request: Request):
    panel.store.reorder("groups", (await request.json()).get("ids", []))
    panel.store.save()
    return {"ok": True}


@app.post("/api/groups/{gid}/pin")
async def pin_group(gid: str, request: Request):
    await panel.pin(gid, (await request.json()).get("node"))
    return {"ok": True}


# --- маршрутизация / настройки ------------------------------------------------
@app.put("/api/routing")
async def put_routing(request: Request):
    from .store import clean_routing
    body = await request.json()

    def mutate():
        panel.store.state["routing"] = clean_routing(body)
    await panel.apply(mutate)
    return panel.store.state["routing"]


@app.put("/api/settings")
async def put_settings(request: Request):
    from .store import clean_settings
    body = await request.json()

    def mutate():
        panel.store.state["settings"] = clean_settings({**panel.store.state["settings"], **body})
    await panel.apply(mutate)
    return panel.store.state["settings"]


# --- трафик / журнал ----------------------------------------------------------
@app.get("/api/traffic")
async def traffic():
    return panel.traffic()


@app.get("/api/logs")
async def logs(since: int = 0, limit: int = 500):
    limit = max(1, min(limit, 5000))
    return {"seq": panel.xray.seq, "lines": panel.xray.logs_since(since, limit)}


@app.get("/api/connections")
async def connections():
    return panel.connections()


@app.get("/api/events")
async def events(limit: int = 200):
    return list(panel.events)[:limit]


# --- ТСПУ ---------------------------------------------------------------------
@app.post("/api/tspu/check")
async def tspu_check(request: Request):
    target = str((await request.json()).get("target", "")).strip()
    if len(target) < 3:
        raise ApplyError("Укажите IP, домен или подсеть")
    return await panel.tspu_check(target)


@app.post("/api/tspu/refresh")
async def tspu_refresh():
    asyncio.create_task(panel.tspu_refresh())
    return {"ok": True}


# --- служебное ----------------------------------------------------------------
def _file_info(name):
    p = os.path.join(ASSET_DIR, name)
    try:
        st = os.stat(p)
        return {"size": st.st_size, "mtime": int(st.st_mtime)}
    except OSError:
        return None


@app.get("/api/system")
async def system():
    return {"xrayVersion": panel.xray.version, "panelVersion": VERSION,
            "geo": {"geoip": _file_info("geoip.dat"), "geosite": _file_info("geosite.dat")},
            "hostname": os.uname().nodename, "uptime": int(time.time() - START),
            "authRequired": auth_required()}


@app.post("/api/xray/restart")
async def xray_restart():
    await panel.restart_xray()
    return {"ok": True}


@app.get("/api/xray/config")
async def xray_config():
    with open(panel.xray.config_path, encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/geo/update")
async def geo_update():
    s = panel.store.state["settings"]
    got = []
    async with httpx.AsyncClient(trust_env=False, timeout=120, follow_redirects=True) as c:
        for name, url in (("geoip.dat", s["geoipURL"]), ("geosite.dat", s["geositeURL"])):
            try:
                r = await c.get(url)
                r.raise_for_status()
            except Exception as e:
                raise ApplyError(f"Не удалось скачать {name}", str(e))
            if len(r.content) < 10000:
                raise ApplyError(f"{name}: подозрительно маленький файл ({len(r.content)} байт)")
            got.append((name, r.content))
    backups = []
    for name, content in got:
        p = os.path.join(ASSET_DIR, name)
        if os.path.exists(p):
            os.replace(p, p + ".bak")
            backups.append(p)
        with open(p, "wb") as f:
            f.write(content)
    try:
        await panel.apply(lambda: None)
    except ApplyError:
        for p in backups:
            os.replace(p + ".bak", p)
        await panel.restart_xray()
        raise
    detail = ", ".join(f"{n}: {len(c) // 1024} КБ" for n, c in got)
    panel.event("info", "гео-базы обновлены: " + detail)
    return {"ok": True, "detail": detail}


@app.get("/api/export")
async def export():
    body = json.dumps(panel.store.state, ensure_ascii=False, indent=2)
    return Response(body, media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="xray-panel-{time.strftime("%Y%m%d-%H%M")}.json"'})


@app.post("/api/import-state")
async def import_state(request: Request):
    body = await request.json()
    await panel.apply(lambda: panel.store.replace(body, save=False))
    panel.event("info", "состояние восстановлено из резервной копии")
    return {"ok": True}


# --- фронтенд -----------------------------------------------------------------
@app.get("/")
async def index():
    return FileResponse(os.path.join(HERE, "static", "index.html"), headers={"Cache-Control": "no-cache"})


START = time.time()


@app.on_event("startup")
async def startup():
    await panel.start()
