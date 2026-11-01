# Xray Panel

Веб-панель для [Xray-core](https://github.com/XTLS/Xray-core).

*A self-hosted web panel for Xray-core (proxy groups with priority failover, node management, traffic stats).
The UI is in Russian.*

## Возможности

**Панель** (`panel/`, FastAPI + vanilla JS без сборки):

- группы — отдельный порт SOCKS5 + HTTP на каждую, переключение узлов по приоритету с возвратом
  на лучший, запасной вариант «напрямую»;
- узлы VLESS / VMess / Trojan / Shadowsocks / SOCKS / HTTP (TCP, WS, gRPC, XHTTP, HTTPUpgrade; TLS, REALITY),
  импорт по ссылкам, порядок перетаскиванием, проверка задержки;
- подписки: добавление по ссылке и обновление одним нажатием — сверка узлов с содержимым
  (изменившиеся обновляются, новые добавляются, исчезнувшие удаляются);
- гео-маршрутизация (российские сайты и IP — напрямую), свои правила;
- трафик по группам и узлам, активные соединения, журнал событий;
- проверка адреса в реестре РКН / ТСПУ (через cheburcheck.ru);
- 4 стиля оформления (ops, clean, glass, term), тема светлая / тёмная / авто, адаптивная вёрстка под телефон.

## Установка панели

Нужен Docker. Образ собирается сам и скачивает Xray-core нужной архитектуры (amd64, arm64, armv7).

```sh
git clone https://github.com/lor08/xray-panel.git
cd xray-panel
docker compose up -d --build
```

Панель откроется на `http://<хост>:2017`. Контейнер работает в сети хоста (`network_mode: host`),
поэтому порты групп (по умолчанию 7891, 7892, …) слушаются прямо на хосте.

Данные лежат в `./data/`:

| Файл | Что хранит |
|---|---|
| `panel.yaml` | адрес и порт панели, пользователи (создаётся при первом запуске) |
| `state.json` | узлы, группы, маршрутизация, настройки |
| `xray/config.json` | конфиг Xray (генерируется панелью, руками не править) |
| `geo/*.dat`, `traffic.json`, `tspu.json` | гео-базы, статистика, кэш проверок |

Версия Xray задаётся аргументом сборки: `docker compose build --build-arg XRAY_VERSION=26.10.10`.

### Вход

По умолчанию вход **без пароля** (`users: []`). Если панель доступна не только из вашей домашней сети,
включите вход в `data/panel.yaml` и перезапустите контейнер (`docker compose restart`):

```yaml
users:
  - username: admin
    password: sha256:<результат echo -n 'пароль' | sha256sum>
```

Прокси-порты групп по умолчанию тоже открыты без пароля. Не публикуйте их в интернет, а логин и пароль
группе можно задать в настройках самой группы.

### Запуск без Docker

```sh
pip install -r requirements.txt
PANEL_CONFIG=./data/panel.yaml XRAY_BIN=/usr/local/bin/xray python -m panel
```

## API

Описание REST API панели — в [API.md](API.md).

## Лицензия

[MIT](LICENSE)
