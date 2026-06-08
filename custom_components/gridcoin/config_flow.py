"""Config flow for the Gridcoin integration."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import voluptuous as vol

from .const import (
    CONF_RPC_HOST,
    CONF_RPC_PASSWORD,
    CONF_RPC_PORT,
    CONF_RPC_USER,
    CONF_SCAN_INTERVAL,
    DEFAULT_PORT,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)
from .rpc import (
    GridcoinAuthError,
    GridcoinConnectionError,
    GridcoinRpcClient,
    GridcoinRpcError,
)

STEP_USER_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_RPC_HOST): str,
        vol.Required(CONF_RPC_PORT, default=DEFAULT_PORT): int,
        vol.Required(CONF_RPC_USER): str,
        vol.Required(CONF_RPC_PASSWORD): str,
    }
)


async def _validate(hass, data: dict[str, Any]) -> str:
    """Validate the credentials and return the daemon version string."""
    client = GridcoinRpcClient(
        async_get_clientsession(hass),
        data[CONF_RPC_HOST],
        data[CONF_RPC_PORT],
        data[CONF_RPC_USER],
        data[CONF_RPC_PASSWORD],
    )
    info = await client.call("getinfo")
    return (info or {}).get("version", "unknown")


class GridcoinConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Gridcoin."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            await self.async_set_unique_id(
                f"{user_input[CONF_RPC_HOST]}:{user_input[CONF_RPC_PORT]}"
            )
            self._abort_if_unique_id_configured()
            try:
                version = await _validate(self.hass, user_input)
            except GridcoinAuthError:
                errors["base"] = "invalid_auth"
            except (GridcoinConnectionError, GridcoinRpcError):
                errors["base"] = "cannot_connect"
            else:
                return self.async_create_entry(
                    title=f"Gridcoin ({user_input[CONF_RPC_HOST]})",
                    data=user_input,
                    description_placeholders={"version": version},
                )

        return self.async_show_form(
            step_id="user", data_schema=STEP_USER_SCHEMA, errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> OptionsFlow:
        return GridcoinOptionsFlow()


class GridcoinOptionsFlow(OptionsFlow):
    """Allow tuning the poll interval after setup."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        current = self.config_entry.options.get(
            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
        )
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SCAN_INTERVAL, default=current): vol.All(
                        int, vol.Range(min=10, max=3600)
                    )
                }
            ),
        )
