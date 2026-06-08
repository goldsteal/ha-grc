# Gridcoin TUI add-on

Runs the `gridcoinresearch-tui` terminal UI inside Home Assistant and exposes it
through ingress, so you can open the full wallet TUI from the sidebar or embed
it in a dashboard.

## Modes

### `internal` (default)
The add-on launches the bundled TUI binary via [ttyd](https://github.com/tsl0922/ttyd)
and connects it to your wallet daemon over RPC.

| Option | Description |
| --- | --- |
| `mode` | `internal` |
| `rpc_host` | Daemon host, e.g. `192.0.2.10` |
| `rpc_port` | RPC port, e.g. `15715` |
| `rpc_user` | RPC username (e.g. `grc-tui`) |
| `rpc_password` | RPC password from `gridcoinresearch.conf` |
| `refresh` | TUI refresh interval, e.g. `10s` |

### `proxy`
Point the add-on at an **already-running** ttyd instance (for example the
`docker/` compose stack on another machine). The add-on becomes a thin ingress
reverse proxy, so you still get Home Assistant authentication.

| Option | Description |
| --- | --- |
| `mode` | `proxy` |
| `external_ttyd_url` | e.g. `http://192.0.2.20:7681` |

## Notes
- The wallet daemon must allow RPC from the add-on's IP (`rpcallowip` in
  `gridcoinresearch.conf`).
- The bundled binary is **amd64** only.
- After starting, click **OPEN WEB UI** or use the sidebar panel. To embed it in
  a dashboard, see the project README (uses `ha-addon-iframe-card`).
