# xray-panel — API контракт (backend ⇄ frontend)

Все ответы JSON. Ошибка: HTTP 4xx/5xx + `{"error": "текст на русском", "detail": "..."?}`.
Авторизация: cookie `xp_session` (ставит `/api/auth/login`). Если в `panel.yaml` нет
пользователей — авторизации нет, все запросы разрешены, `authRequired:false`.
При 401 фронт показывает экран входа.

## Модели

Node (узел / «конфиг»):
```json
{ "id": "n3f9a1c", "name": "NL-Reality", "enabled": true, "note": "",
  "protocol": "vless|vmess|trojan|shadowsocks|socks|http",
  "address": "203.0.113.10", "port": 443,
  "uuid": "", "flow": "", "encryption": "none", "alterId": 0,
  "password": "", "method": "", "username": "",
  "network": "tcp|ws|grpc|xhttp|httpupgrade",
  "security": "none|tls|reality",
  "sni": "", "fingerprint": "chrome|firefox|safari|ios|edge|random|randomized|",
  "alpn": "", "allowInsecure": false,
  "publicKey": "", "shortId": "", "spiderX": "",
  "path": "", "host": "", "serviceName": "", "mode": "",
  "raw": null,
  "sub": null }
```
`raw` — необязательный готовый JSON-объект outbound xray (если задан, остальные поля игнорируются; tag подставит сервер).
`sub` — id подписки, из которой пришёл узел (null у добавленных вручную).

Subscription (подписка):
```json
{ "id": "s8c1d44", "name": "sub3.example.com", "url": "https://sub3.example.com/xxxx",
  "group": "g-main",          // группа, куда добавляются новые узлы ("" — никуда)
  "updatedAt": 1791966509 }   // 0 = ещё не обновлялась
```

Group:
```json
{ "id": "g-main", "name": "основной", "enabled": true,
  "listen": "0.0.0.0", "port": 7891, "udp": true,
  "nodes": ["n3f9a1c", "n77b0e2"],          // ПОРЯДОК = ПРИОРИТЕТ (сверху важнее)
  "strategy": "priority|leastPing|random",  // priority = первый живой по порядку
  "fallback": "direct|block",               // куда, если все узлы мертвы
  "pinned": null,                           // id узла или "direct" — ручное закрепление
  "routing": "geo|all",                     // geo: РФ/локальное напрямую; all: всё в группу
  "username": "", "password": "" }          // необязательная SOCKS/HTTP авторизация на порту
```

Routing (глобальные правила, применяются ко всем группам, выше гео-правил):
```json
{ "directDomains": ["example.ru"], "proxyDomains": ["youtube.com"],
  "blockDomains": [], "directIPs": ["10.0.0.0/8"], "blockAds": false }
```
Элементы доменов — строки xray: `example.com`, `domain:..`, `full:..`, `keyword:..`, `regexp:..`, `geosite:..`.

Settings:
```json
{ "probeURL": "https://www.gstatic.com/generate_204", "probeInterval": 30,
  "logLevel": "warning|info|debug|error", "dns": ["https://1.1.1.1/dns-query", "8.8.8.8"],
  "tspuInterval": 360, "geoipURL": "...", "geositeURL": "..." }
```

## Эндпоинты

Авторизация
- `GET  /api/auth/status` → `{authRequired, authenticated, user}`
- `POST /api/auth/login` `{username,password}` → `{ok:true}` | 401
- `POST /api/auth/logout` → `{ok:true}`

Статус (опрашивать каждые 2–3 с)
- `GET /api/status` →
```json
{ "xray": {"running":true, "version":"26.10.10", "pid":12, "uptime":3600, "restarts":0, "lastError":""},
  "traffic": {"upRate": 1200, "downRate": 52000, "up": 123, "down": 456},     // байт/с и байт всего
  "groups": [{ "id","name","port","enabled","strategy","fallback","pinned","routing",
               "active": "n3f9a1c|direct|block|null",   // куда сейчас реально идёт трафик
               "activeName": "NL-Reality",
               "state": "ok|degraded|down|disabled",    // ok=активен приоритетный, degraded=работает запасной/direct, down=никуда
               "upRate","downRate" }],
  "nodes": { "<id>": { "alive":true|false|null, "delay":276, "lastError":"", "lastSeen":1791966509, "lastTry":1791966509,
                       "upRate":0, "downRate":0, "up":0, "down":0,
                       "tspu": {"blocked":false, "checkedAt":1791966509, "location":"Дронтен, Нидерланды", "org":"Serverius", "error":""} | null } },
  "events": [ {"ts":1791966509, "level":"info|warn|error", "text":"основной: NL-Reality → DE-Reality"} ]   // последние 20, новые первыми
}
```
`alive:null` — ещё не проверялся.

Полное состояние
- `GET /api/state` → `{nodes:[Node], groups:[Group], subscriptions:[Subscription], routing:Routing, settings:Settings}`

