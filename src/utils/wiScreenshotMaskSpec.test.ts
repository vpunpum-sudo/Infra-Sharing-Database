import test from 'node:test';
import assert from 'node:assert/strict';
import { WI_MASK_SPECS, HEADER_SPEC, WI_MASK_PLACEHOLDERS, maskThenCheck, checkMaskResult, type PageSnapshot } from './wiScreenshotMaskSpec';
import { WI_FIGURES } from './wiScreenshotFigures';
import { findPii } from './wiScreenshotRedact';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('mask then check removes declared values and detects leftovers across the whole page', () => {
  const spec = { regions: [
    { name: 'name', selector: '[data-wi-pii="name"]', kind: 'text', placeholder: WI_MASK_PLACEHOLDERS.name(12), required: true },
    { name: 'email', selector: '[data-wi-pii="email"]', kind: 'text', placeholder: WI_MASK_PLACEHOLDERS.email(12), required: true },
    { name: 'phone', selector: '[data-wi-pii="phone"]', kind: 'input', placeholder: WI_MASK_PLACEHOLDERS.phone, required: true },
    { name: 'photo', selector: '[data-wi-pii="photo"]', kind: 'input', placeholder: WI_MASK_PLACEHOLDERS.profileImageLink, required: true },
    { name: 'contract', selector: '[data-wi-pii="contract"]', kind: 'text', placeholder: WI_MASK_PLACEHOLDERS.contractNumber, required: true },
    { name: 'signature', selector: '[data-wi-pii="signature"]', kind: 'image', required: true },
    { name: 'optional', selector: '[data-wi-pii="optional"]', kind: 'text', placeholder: 'ตัวอย่าง', required: false }
  ] } as const;
  const original: PageSnapshot = {
    bodyText: 'Somchai user@example.com PO1234', inputs: ['0812345678', 'https://example.test/photo'], attrs: [],
    regions: { name: { matches: 1, values: ['Somchai'] }, email: { matches: 1, values: ['user@example.com'] }, phone: { matches: 1, values: ['0812345678'] }, photo: { matches: 1, values: ['https://example.test/photo'] }, contract: { matches: 1, values: ['PO1234'] }, signature: { matches: 1, values: [], imageMasked: [true] }, optional: { matches: 0, values: [] } }
  };
  assert.deepEqual(maskThenCheck(original, spec, { email: 'user@example.com', displayName: 'Somchai' }), []);
  assert.deepEqual(maskThenCheck({ ...original, bodyText: `${original.bodyText} outside@example.com` }, spec, {}), ['pii:email']);
  assert.deepEqual(maskThenCheck({ ...original, inputs: [...original.inputs, '0898765432'] }, spec, {}), ['pii:phone']);
  assert.deepEqual(maskThenCheck({ ...original, bodyText: `${original.bodyText} Somchai elsewhere` }, spec, { displayName: 'Somchai' }), ['known-value']);
  assert.deepEqual(maskThenCheck({ ...original, regions: { ...original.regions, name: { matches: 0, values: [] } } }, spec, {}), ['mask-required:name']);
  assert.deepEqual(maskThenCheck({ ...original, regions: { ...original.regions, signature: { matches: 1, values: [], imageMasked: [false] } } }, spec, {}), ['image-region:signature']);
  assert.deepEqual(checkMaskResult({ ...original, bodyText: 'plain text', inputs: [], attrs: [] }, { regions: [] }, {}), []);
});

test('every figure has a mask spec and sensitive figures have required regions', () => {
  for (const figure of WI_FIGURES) assert.ok(WI_MASK_SPECS[figure.id], figure.id);
  for (const id of ['users', 'logs', 'profile', 'approval-request', 'approval-sign', 'schedule'] as const) {
    assert.ok(WI_MASK_SPECS[id].regions.some(region => region.required), id);
  }
  assert.ok(HEADER_SPEC.regions.length > 0);
});

test('signing capture leaves identity fields empty and masks prior signers', () => {
  const regions = WI_MASK_SPECS['approval-sign'].regions;
  for (const name of ['signer-name', 'signer-position']) {
    const region = regions.find(item => item.name === name);
    assert.equal(region?.kind, 'input');
    assert.equal(region?.required, true);
    assert.equal(region?.placeholder, '');
  }
  for (const name of ['signature-pad', 'approval-signature', 'previous-signature', 'approval-signer-name', 'previous-signer']) {
    assert.ok(regions.some(item => item.name === name), name);
  }
  assert.ok(WI_MASK_SPECS['approval-request'].regions.some(item => item.name === 'previous-signer'));
});

