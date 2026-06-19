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
 *    integer op. Decimal notation rounds half-up; the exponential notations
 *    (e / ×10ⁿ / engineering) round the mantissa to `decimals`+1 sig figures.
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
 *   notation: decimal     # decimal | scientific_e (1.2005e9) |
 *                         # scientific_pow (1.2005 × 10⁹) | engineering
 *                         # (1.2005 × 10⁹, exponent a multiple of 3).
 *                         # Legacy `scientific: true` still maps to scientific_e.
 *   plural: auto          # halförd form: auto (hal/hals) | singular | plural
 *   number_format: language  # decimal/thousands separators; follows the user's
 *                            # HA setting. Override by separator pattern:
 *                            # comma_decimal (1,234.56; US/UK) |
 *                            # decimal_comma (1.234,56; Spain/Germany/Italy) |
 *                            # space_comma (1 234,56; France/Sweden) |
 *                            # none (1234.56)
 *   # how the unit is shown — any combination of glyph / ticker / icon, set
 *   # independently for the base line and the hover rows:
 *   base_units: [icon, glyph]     # logo + Ǥ on the big number
 *   hover_units: [glyph]          # Ǥ/mǤ/hal text in the stack
 *   icon: grc:gridcoin            # the logo used by the 'icon' option
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

// Number formatting follows locale conventions: a group (thousands) separator
// and a decimal separator. Mirrors Home Assistant's own NumberFormat setting
// (hass.locale.number_format), so decimal-comma locales such as Spain, Germany,
// or Italy show 1.234,56 with no config.
const SEP_DEFAULT = { group: ',', decimal: '.' };
const SEP_FIXED = {
  comma_decimal: { group: ',', decimal: '.' },       // 1,234.56
  decimal_comma: { group: '.', decimal: ',' },       // 1.234,56
  space_comma: { group: ' ', decimal: ',' },         // 1 234,56
  none: { group: '', decimal: '.' },                 // 1234.56
};

/** Resolve {group, decimal} from a `number_format` option, falling back to the
 *  user's Home Assistant locale (and then Intl) when set to 'language'. */
function resolveSeparators(format, hass) {
  if (SEP_FIXED[format]) return SEP_FIXED[format];
  const haFmt = hass && hass.locale && hass.locale.number_format;
  if (SEP_FIXED[haFmt]) return SEP_FIXED[haFmt];
  const lang = (hass && hass.locale && hass.locale.language) || undefined;
  try {
    const parts = new Intl.NumberFormat(lang).formatToParts(1111111.1);
    const pick = (t, d) => (parts.find((p) => p.type === t) || {}).value || d;
    return { group: pick('group', ','), decimal: pick('decimal', '.') };
  } catch {
    return SEP_DEFAULT;
  }
}

const group = (s, g = ',') => (g ? s.replace(/\B(?=(\d{3})+(?!\d))/g, g) : s);

