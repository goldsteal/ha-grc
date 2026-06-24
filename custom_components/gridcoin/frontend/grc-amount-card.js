/**
 * grc-amount-card — display a Gridcoin balance with an optional, configurable
 * hover conversion-stack (GRC · mGRC · µGRC · halförd).
 *
 * DESIGN DECISIONS (why):
 *  - Canonical unit is the **halförd** (1e-8 GRC), the protocol floor. There is
 *    no sub-halförd unit (no "nanoGRC", ever).
 *  - Amounts are **BigInt** counts of halförds. Gridcoin has no supply cap and
 *    is inflationary (~500M+ GRC ⇒ ~5e16 halförds), which exceeds
 *    Number.MAX_SAFE_INTEGER (~9.0e15). BigInt stays exact for any magnitude —
 *    the same reason ETH uses BigInt wei. Number would silently lose precision
 *    on totals / money-supply.
 *  - We parse the sensor's GRC **string**, not its float: HA states are strings
 *    and parseFloat reintroduces 0.1+0.2 binary drift. Decimal-string → integer
 *    halförds is exact.
 *  - Each denomination is just a fixed decimal-place shift of the halförd
 *    integer (GRC 8, mGRC 5, µGRC 2, halförd 0), so every conversion is an exact
 *    integer op. Standard notation rounds half-up; scientific notation rounds
 *    the mantissa to `decimals`+1 significant figures.
 *  - "halförd"/"hal"/"hals" and the Ǥ glyph are project display conventions, not
 *    official Gridcoin notation (ticker is GRC). The halförd pluralizes: 1 → hal
 *    (halförd), otherwise hals (halförds); GRC/mGRC/µGRC tickers don't.
 *
 * Example card config:
 *   type: custom:grc-amount-card
 *   entity: sensor.gridcoin_wallet_total_balance
 *   name: Total balance
 *   primary: GRC          # the big number's unit
 *   hover: true           # show conversion stack on hover
 *   denoms: [GRC, mGRC, µGRC, halförd]   # rows in the stack
 *   active: GRC           # highlighted row (defaults to `primary`)
 *   decimals: 8           # max fractional / mantissa digits
 *   scientific: false     # true → scientific notation (e.g. 1.2005e9)
 *   glyph: true           # true → Ǥ/mǤ/hal glyphs; false → GRC/mGRC ticker text
 *   icon: grc:gridcoin    # optional logo on the base (non-hover) line; '' = none
 */

// ── Currency model (BigInt halförds) ─────────────────────────────────────────
const GRC_GLYPH = 'Ǥ';

// `dec` = decimal places when one halförd integer is expressed in this unit.
// `*One` = singular forms, used when the value is exactly 1 of that unit.
const DENOMINATIONS = [
  { id: 'GRC',     label: 'GRC',      short: 'Ǥ',    dec: 8 },
  { id: 'mGRC',    label: 'mGRC',     short: 'mǤ',   dec: 5 },
  { id: 'µGRC',    label: 'µGRC',     short: 'µǤ',   dec: 2 },
  { id: 'halförd', label: 'halförds', short: 'hals', dec: 0,
    labelOne: 'halförd', shortOne: 'hal' },
];

