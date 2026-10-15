"""Точка входа: python -m panel"""
import os
import shutil

import uvicorn

from .app import ASSET_DIR, CFG, app

BUNDLED_GEO = os.environ.get("XRAY_BUNDLED_GEO", "/usr/local/share/xray")


def main():
    os.makedirs(ASSET_DIR, exist_ok=True)
    for name in ("geoip.dat", "geosite.dat"):
        dst = os.path.join(ASSET_DIR, name)
        src = os.path.join(BUNDLED_GEO, name)
        if not os.path.exists(dst) and os.path.exists(src):
            shutil.copy(src, dst)
    uvicorn.run(app, host=CFG["listen"], port=int(CFG["port"]), log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
