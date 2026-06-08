"""Data update coordinator for the Gridcoin integration."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_RPC_HOST,
    CONF_RPC_PASSWORD,
    CONF_RPC_PORT,
    CONF_RPC_USER,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    RPC_BEACONSTATUS,
    RPC_GETINFO,
    RPC_GETMININGINFO,
    RPC_GETWALLETINFO,
)
from .rpc import (
    GridcoinAuthError,
    GridcoinConnectionError,
    GridcoinRpcClient,
    GridcoinRpcError,
)

_LOGGER = logging.getLogger(__name__)


class GridcoinCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Polls the daemon and exposes a merged snapshot to all entities."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        scan_interval = entry.options.get(
            CONF_SCAN_INTERVAL,
            entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
        )
        self.client = GridcoinRpcClient(
            async_get_clientsession(hass),
            entry.data[CONF_RPC_HOST],
            entry.data[CONF_RPC_PORT],
            entry.data[CONF_RPC_USER],
            entry.data[CONF_RPC_PASSWORD],
        )
        # ``beaconstatus`` errors on non-cruncher wallets; remember that so we
        # stop polling a method that will never succeed for this wallet.
        self._beacon_supported = True
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            info = await self.client.call(RPC_GETINFO)
            wallet = await self.client.call(RPC_GETWALLETINFO)
            mining = await self.client.call(RPC_GETMININGINFO)
            beacon = await self._async_fetch_beacon()
        except GridcoinAuthError as err:
            # Authentication problems are not recoverable by retrying.
            raise UpdateFailed(f"Authentication failed: {err}") from err
        except (GridcoinConnectionError, GridcoinRpcError) as err:
            raise UpdateFailed(str(err)) from err

        return {
            "info": info or {},
            "wallet": wallet or {},
            "mining": mining or {},
            "beacon": beacon,
        }

    async def _async_fetch_beacon(self) -> dict[str, Any] | None:
        """Return beacon status, or ``None`` for wallets without a beacon."""
        if not self._beacon_supported:
            return None
        try:
            return await self.client.call(RPC_BEACONSTATUS)
        except GridcoinRpcError as err:
            # e.g. "No beacon for non-cruncher." — stop asking.
            _LOGGER.debug("Disabling beacon polling: %s", err)
            self._beacon_supported = False
            return None