/** Exact decimal-string GRC → BigInt halförds (1e-8). null if not a number. */
function grcToHalfords(grcStr) {
  let s = String(grcStr).trim();
  if (s === '' || s === 'unknown' || s === 'unavailable') return null;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return null;
  let [int = '0', frac = ''] = s.split('.');
  frac = (frac + '00000000').slice(0, 8); // pad/truncate to 8 dp
  const h = BigInt(int || '0') * 100_000_000n + BigInt(frac || '0');
  return neg ? -h : h;
}

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Round a BigInt division half-up (away from zero on the .5 boundary). */
function roundDiv(n, d) {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = a / d;
  const rounded = (a % d) * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** Place a decimal point `dec` digits from the right of a BigInt, trim zeros. */
function placeDecimal(n, dec) {
  const neg = n < 0n;
  let s = (neg ? -n : n).toString();
  if (dec === 0) return (neg ? '-' : '') + group(s);
  s = s.padStart(dec + 1, '0');
  const int = group(s.slice(0, -dec));
  const frac = s.slice(-dec).replace(/0+$/, '');
  return (neg ? '-' : '') + (frac ? `${int}.${frac}` : int);
}

/** Scientific notation of (BigInt halförds / 10^dec), mantissa ≤ `sig` digits. */
function toScientific(halfords, dec, sig) {
  if (halfords === 0n) return '0';
  const neg = halfords < 0n;
  let digits = (neg ? -halfords : halfords).toString();
  let exp = digits.length - 1 - dec;
  if (sig && digits.length > sig) {
    const roundUp = digits.charCodeAt(sig) - 48 >= 5;
    let rs = (BigInt(digits.slice(0, sig)) + (roundUp ? 1n : 0n)).toString();
    if (rs.length > sig) { exp += 1; rs = rs.slice(0, sig); } // carry, e.g. 99→100
    digits = rs;
  }
  const frac = digits.slice(1).replace(/0+$/, '');
  return `${neg ? '-' : ''}${digits[0]}${frac ? '.' + frac : ''}e${exp}`;
}

/** Format BigInt halförds in a denomination. */
function formatHalfords(halfords, denom, { maxDecimals = 8, scientific = false } = {}) {
  if (scientific) return toScientific(halfords, denom.dec, maxDecimals + 1);
  const show = Math.min(maxDecimals, denom.dec);
  const scaled = denom.dec > show
    ? roundDiv(halfords, 10n ** BigInt(denom.dec - show))
    : halfords;
  return placeDecimal(scaled, show);
}

/** Singular/plural unit text for a denom at a given exact quantity. */
function unitText(denom, halfords, glyph) {
  const isOne = halfords === 10n ** BigInt(denom.dec);
  if (glyph) return isOne && denom.shortOne ? denom.shortOne : denom.short;
  return isOne && denom.labelOne ? denom.labelOne : denom.label;
}

function conversionStack(halfords, opts = {}) {
  const { denoms, active, maxDecimals = 8, scientific = false, glyph = true } = opts;
  const ids = denoms || DENOMINATIONS.map((d) => d.id);
  return DENOMINATIONS.filter((d) => ids.includes(d.id)).map((d) => ({
    id: d.id,
    unit: unitText(d, halfords, glyph),
    formatted: formatHalfords(halfords, d, { maxDecimals, scientific }),
    active: d.id === active,
  }));
}

// ── Card ─────────────────────────────────────────────────────────────────────
class GrcAmountCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error('grc-amount-card: "entity" is required');
    this._config = {
      primary: 'GRC',
      hover: true,
      denoms: DENOMINATIONS.map((d) => d.id),
      decimals: 8,
      scientific: false,
      glyph: true,
      icon: '',
      ...config,
    };
    this._config.active = this._config.active || this._config.primary;
    this._rendered = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  _update() {
    const cfg = this._config;
    const st = this._hass && this._hass.states[cfg.entity];
    const halfords = st ? grcToHalfords(st.state) : null;
    if (halfords === null) {
      this.innerHTML = `<ha-card><div class="warn">${cfg.entity}: ${st ? st.state : 'unknown entity'}</div></ha-card>`;
      this._rendered = false;
      return;
    }
    const name = cfg.name || st.attributes.friendly_name || cfg.entity;
    const primary = DENOMINATIONS.find((d) => d.id === cfg.primary) || DENOMINATIONS[0];
    const big = formatHalfords(halfords, primary, { maxDecimals: cfg.decimals, scientific: cfg.scientific });
    const unit = unitText(primary, halfords, cfg.glyph);

    const stackHtml = (cfg.hover
      ? conversionStack(halfords, {
          denoms: cfg.denoms, active: cfg.active,
          maxDecimals: cfg.decimals, scientific: cfg.scientific, glyph: cfg.glyph,
        })
      : []
    ).map((r) =>
      `<div class="row${r.active ? ' active' : ''}">
         <span class="u">${r.unit}</span>
         <span class="v">${r.formatted}</span>
       </div>`).join('');

    if (!this._rendered) {
      this.innerHTML = `
        <ha-card>
          <div class="amount">
            <div class="label"></div>
            <div class="value">${cfg.icon ? `<ha-icon class="ic" icon="${cfg.icon}"></ha-icon>` : ''}<span class="num"></span> <span class="unit"></span></div>
            ${cfg.hover ? `<div class="stack"><div class="rows"></div>
              <div class="foot">1 ${GRC_GLYPH} = 100,000,000 halförds</div></div>` : ''}
          </div>
        </ha-card>
        <style>
          .amount { position: relative; padding: 16px; }
          .label { color: var(--secondary-text-color); font-size: .85em; }
          .value { font-size: 1.6em; font-weight: 500; }
          .ic { --mdc-icon-size: 1em; color: var(--primary-color); margin-right: 4px; vertical-align: -2px; }
          .unit { color: var(--secondary-text-color); font-size: .7em; }
          .stack {
            position: absolute; top: 100%; left: 12px; z-index: 9; min-width: 180px;
            background: var(--card-background-color, #fff);
            border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px;
            box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.25));
            padding: 8px 10px; opacity: 0; visibility: hidden;
            transform: translateY(-4px); transition: opacity .12s, transform .12s;
          }
          .amount:hover .stack { opacity: 1; visibility: visible; transform: translateY(0); }
          .row { display: flex; justify-content: space-between; gap: 16px; font-size: .95em;
                 padding: 2px 0; font-variant-numeric: tabular-nums; }
          .row.active { font-weight: 600; color: var(--primary-color); }
          .row .u { color: var(--secondary-text-color); }
          .row.active .u { color: var(--primary-color); }
          .foot { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--divider-color, #eee);
                  color: var(--secondary-text-color); font-size: .75em; }
          .warn { padding: 16px; color: var(--error-color, #c00); }
        </style>`;
      this._rendered = true;
    }

    this.querySelector('.label').textContent = name;
    this.querySelector('.num').textContent = big;
    this.querySelector('.unit').textContent = unit;
    const rows = this.querySelector('.rows');
    if (rows) rows.innerHTML = stackHtml;
  }

  getCardSize() { return 1; }

  static getConfigElement() {
    return document.createElement('grc-amount-card-editor');
  }

  static getStubConfig() {
    return { entity: 'sensor.gridcoin_wallet_total_balance', primary: 'GRC', hover: true };
  }
}

