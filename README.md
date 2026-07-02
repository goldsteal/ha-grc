# Gridcoin for Home Assistant

Monitor a Gridcoin Research wallet in Home Assistant: balance/staking **sensors**
on your dashboard, plus the full **`gridcoin-tui`** wallet view embedded in the UI.

Everything talks to the wallet daemon over JSON-RPC (`gridcoinresearch.conf`).
This repo is verified against a daemon at `192.0.2.10:15715`.

## What's in the box

| Part | Folder | What it does |
| --- | --- | --- |
| **Integration** (HACS) | `custom_components/gridcoin/` | Sensors + binary sensors via RPC |
| **TUI add-on** (HAOS) | `gridcoin_tui/` | `gridcoin-tui` over ttyd + ingress |
| **Standalone container** | `docker/` | Same TUI for non-HAOS / external use |
| **Dashboard example** | `dashboards/gridcoin.yaml` | Cards wiring it together |

## 1. Sensors — the integration

Exposes: total balance, available balance, stake, immature (new mint), block
height, connections, difficulty, money supply, network & own stake weight,
estimated time to stake, staking efficiency, plus `staking` and `sync status`
binary sensors. (Magnitude is omitted — this wallet is a non-cruncher with no
beacon; it can be added later if a beacon is attached.)

**Install via HACS:** add this repo as a *custom repository* (type *Integration*),
install **Gridcoin Wallet**, restart HA, then **Settings → Devices & Services →
Add Integration → Gridcoin**. Enter host, port, RPC username and password.

**Manual:** copy `custom_components/gridcoin/` into your HA `config/custom_components/`
and restart.

> The daemon must permit RPC from Home Assistant — add HA's IP to `rpcallowip`
> in `gridcoinresearch.conf` and restart the daemon.

## 2. The wallet view — three ways to run the TUI

You asked for three deployment shapes; here they are:

1. **HAOS add-on, internal mode** *(recommended for HAOS)* — the
   add-on runs the bundled TUI binary itself.
   Add this repo under **Settings → Add-ons → Add-on Store → ⋮ → Repositories**,
   install **Gridcoin TUI**, set `mode: internal` + RPC details, start it. Open
   from the sidebar.

2. **HAOS add-on, proxy mode** — point the add-on at an *already-running* ttyd
   (e.g. the `docker/` stack elsewhere). Set `mode: proxy` and `external_ttyd_url`.
   You keep HA authentication via ingress.

3. **Standalone container** — for HA Container/Core, or to host the terminal on
   any box. See `docker/`:
   ```bash
   cd docker && cp .env.example .env   # set GRC_RPC_PASSWORD
   docker compose up -d --build        # serves ttyd on :7681
   ```

The second "whole wallet" view, the
[Gridcoin Web Client](https://github.com/rsparlin/Gridcoin-Web-Client) GUI, is
wired as an optional (commented) service in `docker/compose.yaml`.

## 3. Dashboard

Import `dashboards/gridcoin.yaml`. To embed the **ingress** add-on as a card,
install [`ha-addon-iframe-card`](https://github.com/lovelylain/ha-addon-iframe-card)
via HACS; for the standalone container, the included plain `iframe` card pointing
at `http://<host>:7681` works as-is.

### Add Gridcoin to your Overview

The integration's entities belong to a **Gridcoin** device, so they appear
automatically on the auto-generated **Overview** dashboard (a device card) with
no configuration. To add a compact **summary row** to any dashboard — including
your main Overview — drop in a few **badges** (Settings → Dashboards → your
dashboard → ⋮ → *Edit in YAML*, or the visual *Add badge* button):

```yaml
badges:
  - type: entity
    entity: sensor.gridcoin_wallet_total_balance
    name: GRC Balance
  - type: entity
    entity: binary_sensor.gridcoin_wallet_staking
    name: Staking
  - type: entity
    entity: sensor.gridcoin_wallet_estimated_time_to_stake
    name: Next Stake
```

The same block is included at the top of `dashboards/gridcoin.yaml`. Any of the
`sensor.gridcoin_wallet_*` entities work as badges or in a `glance`/`gauge`/
`entities` card.

## Notes & caveats

- The bundled `gridcoinresearch-tui` binary is **amd64**, statically linked Go.
- RPC credentials live in HA config / add-on options — keep your HA instance
  trusted; prefer a dedicated read-mostly RPC user.
