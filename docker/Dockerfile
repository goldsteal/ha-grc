# Build gridcoinresearch-tui (gridcat, MIT) from source — see THIRD_PARTY_NOTICES.md.
ARG TUI_VERSION=v1.3.0

FROM golang:1.22-alpine AS tui-build
ARG TUI_VERSION
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "${TUI_VERSION}" \
        https://github.com/gridcat/gridcoinresearch-tui.git . \
 && CGO_ENABLED=0 GOTOOLCHAIN=local \
        go build -trimpath -ldflags="-s -w" -o /out/gridcoinresearch-tui .

FROM alpine:3.20

RUN apk add --no-cache ttyd

COPY --from=tui-build /out/gridcoinresearch-tui /usr/bin/gridcoinresearch-tui

ENV GRC_RPC_HOST=192.0.2.10 \
    GRC_RPC_PORT=15715 \
    GRC_RPC_USER=grc-tui \
    GRC_RPC_PASSWORD="" \
    REFRESH=10s

EXPOSE 7681

# GRC_RPC_PASSWORD is read from the environment by the TUI binary itself.
ENTRYPOINT ["sh", "-c", "exec ttyd --port 7681 --interface 0.0.0.0 --writable /usr/bin/gridcoinresearch-tui -rpc-host \"$GRC_RPC_HOST\" -rpc-port \"$GRC_RPC_PORT\" -rpc-user \"$GRC_RPC_USER\" -refresh \"$REFRESH\""]
