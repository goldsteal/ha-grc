"""The Gridcoin Wallet integration."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType
from homeassistant.setup import async_when_setup

from .coordinator import GridcoinCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

# Frontend assets served at startup. The grc: icon set must load globally
# before the sidebar renders, so it goes via add_extra_js_url. The card module
# is delivered *only* as a Lovelace resource (see _async_register_card_resource):
# only Lovelace resources are awaited before a dashboard renders. Listing the
# card in add_extra_js_url *as well* set up a second, un-awaited delivery of the
# same module; the two races interacted so the card intermittently ended up
# undefined at render time ("Configuration error" cards). One awaited delivery
# is both sufficient and race-free.
_FRONTEND_URL = "/gridcoin_frontend"
_CARD_MODULE = "grc-amount-card.js"
# Hashed for cache-busting; only grc-icons.js is injected via add_extra_js_url.
_FRONTEND_MODULES = ("grc-icons.js", _CARD_MODULE)
_EXTRA_JS_MODULES = ("grc-icons.js",)

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
    for module in _EXTRA_JS_MODULES:
        add_extra_js_url(hass, f"{_FRONTEND_URL}/{module}?v={versions[module]}")

    # Register the card as a Lovelace resource (awaited before render) once the
    # lovelace component is available. Same URL as the add_extra_js_url entry,
    # so the browser loads the ES module only once.
    card_url = f"{_FRONTEND_URL}/{_CARD_MODULE}?v={versions[_CARD_MODULE]}"

    async def _register(hass: HomeAssistant, _component: str) -> None:
        await _async_register_card_resource(
            hass, f"{_FRONTEND_URL}/{_CARD_MODULE}", card_url
        )

    async_when_setup(hass, "lovelace", _register)
    return True


async def _async_register_card_resource(
    hass: HomeAssistant, url_path: str, url: str
) -> None:
    """Ensure a Lovelace 'module' resource for the card exists (storage mode).

    No-op in YAML-mode Lovelace (resources are immutable there); the
    add_extra_js_url fallback still delivers the card in that case.
    """
    lovelace = hass.data.get("lovelace")
    resources = getattr(lovelace, "resources", None)
    if resources is None or not hasattr(resources, "async_create_item"):
        return
    try:
        # Ensure the collection is loaded before inspecting it.
        if getattr(resources, "loaded", True) is False:
            await resources.async_load()
            resources.loaded = True
        existing = next(
            (
                item
                for item in resources.async_items()
                if str(item.get("url", "")).split("?")[0] == url_path
            ),
            None,
        )
        if existing is None:
            await resources.async_create_item({"res_type": "module", "url": url})
            _LOGGER.debug("Registered grc-amount-card Lovelace resource: %s", url)
        elif existing.get("url") != url:
            await resources.async_update_item(
                existing["id"], {"res_type": "module", "url": url}
            )
            _LOGGER.debug("Updated grc-amount-card Lovelace resource: %s", url)
    except Exception:  # noqa: BLE001 - defensive across Lovelace API changes
        _LOGGER.warning(
            "Could not register grc-amount-card as a Lovelace resource; "
            "falling back to add_extra_js_url",
            exc_info=True,
        )


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
