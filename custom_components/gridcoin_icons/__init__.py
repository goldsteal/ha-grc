"""Register the Gridcoin custom icon set with the Home Assistant frontend.

Loading ``grc-icons.js`` via :func:`add_extra_js_url` makes it load at
frontend startup, before the sidebar renders. That lets the ``grc:gridcoin``
icon resolve reliably in the sidebar — unlike a Lovelace dashboard resource,
which only loads once a dashboard has been opened and so leaves sidebar
panels blank on a fresh page load.
"""

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

DOMAIN = "gridcoin_icons"
_JS_URL = "/gridcoin_icons/grc-icons.js"
_JS_FILE = "grc-icons.js"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve grc-icons.js and load it at frontend startup."""
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                _JS_URL,
                str(Path(__file__).parent / _JS_FILE),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(hass, _JS_URL)
    return True
