ARG BUILD_FROM
ARG TUI_VERSION=v1.3.0

# Build gridcoinresearch-tui (gridcat, MIT) from source for the target arch.
# The HA add-on builder runs this per architecture, so a native `go build`
# produces the right binary. See THIRD_PARTY_NOTICES.md.
FROM golang:1.22-alpine AS tui-build
ARG TUI_VERSION
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "${TUI_VERSION}" \
        https://github.com/gridcat/gridcoinresearch-tui.git . \
 && CGO_ENABLED=0 GOTOOLCHAIN=local \
        go build -trimpath -ldflags="-s -w" -o /out/gridcoinresearch-tui .

FROM ${BUILD_FROM}

# ttyd serves the terminal over HTTP/WebSocket; nginx is used as a reverse
# proxy when the add-on runs in "proxy" mode (pointing at an external ttyd).
RUN apk add --no-cache ttyd nginx

COPY rootfs /
COPY --from=tui-build /out/gridcoinresearch-tui /usr/bin/gridcoinresearch-tui

RUN chmod +x /usr/bin/gridcoinresearch-tui /run.sh

CMD ["/run.sh"]
