FROM python:3.12-alpine

ARG XRAY_VERSION=26.10.31
ARG TARGETARCH

RUN apk add --no-cache ca-certificates tzdata curl unzip \
 && case "${TARGETARCH:-$(uname -m)}" in \
      arm64|aarch64) A=arm64-v8a ;; \
      amd64|x86_64)  A=64 ;; \
      arm|armv7l)    A=arm32-v7a ;; \
      *) echo "unsupported arch" && exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/x.zip "https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-${A}.zip" \
 && mkdir -p /usr/local/share/xray \
 && unzip -q /tmp/x.zip xray geoip.dat geosite.dat -d /tmp/x \
 && mv /tmp/x/xray /usr/local/bin/xray && mv /tmp/x/*.dat /usr/local/share/xray/ \
 && chmod +x /usr/local/bin/xray && rm -rf /tmp/x /tmp/x.zip \
 && apk del unzip

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY panel /app/panel
WORKDIR /app
ENV PANEL_CONFIG=/data/panel.yaml PYTHONUNBUFFERED=1 TZ=Europe/Moscow
VOLUME /data
CMD ["python", "-m", "panel"]