test('approval request masks both the preview editor and the unsent form', () => {
  const names = WI_MASK_SPECS['approval-request'].regions.map(region => region.name);
  for (const name of ['approval-company', 'approval-supervisor', 'approval-phone', 'approval-contract', 'approval-request-company', 'approval-request-notes']) {
    assert.ok(names.includes(name), name);
  }
});

test('post-capture snapshot rejects restored names, inputs and images', () => {
  const spec = { regions: [
    { name: 'previous-signer', selector: '[data-wi-pii="previous-signer"]', kind: 'text', placeholder: 'ผู้ใช้ตัวอย่าง 1', required: false },
    { name: 'signer-name', selector: '[data-wi-pii="signer-name"]', kind: 'input', placeholder: '', required: true },
    { name: 'signature', selector: '[data-wi-pii="signature"]', kind: 'image', required: true }
  ] } as const;
  const safe: PageSnapshot = { bodyText: 'ผู้ใช้ตัวอย่าง 1', inputs: [''], attrs: [], regions: {
    'previous-signer': { matches: 1, values: ['ผู้ใช้ตัวอย่าง 1'], maskValid: [true] },
    'signer-name': { matches: 1, values: [''], maskValid: [true] },
    signature: { matches: 1, values: [], imageMasked: [true] }
  } };
  assert.deepEqual(checkMaskResult(safe, spec, {}), []);
  assert.deepEqual(checkMaskResult({ ...safe, regions: { ...safe.regions, 'previous-signer': { matches: 1, values: ['Another Person'], maskValid: [false] } } }, spec, {}), ['mask-region:previous-signer']);
  assert.deepEqual(checkMaskResult({ ...safe, regions: { ...safe.regions, 'signer-name': { matches: 1, values: ['Another Person'], maskValid: [false] } } }, spec, {}), ['mask-region:signer-name']);
  assert.deepEqual(checkMaskResult({ ...safe, regions: { ...safe.regions, signature: { matches: 1, values: [], imageMasked: [false] } } }, spec, {}), ['image-region:signature']);
});

test('all placeholders for rows 1 through 999 are free of detected PII', () => {
  for (let n = 1; n <= 999; n++) for (const value of Object.values(WI_MASK_PLACEHOLDERS)) {
    assert.deepEqual(findPii(typeof value === 'function' ? value(n) : value), [], `row ${n}`);
  }
});

test('every specified PII selector is annotated in its named component', () => {
  for (const [id, spec] of Object.entries(WI_MASK_SPECS)) for (const region of spec.regions) {
    if (!region.source) continue;
    const source = readFileSync(resolve('src', region.source === 'App.tsx' ? region.source : `components/${region.source}`), 'utf8');
    assert.ok(source.includes(`data-wi-pii="${region.name}"`), `${id}: ${region.name} in ${region.source}`);
  }
});

test('splice diagram hides enclosure coordinates tagged in SpliceManager', () => {
  const coords = WI_MASK_SPECS.splice.regions.find(region => region.name === 'enclosure-coords');
  assert.equal(coords?.kind, 'hide');
  assert.ok(readFileSync(resolve('src/components/SpliceManager.tsx'), 'utf8').includes('data-wi-pii="enclosure-coords"'));
});

test('PII is detected within each field, not across adjacent date and progress inputs', () => {
  const base: PageSnapshot = { bodyText: 'แผนงาน', inputs: ['2026-10-21', '', '2026-11-30', '', '100', ''], attrs: ['', ''], regions: {} };
  assert.deepEqual(checkMaskResult(base, { regions: [] }, {}), []);
  assert.deepEqual(checkMaskResult({ ...base, inputs: [...base.inputs, '081-234-5678'] }, { regions: [] }, {}), ['pii:phone']);
  assert.deepEqual(checkMaskResult({ ...base, attrs: ['โทร 02 123 4567'] }, { regions: [] }, {}), ['pii:phone']);
  assert.deepEqual(checkMaskResult({ ...base, bodyText: 'ติดต่อ\n081 234 5678' }, { regions: [] }, {}), ['pii:phone']);
  assert.deepEqual(checkMaskResult({ ...base, inputs: ['someone@example.com'] }, { regions: [] }, {}), ['pii:email']);
});

test('approval history overlay is optional and hidden in both approval figures', () => {
  for (const figure of ['approval-request', 'approval-sign'] as const) {
    const region = WI_MASK_SPECS[figure].regions.find(r => r.name === 'approval-history');
    assert.ok(region); assert.equal(region.kind, 'hide'); assert.equal(region.required, false);
    assert.equal(region.selector, '[data-wi-pii="approval-history"]');
  }
});
