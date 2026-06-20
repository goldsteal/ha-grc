/**
 * Unit tests for grc-amount-card's number `notation` modes.
 *
 * Run:  node --test            (from the repo root)
 *
 * The card ships as a no-build browser script (it references HTMLElement /
 * customElements / window at load), so rather than add a bundler we load it once
 * inside a `vm` sandbox with minimal browser stubs and capture the pieces under
 * test. No dependencies beyond Node's built-in test runner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CARD = path.join(here, '..', 'custom_components', 'gridcoin', 'frontend', 'grc-amount-card.js');

// Load the card in a sandbox. Browser globals are stubbed just enough that the
// module-level `class … extends HTMLElement`, `customElements.define`, and
// `window.customCards` lines execute without a DOM. `customElements.get` returns
// truthy so the guarded `define()` is skipped.
const sandbox = {
  Intl, BigInt, Number, String, Math, Object, Array, JSON, RegExp, console,
  HTMLElement: class {},
  customElements: { get: () => true, define: () => {} },
  window: {},
  document: { createElement: () => ({}) },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(CARD, 'utf8') +
    '\n;globalThis.__t = { grcToHalfords, formatHalfords, sciParts, formatScientific, DENOMINATIONS, GrcAmountCard };',
  sandbox,
);
const { grcToHalfords, formatHalfords, DENOMINATIONS, GrcAmountCard } = sandbox.__t;

const GRC = DENOMINATIONS.find((d) => d.id === 'GRC'); // dec 8
const HAL = DENOMINATIONS.find((d) => d.id === 'halförd'); // dec 0
const DOT = { group: ',', decimal: '.' }; // 1,234.56
const COMMA = { group: '.', decimal: ',' }; // 1.234,56

const fmt = (grc, notation, { denom = GRC, sep = DOT, maxDecimals = 8 } = {}) =>
  formatHalfords(grcToHalfords(grc), denom, { maxDecimals, notation, sep });

// ── The four notations on the canonical balance (0xC0FFEE = 12,648,430) ────────
test('decimal notation groups with the locale separator', () => {
  assert.equal(fmt('12648430', 'decimal'), '12,648,430');
  assert.equal(fmt('12648430', 'decimal', { sep: COMMA }), '12.648.430');
});

test('scientific_e uses an ASCII e exponent (the legacy form)', () => {
  assert.equal(fmt('12648430', 'scientific_e'), '1.264843e7');
  assert.equal(fmt('12648430', 'scientific_e', { sep: COMMA }), '1,264843e7');
});

test('scientific_pow uses a Unicode superscript exponent', () => {
  assert.equal(fmt('12648430', 'scientific_pow'), '1.264843 × 10⁷');
  assert.equal(fmt('12648430', 'scientific_pow', { sep: COMMA }), '1,264843 × 10⁷');
});

test('engineering snaps the exponent to a multiple of 3', () => {
  assert.equal(fmt('12648430', 'engineering'), '12.64843 × 10⁶');
});

// ── Exponent scales with the denomination (halförd = ×1e8) ─────────────────────
test('notation works across denominations', () => {
  assert.equal(fmt('12648430', 'decimal', { denom: HAL }), '1,264,843,000,000,000');
  assert.equal(fmt('12648430', 'scientific_pow', { denom: HAL }), '1.264843 × 10¹⁵');
  assert.equal(fmt('12648430', 'engineering', { denom: HAL }), '1.264843 × 10¹⁵'); // 15 already ÷3
});

// ── Negative exponents (sub-GRC amounts) ───────────────────────────────────────
test('negative exponents: one halförd expressed in GRC', () => {
  assert.equal(fmt('0.00000001', 'scientific_e'), '1e-8');
  assert.equal(fmt('0.00000001', 'scientific_pow'), '1 × 10⁻⁸');
  assert.equal(fmt('0.00000001', 'engineering'), '10 × 10⁻⁹'); // floors toward -inf, not -6
});

test('engineering keeps the exponent a multiple of 3 and mantissa in [1,1000)', () => {
  const sup = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
  const samples = ['0.00000001', '0.0000001', '0.000001', '0.00001234', '0.5', '50', '12648430', '999999999'];
  for (const g of samples) {
    const out = fmt(g, 'engineering');
    const m = out.match(/^(-?)([\d.]+) × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/);
    assert.ok(m, `engineering output should match the × 10ⁿ shape: ${out}`);
    const exp = parseInt([...m[3]].map((c) => sup[c]).join(''), 10);
    const mant = Math.abs(parseFloat(m[2]));
    assert.equal(((exp % 3) + 3) % 3, 0, `exponent ${exp} not a multiple of 3 (${out})`);
    assert.ok(mant >= 1 && mant < 1000, `mantissa ${mant} out of [1,1000) (${out})`);
    assert.ok(Math.abs(mant * 10 ** exp - Math.abs(Number(g))) <= Math.abs(Number(g)) * 1e-6 + 1e-20,
      `engineering value does not reconstruct: ${out} vs ${g}`);
  }
});

// ── Sign, zero, and rounding ───────────────────────────────────────────────────
test('negative values keep their sign in every notation', () => {
  assert.equal(fmt('-0.0000567', 'engineering'), '-56.7 × 10⁻⁶');
  assert.equal(fmt('-12648430', 'scientific_pow'), '-1.264843 × 10⁷');
  assert.equal(fmt('-12648430', 'scientific_e'), '-1.264843e7');
});

test('zero renders as a bare 0 in the exponential notations', () => {
  for (const n of ['scientific_e', 'scientific_pow', 'engineering']) {
    assert.equal(fmt('0', n), '0');
  }
});

test('mantissa rounds to maxDecimals+1 significant figures', () => {
  assert.equal(fmt('1234567890.12345678', 'scientific_e'), '1.23456789e9'); // 9 sig figs at default 8
  assert.equal(fmt('1234567890.12345678', 'scientific_pow', { maxDecimals: 3 }), '1.235 × 10⁹');
});

// ── setConfig back-compat: legacy boolean `scientific` ─────────────────────────
const cfgOf = (config) => {
  const card = new GrcAmountCard();
  card.setConfig({ entity: 'sensor.x', ...config });
  return card._config;
};

test('notation defaults to decimal', () => {
  assert.equal(cfgOf({}).notation, 'decimal');
});

test('legacy `scientific: true` migrates to scientific_e', () => {
  assert.equal(cfgOf({ scientific: true }).notation, 'scientific_e');
});

test('legacy `scientific: false` leaves the default decimal', () => {
  assert.equal(cfgOf({ scientific: false }).notation, 'decimal');
});

test('an explicit notation wins over the legacy boolean', () => {
  assert.equal(cfgOf({ scientific: true, notation: 'engineering' }).notation, 'engineering');
});
