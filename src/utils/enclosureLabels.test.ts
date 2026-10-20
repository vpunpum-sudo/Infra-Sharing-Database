import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCLOSURE_NAMES_OVERLAY, getEnclosureLabel, getEnclosureLabelKey, getEnclosureLabelOffset, getEnclosureMarkerKey, syncMarkerAlt } from './enclosureLabels';

test('enclosure names are trimmed and empty names have no label', () => {
  assert.equal(getEnclosureLabel({ name: '  Cabinet A  ' }), 'Cabinet A');
  assert.equal(getEnclosureLabel({ name: '' }), null);
  assert.equal(getEnclosureLabel({ name: ' \n  ' }), null);
  assert.equal(getEnclosureLabel({}), null);
});

test('label offsets clear each marker size, including enlarged edit markers', () => {
  assert.deepEqual(getEnclosureLabelOffset('icon', false), [12, 0]);
  assert.deepEqual(getEnclosureLabelOffset('icon', true), [14, 0]);
  assert.deepEqual(getEnclosureLabelOffset('circle', false), [9, 0]);
  assert.deepEqual(getEnclosureLabelOffset('circle', true), [11, 0]);
});

test('entering and leaving edit mode remounts the tooltip with the matching offset', () => {
  for (const kind of ['icon', 'circle'] as const) {
    const before = { key: getEnclosureLabelKey(false), offset: getEnclosureLabelOffset(kind, false) };
    const during = { key: getEnclosureLabelKey(true), offset: getEnclosureLabelOffset(kind, true) };
    const after = { key: getEnclosureLabelKey(false), offset: getEnclosureLabelOffset(kind, false) };

    assert.notEqual(during.key, before.key);
    assert.notDeepEqual(during.offset, before.offset);
    assert.deepEqual(after, before);
  }
});

test('the names overlay uses the Leaflet Layers menu label', () => {
  assert.equal(ENCLOSURE_NAMES_OVERLAY, 'Enclosure Names');
});

test('every overlay toggle order replaces markers when name visibility changes', () => {
  const sequences = [
    [
      { enclosures: true, names: true },
      { enclosures: false, names: true },
      { enclosures: false, names: false },
      { enclosures: true, names: false }
    ],
    [
      { enclosures: true, names: true },
      { enclosures: true, names: false },
      { enclosures: false, names: false },
      { enclosures: true, names: false }
    ],
    [
      { enclosures: true, names: true },
      { enclosures: false, names: true },
      { enclosures: false, names: false },
      { enclosures: false, names: true },
      { enclosures: true, names: true }
    ]
  ];

  for (const sequence of sequences) {
    const keys = sequence.map(({ names }) => getEnclosureMarkerKey('cabinet-1', names));
    for (let i = 1; i < sequence.length; i++) {
      assert.equal(keys[i] === keys[i - 1], sequence[i].names === sequence[i - 1].names);
    }
  }
});

test('S1: a rename updates marker options and the visible icon', () => {
  const element = { alt: 'Cab A' };
  const marker = { options: { alt: 'Cab A' }, getElement: () => element };

  syncMarkerAlt(marker, 'Cab B');

  assert.equal(marker.options.alt, 'Cab B');
  assert.equal(element.alt, 'Cab B');
});

function trackedAlt(initial: string): { target: { alt: string }; writes: () => number } {
  let alt = initial;
  let writes = 0;
  const target = {} as { alt: string };
  Object.defineProperty(target, 'alt', {
    enumerable: true,
    get: () => alt,
    set: (value: string) => { alt = value; writes++; }
  });
  return { target, writes: () => writes };
}

test('S2: matching alt values cause no writes', () => {
  const options = trackedAlt('Cab A');
  const element = trackedAlt('Cab A');
  syncMarkerAlt({ options: options.target, getElement: () => element.target }, 'Cab A');

  assert.equal(options.writes(), 0);
  assert.equal(element.writes(), 0);
});

test('S3: only the differing alt value is written', () => {
  const optionsA = trackedAlt('Cab B');
  const elementA = trackedAlt('Cab A');
  syncMarkerAlt({ options: optionsA.target, getElement: () => elementA.target }, 'Cab B');
  assert.equal(optionsA.writes(), 0);
  assert.equal(elementA.writes(), 1);

  const optionsB = trackedAlt('Cab A');
  const elementB = trackedAlt('Cab B');
  syncMarkerAlt({ options: optionsB.target, getElement: () => elementB.target }, 'Cab B');
  assert.equal(optionsB.writes(), 1);
  assert.equal(elementB.writes(), 0);
});

test('S4: absent icons still update options for overlay recreation', () => {
  for (const absent of [undefined, null]) {
    const marker = { options: { alt: 'Cab A' }, getElement: () => absent };
    assert.doesNotThrow(() => syncMarkerAlt(marker, 'Cab B'));
    assert.equal(marker.options.alt, 'Cab B');
  }
});

test('S5: null and undefined refs are harmless', () => {
  assert.doesNotThrow(() => syncMarkerAlt(null, 'x'));
  assert.doesNotThrow(() => syncMarkerAlt(undefined, 'x'));
});

test('S6: missing names become empty alt values without redundant writes', () => {
  for (const name of [undefined, null]) {
    const element = { alt: 'Cab A' };
    const marker = { options: { alt: 'Cab A' }, getElement: () => element };
    syncMarkerAlt(marker, name);
    assert.equal(marker.options.alt, '');
    assert.equal(element.alt, '');
  }

  const options = trackedAlt('');
  const element = trackedAlt('');
  syncMarkerAlt({ options: options.target, getElement: () => element.target });
  assert.equal(options.writes(), 0);
  assert.equal(element.writes(), 0);
});

test('S7: an icon without alt is left alone while options update', () => {
  const element = { className: 'div-icon' };
  const marker = { options: { alt: 'Cab A' }, getElement: () => element };
  syncMarkerAlt(marker, 'Cab B');

  assert.equal(marker.options.alt, 'Cab B');
  assert.equal('alt' in element, false);
});
