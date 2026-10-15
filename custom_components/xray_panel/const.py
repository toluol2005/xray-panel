"""Константы интеграции Xray Panel."""
from datetime import timedelta

DOMAIN = "xray_panel"
VERSION = "1.0.1"

DEFAULT_URL = "http://homeassistant.local:2017"
DEFAULT_TITLE = "VPN"
SCAN_INTERVAL = timedelta(seconds=10)

CONF_TITLE = "sidebar_title"
CONF_ADMIN_ONLY = "admin_only"

# Пункт бокового меню HA: http://<ha>:8123/vpn
PANEL_URL_PATH = "vpn"
PANEL_ICON = "mdi:shield-lock-outline"
PANEL_ELEMENT = "xray-panel-frame"
STATIC_URL = "/xray_panel_static"

# Выбор узла в группе: служебные пункты (закрепление в панели — POST /api/groups/<id>/pin)
OPTION_AUTO = "Авто"
OPTION_DIRECT = "Напрямую"

GROUP_STATES = ["ok", "degraded", "down", "disabled"]
