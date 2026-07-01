"""The Gridcoin Wallet integration."""

from __future__ import annotations

import hashlib
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .coordinator import GridcoinCoordinator

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

# Frontend assets served at startup so they load before the sidebar/cards
# render: the grc: custom icon set and the grc-amount-card Lovelace card.
_FRONTEND_URL = "/gridcoin_frontend"
_FRONTEND_MODULES = ("grc-icons.js", "grc-amount-card.js")

type GridcoinConfigEntry = ConfigEntry[GridcoinCoordinator]


def _module_versions(directory: Path) -> dict[str, str]:
    """Short content hashes for cache-busting the frontend modules.

    The hash changes only when a file's bytes change, so browsers refetch a
    module exactly when it has been updated (after an HA restart re-registers
    the URL) — no manual version bumps and no per-user hard-refresh.
    """
    versions: dict[str, str] = {}
    for module in _FRONTEND_MODULES:
        data = (directory / module).read_bytes()
        versions[module] = hashlib.sha256(data).hexdigest()[:8]
    return versions


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register Gridcoin frontend assets once, at startup."""
    if hass.data.get(f"{__name__}.frontend"):
        return True
    hass.data[f"{__name__}.frontend"] = True

    frontend_dir = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(_FRONTEND_URL, str(frontend_dir), cache_headers=False)]
    )
    versions = await hass.async_add_executor_job(_module_versions, frontend_dir)
    for module in _FRONTEND_MODULES:
        add_extra_js_url(hass, f"{_FRONTEND_URL}/{module}?v={versions[module]}")
    return True


async def async_setup_entry(hass: HomeAssistant, entry: GridcoinConfigEntry) -> bool:
    """Set up Gridcoin from a config entry."""
    coordinator = GridcoinCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: GridcoinConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload_entry(hass: HomeAssistant, entry: GridcoinConfigEntry) -> None:
    """Reload the entry when its options change (e.g. scan interval)."""
    await hass.config_entries.async_reload(entry.entry_id)
