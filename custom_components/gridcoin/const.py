"""Constants for the Gridcoin integration."""

from __future__ import annotations

DOMAIN = "gridcoin"

CONF_RPC_HOST = "host"
CONF_RPC_PORT = "port"
CONF_RPC_USER = "username"
CONF_RPC_PASSWORD = "password"
CONF_SCAN_INTERVAL = "scan_interval"

DEFAULT_PORT = 15715
DEFAULT_SCAN_INTERVAL = 60  # seconds

# JSON-RPC methods the coordinator merges into a single data snapshot.
RPC_GETINFO = "getinfo"
RPC_GETWALLETINFO = "getwalletinfo"
RPC_GETMININGINFO = "getmininginfo"
RPC_BEACONSTATUS = "beaconstatus"

ATTRIBUTION = "Data provided by a local Gridcoin Research daemon"
