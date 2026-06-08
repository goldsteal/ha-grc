"""Binary sensor platform for the Gridcoin integration."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import GridcoinConfigEntry
from .entity import GridcoinEntity


@dataclass(frozen=True, kw_only=True)
class GridcoinBinarySensorDescription(BinarySensorEntityDescription):
    """Describes a Gridcoin binary sensor."""

    value_fn: Callable[[dict[str, Any]], bool | None]


BINARY_SENSORS: tuple[GridcoinBinarySensorDescription, ...] = (
    GridcoinBinarySensorDescription(
        key="staking",
        translation_key="staking",
        icon="mdi:pickaxe",
        value_fn=lambda d: d.get("wallet", {}).get("staking"),
    ),
    GridcoinBinarySensorDescription(
        key="in_sync",
        translation_key="in_sync",
        device_class=BinarySensorDeviceClass.PROBLEM,
        entity_category=EntityCategory.DIAGNOSTIC,
        # PROBLEM is "on" when there IS a problem, i.e. NOT in sync.
        value_fn=lambda d: (
            None
            if (v := d.get("info", {}).get("in_sync")) is None
            else not bool(v)
        ),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GridcoinConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Gridcoin binary sensors from a config entry."""
    coordinator = entry.runtime_data
    async_add_entities(
        GridcoinBinarySensor(coordinator, description)
        for description in BINARY_SENSORS
    )


class GridcoinBinarySensor(GridcoinEntity, BinarySensorEntity):
    """Boolean state derived from the daemon snapshot."""

    entity_description: GridcoinBinarySensorDescription

    def __init__(
        self, coordinator, description: GridcoinBinarySensorDescription
    ) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        return self.entity_description.value_fn(self.coordinator.data)
