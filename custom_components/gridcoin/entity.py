"""Shared entity base for the Gridcoin integration."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTRIBUTION, CONF_RPC_HOST, DOMAIN
from .coordinator import GridcoinCoordinator


class GridcoinEntity(CoordinatorEntity[GridcoinCoordinator]):
    """Base entity tying all sensors to a single wallet device."""

    _attr_has_entity_name = True
    _attr_attribution = ATTRIBUTION

    def __init__(self, coordinator: GridcoinCoordinator, key: str) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{key}"
        version = coordinator.data.get("info", {}).get("version")
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, coordinator.entry.entry_id)},
            name="Gridcoin Wallet",
            manufacturer="Gridcoin",
            model="Gridcoin Research daemon",
            sw_version=version,
            configuration_url=f"http://{coordinator.entry.data[CONF_RPC_HOST]}",
        )
