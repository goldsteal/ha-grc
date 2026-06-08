FROM alpine:3.20

RUN apk add --no-cache ttyd

COPY gridcoinresearch-tui /usr/bin/gridcoinresearch-tui
RUN chmod +x /usr/bin/gridcoinresearch-tui

ENV GRC_RPC_HOST=192.0.2.10 \
    GRC_RPC_PORT=15715 \
    GRC_RPC_USER=grc-tui \
    GRC_RPC_PASSWORD="" \
    REFRESH=10s

EXPOSE 7681

# GRC_RPC_PASSWORD is read from the environment by the TUI binary itself.
ENTRYPOINT ["sh", "-c", "exec ttyd --port 7681 --interface 0.0.0.0 --writable /usr/bin/gridcoinresearch-tui -rpc-host \"$GRC_RPC_HOST\" -rpc-port \"$GRC_RPC_PORT\" -rpc-user \"$GRC_RPC_USER\" -refresh \"$REFRESH\""]
