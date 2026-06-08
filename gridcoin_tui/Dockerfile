ARG BUILD_FROM
FROM ${BUILD_FROM}

# ttyd serves the terminal over HTTP/WebSocket; nginx is used as a reverse
# proxy when the add-on runs in "proxy" mode (pointing at an external ttyd).
RUN apk add --no-cache ttyd nginx

COPY rootfs /

RUN chmod +x /usr/bin/gridcoinresearch-tui /run.sh

CMD ["/run.sh"]