/** Round a BigInt division half-up (away from zero on the .5 boundary). */
function roundDiv(n, d) {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const q = a / d;
  const rounded = (a % d) * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** Place a decimal point `dec` digits from the right of a BigInt, trim zeros. */
function placeDecimal(n, dec, sep = SEP_DEFAULT) {
  const neg = n < 0n;
  let s = (neg ? -n : n).toString();
  if (dec === 0) return (neg ? '-' : '') + group(s, sep.group);
  s = s.padStart(dec + 1, '0');
  const int = group(s.slice(0, -dec), sep.group);
  const frac = s.slice(-dec).replace(/0+$/, '');
  return (neg ? '-' : '') + (frac ? `${int}${sep.decimal}${frac}` : int);
}

// Unicode superscripts for the `× 10ⁿ` exponent of the scientific/engineering
// notations (the `e` notation keeps an ASCII exponent).
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴',
                      5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const toSuperscript = (n) => String(n).split('').map((c) => SUPERSCRIPT[c] || c).join('');

/** Significant digits + base-10 exponent of (BigInt halförds / 10^dec), mantissa
 *  rounded to ≤ `sig` significant digits. Returns {neg, digits, exp} where the
 *  value is ± `digits[0].digits[1…]` × 10^exp (digits has no trailing zeros), or
 *  null when the amount is zero. */
function sciParts(halfords, dec, sig) {
  if (halfords === 0n) return null;
  const neg = halfords < 0n;
  let digits = (neg ? -halfords : halfords).toString();
  let exp = digits.length - 1 - dec;
  if (sig && digits.length > sig) {
    const roundUp = digits.charCodeAt(sig) - 48 >= 5;
    let rs = (BigInt(digits.slice(0, sig)) + (roundUp ? 1n : 0n)).toString();
    if (rs.length > sig) { exp += 1; rs = rs.slice(0, sig); } // carry, e.g. 99→100
    digits = rs;
  }
  digits = digits.replace(/0+$/, '') || '0';
  return { neg, digits, exp };
}

/** Render sciParts as one of the exponential notations:
 *   scientific_e   → 1.264843e7        (ASCII `e`, mantissa 1 ≤ |m| < 10)
 *   scientific_pow → 1.264843 × 10⁷    (superscript, mantissa 1 ≤ |m| < 10)
 *   engineering    → 12.64843 × 10⁶    (superscript, exponent a multiple of 3) */
function formatScientific(parts, sep, notation) {
  if (parts === null) return '0';
  const { neg, digits, exp } = parts;
  const sign = neg ? '-' : '';
  if (notation === 'engineering') {
    const eng = Math.floor(exp / 3) * 3;     // exponent snapped down to a multiple of 3
    const intLen = exp - eng + 1;            // 1–3 digits left of the point
    const padded = digits.padEnd(intLen, '0');
    const frac = padded.slice(intLen).replace(/0+$/, '');
    const mant = frac ? `${padded.slice(0, intLen)}${sep.decimal}${frac}` : padded.slice(0, intLen);
    return `${sign}${mant} × 10${toSuperscript(eng)}`;
  }
  const frac = digits.slice(1); // already trailing-trimmed
  const mant = frac ? `${digits[0]}${sep.decimal}${frac}` : digits[0];
  return notation === 'scientific_pow'
    ? `${sign}${mant} × 10${toSuperscript(exp)}`
    : `${sign}${mant}e${exp}`;
}

/** Format BigInt halförds in a denomination. */
function formatHalfords(halfords, denom, { maxDecimals = 8, notation = 'decimal', sep = SEP_DEFAULT } = {}) {
  if (notation !== 'decimal') {
    return formatScientific(sciParts(halfords, denom.dec, maxDecimals + 1), sep, notation);
  }
  const show = Math.min(maxDecimals, denom.dec);
  const scaled = denom.dec > show
    ? roundDiv(halfords, 10n ** BigInt(denom.dec - show))
    : halfords;
  return placeDecimal(scaled, show, sep);
}

// The unit can be shown three independent ways, selectable per context
// (base line and hover) as a set: 'glyph' (Ǥ/mǤ/hal), 'ticker' (GRC/mGRC/
// halförd text) and/or 'icon' (a logo via ha-icon).
const isOne = (denom, halfords) => halfords === 10n ** BigInt(denom.dec);

// `plural`: 'auto' → singular only when the quantity is exactly 1; 'singular' /
// 'plural' → force that form. Only the halförd has singular forms (hal/halförd
// vs hals/halförds); other tickers are invariant.
const wantSingular = (d, h, plural) =>
  plural === 'singular' || (plural !== 'plural' && isOne(d, h));
const glyphOf = (d, h, plural) => (d.shortOne && wantSingular(d, h, plural) ? d.shortOne : d.short);
const tickerOf = (d, h, plural) => (d.labelOne && wantSingular(d, h, plural) ? d.labelOne : d.label);

const iconHtml = (units, name) =>
  units.includes('icon') && name ? `<ha-icon class="ic" icon="${name}"></ha-icon>` : '';

/** Text unit suffix (glyph and/or ticker) for a denom at a quantity. */
function textUnit(denom, halfords, units, plural) {
  const parts = [];
  if (units.includes('glyph')) parts.push(glyphOf(denom, halfords, plural));
  if (units.includes('ticker')) parts.push(tickerOf(denom, halfords, plural));
  return parts.join(' ');
}

function conversionStack(halfords, opts = {}) {
  const { denoms, active, maxDecimals = 8, notation = 'decimal',
          units = ['glyph'], icon = '', plural = 'auto', sep = SEP_DEFAULT } = opts;
  const ids = denoms || DENOMINATIONS.map((d) => d.id);
  return DENOMINATIONS.filter((d) => ids.includes(d.id)).map((d) => ({
    id: d.id,
    iconHtml: iconHtml(units, icon),
    unit: textUnit(d, halfords, units, plural),
    formatted: formatHalfords(halfords, d, { maxDecimals, notation, sep }),
    active: d.id === active,
  }));
}

// ── Card ─────────────────────────────────────────────────────────────────────
class GrcAmountCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error('grc-amount-card: "entity" is required');
    const c = {
      primary: 'GRC',
      hover: true,
      denoms: DENOMINATIONS.map((d) => d.id),
      decimals: 8,
      notation: 'decimal',
      plural: 'auto',
      number_format: 'language',
      icon: 'grc:gridcoin',
      ...config,
    };
    // Legacy boolean `scientific: true` ⇒ the `e` notation (now one of four modes:
    // decimal | scientific_e | scientific_pow | engineering).
    if (config.notation === undefined && config.scientific === true) c.notation = 'scientific_e';
    // `icon` is the logo name; the 'icon' representation is toggled per context
    // via base_units / hover_units. Migrate the legacy `glyph`/`icon` options.
    if (c.icon === true) c.icon = 'grc:gridcoin';
    const legacyText = config.glyph === false ? 'ticker' : 'glyph';
    if (!config.base_units) {
      c.base_units = [legacyText, ...(config.icon ? ['icon'] : [])];
    }
    if (!config.hover_units) c.hover_units = [legacyText];
    c.active = c.active || c.primary;
    this._config = c;
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
    const sep = resolveSeparators(cfg.number_format, this._hass);
    const primary = DENOMINATIONS.find((d) => d.id === cfg.primary) || DENOMINATIONS[0];
    const big = formatHalfords(halfords, primary, { maxDecimals: cfg.decimals, notation: cfg.notation, sep });
    const baseIcon = iconHtml(cfg.base_units, cfg.icon);
    const unit = textUnit(primary, halfords, cfg.base_units, cfg.plural);

    const stackHtml = (cfg.hover
      ? conversionStack(halfords, {
          denoms: cfg.denoms, active: cfg.active,
          maxDecimals: cfg.decimals, notation: cfg.notation,
          units: cfg.hover_units, icon: cfg.icon, plural: cfg.plural, sep,
        })
      : []
    ).map((r) =>
      `<div class="row${r.active ? ' active' : ''}">
         <span class="u">${r.iconHtml}${r.unit}</span>
         <span class="v">${r.formatted}</span>
       </div>`).join('');

    if (!this._rendered) {
      this.innerHTML = `
        <ha-card>
          <div class="amount">
            <div class="label"></div>
            <div class="value">${baseIcon}<span class="num"></span> <span class="unit"></span></div>
            ${cfg.hover ? `<div class="stack"><div class="rows"></div>
              <div class="foot">1 ${GRC_GLYPH} = ${group('100000000', sep.group)} halförds</div></div>` : ''}
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

if (!customElements.get('grc-amount-card')) customElements.define('grc-amount-card', GrcAmountCard);

// ── GUI config editor (ha-form based) ────────────────────────────────────────
const DENOM_OPTIONS = DENOMINATIONS.map((d) => ({ value: d.id, label: d.id }));
const UNIT_OPTIONS = [
  { value: 'glyph', label: 'Glyph (Ǥ)' },
  { value: 'ticker', label: 'Ticker (GRC)' },
  { value: 'icon', label: 'Logo icon' },
];

const EDITOR_SCHEMA = [
  { name: 'entity', required: true, selector: { entity: { domain: 'sensor' } } },
  { name: 'name', selector: { text: {} } },
  { type: 'grid', schema: [
    { name: 'primary', selector: { select: { mode: 'dropdown', options: DENOM_OPTIONS } } },
    { name: 'active', selector: { select: { mode: 'dropdown', options: DENOM_OPTIONS } } },
  ] },
  { name: 'denoms', selector: { select: { multiple: true, options: DENOM_OPTIONS } } },
  { name: 'base_units', selector: { select: { multiple: true, options: UNIT_OPTIONS } } },
  { name: 'hover_units', selector: { select: { multiple: true, options: UNIT_OPTIONS } } },
  { name: 'icon', selector: { icon: {} } },
  { name: 'plural', selector: { select: { mode: 'dropdown', options: [
    { value: 'auto', label: 'Auto (hal / hals by count)' },
    { value: 'singular', label: 'Always singular (hal)' },
    { value: 'plural', label: 'Always plural (hals)' },
  ] } } },
  { name: 'number_format', selector: { select: { mode: 'dropdown', options: [
    { value: 'language', label: 'Auto: Home Assistant locale' },
    { value: 'comma_decimal', label: '1,234.56 (US, UK)' },
    { value: 'decimal_comma', label: '1.234,56 (Spain, Germany, Italy)' },
    { value: 'space_comma', label: '1 234,56 (France, Sweden)' },
    { value: 'none', label: '1234.56 (no grouping)' },
  ] } } },
  { name: 'notation', selector: { select: { mode: 'dropdown', options: [
    { value: 'decimal', label: 'Decimal (1,264.843)' },
    { value: 'scientific_e', label: 'Scientific (e): 1.264843e7' },
    { value: 'scientific_pow', label: 'Scientific (×10ⁿ): 1.264843 × 10⁷' },
    { value: 'engineering', label: 'Engineering: 12.64843 × 10⁶' },
  ] } } },
  { type: 'grid', schema: [
    { name: 'decimals', selector: { number: { min: 0, max: 8, mode: 'box' } } },
    { name: 'hover', selector: { boolean: {} } },
  ] },
];

const EDITOR_LABELS = {
  entity: 'Entity (GRC amount)',
  name: 'Name (optional)',
  icon: 'Logo icon (for the "Logo" unit option)',
  primary: 'Primary unit (big number)',
  active: 'Highlighted unit',
  denoms: 'Denominations in hover stack',
  base_units: 'Base line — show as',
  hover_units: 'Hover rows — show as',
  plural: 'Halförd singular/plural',
  number_format: 'Number format (decimal / thousands)',
  decimals: 'Max decimals',
  hover: 'Show hover conversions',
  notation: 'Number notation',
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

if (!customElements.get('grc-amount-card-editor')) customElements.define('grc-amount-card-editor', GrcAmountCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'grc-amount-card')) {
  window.customCards.push({
    type: 'grc-amount-card',
    name: 'Gridcoin Amount',
    description: 'A Gridcoin balance with an optional hover conversion-stack (GRC · mGRC · µGRC · halförd).',
  });
}
