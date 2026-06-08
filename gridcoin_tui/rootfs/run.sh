#!/usr/bin/env bash
# shellcheck disable=SC1091
source /usr/lib/bashio/bashio.sh

MODE="$(bashio::config 'mode')"
PORT=7681

if [ "${MODE}" = "proxy" ]; then
    # ---- proxy mode: reverse-proxy to an already-running ttyd instance ----
    EXTERNAL="$(bashio::config 'external_ttyd_url')"
    if [ -z "${EXTERNAL}" ]; then
        bashio::exit.nok "mode=proxy requires 'external_ttyd_url' to be set"
    fi
    bashio::log.info "Proxying Gridcoin TUI from ${EXTERNAL}"

    cat > /etc/nginx/http.d/default.conf <<EOF
server {
    listen ${PORT};
    location / {
        proxy_pass ${EXTERNAL};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
EOF
    exec nginx -g 'daemon off;'
fi

# ---- internal mode: run the TUI under ttyd inside the add-on ----
RPC_HOST="$(bashio::config 'rpc_host')"
RPC_PORT="$(bashio::config 'rpc_port')"
RPC_USER="$(bashio::config 'rpc_user')"
REFRESH="$(bashio::config 'refresh')"
export GRC_RPC_PASSWORD="$(bashio::config 'rpc_password')"

bashio::log.info "Starting Gridcoin TUI against ${RPC_HOST}:${RPC_PORT} (user ${RPC_USER})"

# --writable lets the browser send keystrokes to the interactive TUI.
exec ttyd \
    --port "${PORT}" \
    --interface 0.0.0.0 \
    --writable \
    --client-option fontSize=14 \
    --client-option 'theme={"background":"#0b0e14"}' \
    /usr/bin/gridcoinresearch-tui \
        -rpc-host "${RPC_HOST}" \
        -rpc-port "${RPC_PORT}" \
        -rpc-user "${RPC_USER}" \
        -refresh "${REFRESH}"