customElements.define('grc-amount-card', GrcAmountCard);

// ── GUI config editor (ha-form based) ────────────────────────────────────────
const DENOM_OPTIONS = DENOMINATIONS.map((d) => ({ value: d.id, label: d.id }));

const EDITOR_SCHEMA = [
  { name: 'entity', required: true, selector: { entity: { domain: 'sensor' } } },
  { name: 'name', selector: { text: {} } },
  { name: 'icon', selector: { icon: {} } },
  { type: 'grid', schema: [
    { name: 'primary', selector: { select: { mode: 'dropdown', options: DENOM_OPTIONS } } },
    { name: 'active', selector: { select: { mode: 'dropdown', options: DENOM_OPTIONS } } },
  ] },
  { name: 'denoms', selector: { select: { multiple: true, options: DENOM_OPTIONS } } },
  { type: 'grid', schema: [
    { name: 'decimals', selector: { number: { min: 0, max: 8, mode: 'box' } } },
    { name: 'hover', selector: { boolean: {} } },
    { name: 'scientific', selector: { boolean: {} } },
    { name: 'glyph', selector: { boolean: {} } },
  ] },
];

const EDITOR_LABELS = {
  entity: 'Entity (GRC amount)',
  name: 'Name (optional)',
  icon: 'Base icon (e.g. grc:gridcoin)',
  primary: 'Primary unit (big number)',
  active: 'Highlighted unit',
  denoms: 'Units in hover stack',
  decimals: 'Max decimals',
  hover: 'Show hover conversions',
  scientific: 'Scientific notation',
  glyph: 'Use Ǥ glyph',
};

class GrcAmountCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => EDITOR_LABELS[s.name] || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: ev.detail.value } }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA;
    this._form.data = this._config;
  }
}

customElements.define('grc-amount-card-editor', GrcAmountCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grc-amount-card',
  name: 'Gridcoin Amount',
  description: 'A Gridcoin balance with an optional hover conversion-stack (GRC · mGRC · µGRC · halförd).',
});
