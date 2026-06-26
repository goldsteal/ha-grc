"""Sensor platform for the Gridcoin integration."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import PERCENTAGE, EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import GridcoinConfigEntry
from .entity import GridcoinEntity

GRC = "GRC"


def _nested(data: dict[str, Any], *path: str) -> Any:
    """Safely walk a nested dict, returning None on any missing key."""
    cur: Any = data
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _total_balance(data: dict[str, Any]) -> float:
    """Spendable balance plus the maturing staked mint.

    Gridcoin's ``getinfo`` reports the immature staked coins under *both*
    ``stake`` and ``newmint`` (the two fields are identical while staking), so
    summing all three double-counts that pool. Take the larger of the two to
    avoid it. Matches the wallet overview's Total = Available + Staking.
    """
    balance = _nested(data, "info", "balance")
    stake = _nested(data, "info", "stake")
    newmint = _nested(data, "info", "newmint")
    immature = max(
        (v for v in (stake, newmint) if isinstance(v, (int, float))),
        default=0,
    )
    return (balance if isinstance(balance, (int, float)) else 0) + immature


@dataclass(frozen=True, kw_only=True)
class GridcoinSensorDescription(SensorEntityDescription):
    """Describes a Gridcoin sensor."""

    value_fn: Callable[[dict[str, Any]], Any]


SENSORS: tuple[GridcoinSensorDescription, ...] = (
    GridcoinSensorDescription(
        key="balance",
        translation_key="balance",
        native_unit_of_measurement=GRC,
        icon="mdi:cash",
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=2,
        value_fn=lambda d: _nested(d, "info", "balance"),
    ),
    GridcoinSensorDescription(
        key="stake",
        translation_key="stake",
        native_unit_of_measurement=GRC,
        icon="mdi:lock-clock",
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=2,
        value_fn=lambda d: _nested(d, "info", "stake"),
    ),
    GridcoinSensorDescription(
        key="newmint",
        translation_key="newmint",
        native_unit_of_measurement=GRC,
        icon="mdi:cash-plus",
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=2,
        value_fn=lambda d: _nested(d, "info", "newmint"),
    ),
    GridcoinSensorDescription(
        key="total_balance",
        translation_key="total_balance",
        native_unit_of_measurement=GRC,
        icon="mdi:wallet",
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=2,
        value_fn=_total_balance,
    ),
    GridcoinSensorDescription(
        key="block_height",
        translation_key="block_height",
        icon="mdi:cube-outline",
        state_class=SensorStateClass.TOTAL_INCREASING,
        value_fn=lambda d: _nested(d, "info", "blocks"),
    ),
    GridcoinSensorDescription(
        key="connections",
        translation_key="connections",
        icon="mdi:lan-connect",
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: _nested(d, "info", "connections"),
    ),
    GridcoinSensorDescription(
        key="difficulty",
        translation_key="difficulty",
        icon="mdi:chart-bell-curve",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=3,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: _nested(d, "info", "difficulty", "current"),
    ),
    GridcoinSensorDescription(
        key="money_supply",
        translation_key="money_supply",
        native_unit_of_measurement=GRC,
        icon="mdi:cash-multiple",
        state_class=SensorStateClass.TOTAL,
        suggested_display_precision=0,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: _nested(d, "info", "moneysupply"),
    ),
    GridcoinSensorDescription(
        key="net_stake_weight",
        translation_key="net_stake_weight",
        icon="mdi:scale-balance",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: _nested(d, "mining", "netstakeweight"),
    ),
    GridcoinSensorDescription(
        key="my_stake_weight",
        translation_key="my_stake_weight",
        native_unit_of_measurement=GRC,
        icon="mdi:weight",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2,
        value_fn=lambda d: _nested(d, "mining", "stakeweight", "valuesum"),
    ),
    GridcoinSensorDescription(
        key="time_to_stake",
        translation_key="time_to_stake",
        native_unit_of_measurement=UnitOfTime.DAYS,
        icon="mdi:timer-sand",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=2,
        value_fn=lambda d: _nested(d, "mining", "time-to-stake_days"),
    ),
    GridcoinSensorDescription(
        key="staking_efficiency",
        translation_key="staking_efficiency",
        native_unit_of_measurement=PERCENTAGE,
        icon="mdi:speedometer",
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=1,
        entity_category=EntityCategory.DIAGNOSTIC,
        value_fn=lambda d: _nested(d, "mining", "staking_efficiency"),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: GridcoinConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Gridcoin sensors from a config entry."""
    coordinator = entry.runtime_data
    async_add_entities(
        GridcoinSensor(coordinator, description) for description in SENSORS
    )


class GridcoinSensor(GridcoinEntity, SensorEntity):
    """A single value pulled from the daemon snapshot."""

    entity_description: GridcoinSensorDescription

    def __init__(self, coordinator, description: GridcoinSensorDescription) -> None:
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self.coordinator.data)
