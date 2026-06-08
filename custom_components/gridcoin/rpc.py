"""Minimal async JSON-RPC client for the Gridcoin Research daemon."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp

_LOGGER = logging.getLogger(__name__)


class GridcoinRpcError(Exception):
    """Raised when the daemon returns a JSON-RPC error."""


class GridcoinAuthError(GridcoinRpcError):
    """Raised when authentication against the daemon fails."""


class GridcoinConnectionError(GridcoinRpcError):
    """Raised when the daemon cannot be reached."""


class GridcoinRpcClient:
    """Tiny JSON-RPC 1.0 client matching the Bitcoin/Gridcoin RPC dialect."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        host: str,
        port: int,
        username: str,
        password: str,
        *,
        timeout: float = 10.0,
    ) -> None:
        self._session = session
        self._url = f"http://{host}:{port}/"
        self._auth = aiohttp.BasicAuth(username, password)
        self._timeout = aiohttp.ClientTimeout(total=timeout)

    async def call(self, method: str, params: list[Any] | None = None) -> Any:
        """Invoke a single RPC method and return its ``result`` payload."""
        payload = {
            "jsonrpc": "1.0",
            "id": "ha-gridcoin",
            "method": method,
            "params": params or [],
        }
        try:
            async with self._session.post(
                self._url,
                json=payload,
                auth=self._auth,
                timeout=self._timeout,
                headers={"content-type": "text/plain;"},
            ) as resp:
                if resp.status in (401, 403):
                    raise GridcoinAuthError("Invalid RPC username or password")
                # The daemon returns 500 with a JSON error body for RPC-level
                # errors, so parse the body before trusting the status code.
                data = await resp.json(content_type=None)
        except aiohttp.ClientResponseError as err:
            if err.status in (401, 403):
                raise GridcoinAuthError("Invalid RPC username or password") from err
            raise GridcoinConnectionError(str(err)) from err
        except (aiohttp.ClientError, TimeoutError) as err:
            raise GridcoinConnectionError(str(err)) from err

        if (error := data.get("error")) is not None:
            raise GridcoinRpcError(
                f"{method}: {error.get('message', error)} (code {error.get('code')})"
            )
        return data.get("result")