Узлы (изменения применяются сразу: генерация конфига → `xray -test` → перезапуск; при ошибке 400 с текстом)
- `POST   /api/nodes` Node(без id) → Node
- `PUT    /api/nodes/{id}` Node → Node
- `DELETE /api/nodes/{id}` → `{ok}` (удаляется и из групп)
- `POST   /api/nodes/reorder` `{ids:[...]}` → `{ok}`  (порядок в общем списке)
- `POST   /api/nodes/import` `{text}` — ссылки vless:// vmess:// trojan:// ss:// (по одной в строке) ИЛИ URL подписки, `group` (необязательно, id группы куда добавить).
  Если `text` — URL подписки: первая вставка создаёт подписку → `{added:[Node], errors, subscription:Subscription}`;
  повторная вставка того же URL (или `POST /api/subscriptions/{id}/refresh`) обновляет её → `{added, updated, removed, errors, subscription}`.
  Для обычных ссылок → `{added:[Node], errors:["..."]}`
- `GET    /api/nodes/{id}/link` → `{link:"vless://..."}`
- `POST   /api/nodes/{id}/test` → диагностика узла (5–20 с):
```json
{ "ok": false, "verdict": "TCP до сервера открывается, но рукопожатие REALITY не проходит — проверьте publicKey/shortId/SNI/отпечаток",
  "exitIp": "203.0.113.10", "exitCountry": "NL", "latency": 312,
  "steps": [ {"name":"DNS", "ok":true, "detail":"203.0.113.10", "ms":3},
             {"name":"TCP connect", "ok":true, "detail":"порт открыт", "ms":41},
             {"name":"Через прокси", "ok":false, "detail":"timeout", "ms":10000},
             {"name":"ТСПУ / РКН", "ok":true, "detail":"не в реестре (Дронтен, Нидерланды)"} ],
  "logs": ["последние строки журнала xray про этот узел"] }
```

Группы
- `POST   /api/groups` Group(без id) → Group
- `PUT    /api/groups/{id}` Group → Group  (изменение только порядка `nodes` применяется без перезапуска xray)
- `DELETE /api/groups/{id}` → `{ok}`
- `POST   /api/groups/reorder` `{ids:[...]}` → `{ok}`
- `POST   /api/groups/{id}/pin` `{node: "<id>"|"direct"|null}` → `{ok}` (null = авто)

Подписки
- `POST   /api/subscriptions/{id}/refresh` → скачать подписку заново и сверить узлы
  (узлы сопоставляются по протоколу+адресу+порту+секрету: изменившиеся обновляются, новые добавляются
  в `group` подписки, исчезнувшие удаляются; переключатели `enabled` и заметки пользователей сохраняются)
  → `{added:[Node], updated:int, removed:int, errors:["..."], subscription:Subscription}`
- `DELETE /api/subscriptions/{id}?nodes=true|false` → `{ok}` (nodes=true — удалить и все узлы подписки)

Маршрутизация / настройки
- `PUT /api/routing` Routing → Routing
- `PUT /api/settings` Settings → Settings

Трафик
- `GET /api/traffic` →
```json
{ "interval": 5,
  "total": [[ts, upRate, downRate], ...],              // последний час, точка каждые 5 с
  "nodes": { "<id>|direct": [[ts, upRate, downRate], ...] },
  "totals": { "<id>|direct": {"up":0,"down":0} },      // с запуска панели
  "days":   [ {"date":"2026-10-14", "nodes": {"<id>|direct": {"up":0,"down":0}}} ] }  // последние 31 день
```

Журнал
- `GET /api/logs?since=<seq>&limit=500` → `{seq, lines:[{seq, ts, level:"debug|info|warning|error|access", text, node?:"<id>"}]}`
  (`since=0` — последние `limit` строк; дальше передавать полученный `seq`)
- `GET /api/connections` → последние подключения по access-логу:
```json
{ "recent":  [{"ts", "src":"192.168.1.10", "dest":"google.com:443", "net":"tcp", "inbound":"основной", "route":"NL-Reality|direct|block"}],   // ≤200, новые первыми
  "clients": [{"ip", "count", "lastSeen"}],
  "domains": [{"domain", "count", "route", "lastSeen"}] }   // топ-100
```
- `GET /api/events?limit=200` → `[{ts, level, text}]`

ТСПУ / РКН (cheburcheck.ru)
- `POST /api/tspu/check` `{target}` (IP/домен/подсеть) → `{target, blocked, ips:[], blockedSubnets:[], location, org, asn, rknDomain, error}`
- `POST /api/tspu/refresh` → перепроверить все узлы, `{ok}`

Служебное
- `GET  /api/system` → `{xrayVersion, panelVersion, geo:{geoip:{size,mtime}, geosite:{size,mtime}}, hostname, uptime, authRequired}`
- `POST /api/xray/restart` → `{ok}`
- `GET  /api/xray/config` → сгенерированный config.json xray (для отладки)
- `POST /api/geo/update` → `{ok, detail}`
- `GET  /api/export` → весь state для бэкапа; `POST /api/import-state` state → `{ok}`
