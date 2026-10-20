import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCLOSURE_NAMES_OVERLAY, LABEL_COMPACT_MAX_WIDTH, LABEL_NORMAL_MAX_WIDTH, LABEL_SAFETY, clearEnclosureLabelWidthCache, getEnclosureLabel, getEnclosureLabelHeight, getEnclosureLabelKey, getEnclosureLabelOffset, getEnclosureMarkerKey, getEnclosureMarkerRadius, getLabelRect, layoutEnclosureLabels, measureEnclosureLabelWidth, syncMarkerAlt, type LabelLayoutItem, type Rect } from './enclosureLabels';

test('enclosure names are trimmed and empty names have no label', () => {
  assert.equal(getEnclosureLabel({ name: '  Cabinet A  ' }), 'Cabinet A');
  assert.equal(getEnclosureLabel({ name: '' }), null);
  assert.equal(getEnclosureLabel({ name: ' \n  ' }), null);
  assert.equal(getEnclosureLabel({}), null);
});

test('label offsets clear each marker size, including enlarged edit markers', () => {
  for (const [kind, enlarged, radius] of [
    ['icon', false, 10], ['icon', true, 12], ['circle', false, 7], ['circle', true, 9]
  ] as const) {
    assert.equal(getEnclosureMarkerRadius(kind, enlarged), radius);
    assert.deepEqual(getEnclosureLabelOffset(kind, enlarged, 'right'), [radius + 2, 0]);
    assert.deepEqual(getEnclosureLabelOffset(kind, enlarged, 'left'), [-radius - 2, 0]);
    assert.deepEqual(getEnclosureLabelOffset(kind, enlarged, 'top'), [0, -radius - 2]);
    assert.deepEqual(getEnclosureLabelOffset(kind, enlarged, 'bottom'), [0, radius + 2]);

    const item = makeItem(kind, { markerRadius: radius, labelWidth: 100, labelHeight: 21 });
    assert.deepEqual(getLabelRect(item, 'right'), { left: radius + 2, right: radius + 102, top: -10.5, bottom: 10.5 });
    assert.deepEqual(getLabelRect(item, 'left'), { left: -radius - 102, right: -radius - 2, top: -10.5, bottom: 10.5 });
    assert.deepEqual(getLabelRect(item, 'top'), { left: -50, right: 50, top: -radius - 23, bottom: -radius - 2 });
    assert.deepEqual(getLabelRect(item, 'bottom'), { left: -50, right: 50, top: radius + 2, bottom: radius + 23 });
  }
});

test('entering and leaving edit mode remounts the tooltip with the matching offset', () => {
  for (const kind of ['icon', 'circle'] as const) {
    const before = { key: getEnclosureLabelKey(false), offset: getEnclosureLabelOffset(kind, false, 'right') };
    const during = { key: getEnclosureLabelKey(true), offset: getEnclosureLabelOffset(kind, true, 'right') };
    const after = { key: getEnclosureLabelKey(false), offset: getEnclosureLabelOffset(kind, false, 'right') };

    assert.notEqual(during.key, before.key);
    assert.notDeepEqual(during.offset, before.offset);
    assert.deepEqual(after, before);
  }
});

function makeItem(id: string, changes: Partial<LabelLayoutItem> = {}): LabelLayoutItem {
  return { id, x: 0, y: 0, markerRadius: 10, label: id, labelWidth: 100, labelHeight: 21, priority: 2, ...changes };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function padded(rect: Rect): Rect {
  return { left: rect.left - LABEL_SAFETY, right: rect.right + LABEL_SAFETY, top: rect.top - LABEL_SAFETY, bottom: rect.bottom + LABEL_SAFETY };
}

function assertSafePlacements(items: LabelLayoutItem[]): void {
  const placements = layoutEnclosureLabels(items);
  const shown: Rect[] = [];
  for (const item of items) {
    const placement = placements.get(item.id);
    if (!placement || 'hidden' in placement) continue;
    const rect = padded(getLabelRect(item, placement.direction));
    for (const marker of items) {
      if (marker.id === item.id) continue;
      const markerRect = { left: marker.x - marker.markerRadius, right: marker.x + marker.markerRadius, top: marker.y - marker.markerRadius, bottom: marker.y + marker.markerRadius };
      assert.equal(overlaps(rect, markerRect), false, `${item.id} must not cover marker ${marker.id}`);
    }
    for (const earlier of shown) assert.equal(overlaps(rect, earlier), false, `${item.id} must not cover another label`);
    shown.push(rect);
  }
}

test('S1: screenshot cluster keeps shown long labels clear of other labels and markers', () => {
  const items = [
    makeItem('BJ#14 RISER NT ขึ้น Tray', { x: 0, y: 0, labelWidth: 160 }),
    makeItem('B#PB#003 (BJ#12)', { x: 40, y: -10, labelWidth: 150 }),
    makeItem('BJ#13 ครอบหัว', { x: 55, y: 15, labelWidth: 145 })
  ];
  assertSafePlacements(items);
  assert.equal(layoutEnclosureLabels(items).size, 3);
});

test('S2: horizontal neighbours place A left and B right', () => {
  const items = [makeItem('A'), makeItem('B', { x: 40 })];
  assert.deepEqual([...layoutEnclosureLabels(items)], [['A', { direction: 'left' }], ['B', { direction: 'right' }]]);
  assertSafePlacements(items);
});

test('placed label rectangles force a later label to another direction', () => {
  const items = [makeItem('A'), makeItem('B', { y: 20 })];
  assert.deepEqual(layoutEnclosureLabels(items).get('A'), { direction: 'right' });
  assert.deepEqual(layoutEnclosureLabels(items).get('B'), { direction: 'left' });
  assertSafePlacements(items);
});

test('S3: coincident markers remain unchanged and every label is hidden', () => {
  const items = [makeItem('A'), makeItem('B'), makeItem('C')];
  const original = structuredClone(items);
  assert.deepEqual([...layoutEnclosureLabels(items).values()], [{ hidden: true }, { hidden: true }, { hidden: true }]);
  assert.deepEqual(items, original);
  assertSafePlacements(items);
});

test('S4: selected and edited labels claim space before lower-priority neighbours', () => {
  const items = [makeItem('A'), makeItem('B', { x: 40, priority: 1 })];
  const placement = layoutEnclosureLabels(items);
  assert.deepEqual(placement.get('B'), layoutEnclosureLabels([items[1]]).get('B'));
  assert.deepEqual(placement.get('A'), { direction: 'left' });
  assertSafePlacements(items);

  const edited = [makeItem('A', { priority: 1 }), makeItem('B', { x: 40, priority: 0 })];
  assert.deepEqual(layoutEnclosureLabels(edited).get('B'), { direction: 'right' });
});

test('S5: surrounded selected label hides without an exception', () => {
  const items = [
    makeItem('selected', { priority: 1 }),
    makeItem('east', { x: 20, label: null }),
    makeItem('west', { x: -20, label: null }),
    makeItem('north', { y: -20, label: null }),
    makeItem('south', { y: 20, label: null })
  ];
  assert.deepEqual(layoutEnclosureLabels(items).get('selected'), { hidden: true });
});

test('S7: results are deterministic; null names only contribute obstacles', () => {
  assert.equal(layoutEnclosureLabels([]).size, 0);
  assert.deepEqual(layoutEnclosureLabels([makeItem('only')]).get('only'), { direction: 'right' });
  const items = [makeItem('A'), makeItem('obstacle', { x: 40, label: null }), makeItem('B', { x: 80 })];
  assert.deepEqual([...layoutEnclosureLabels(items)], [...layoutEnclosureLabels(items)]);
  assert.equal(layoutEnclosureLabels(items).has('obstacle'), false);
  assert.deepEqual(layoutEnclosureLabels(items).get('A'), { direction: 'left' });
});

test('S8: touching rectangle edges are clear, while a subpixel safety intrusion collides', () => {
  const a = makeItem('A');
  const touching = makeItem('obstacle', { x: 114, markerRadius: 1, label: null });
  const intruding = makeItem('obstacle', { x: 113.5, markerRadius: 1, label: null });
  assert.deepEqual(layoutEnclosureLabels([a, touching]).get('A'), { direction: 'right' });
  assert.deepEqual(layoutEnclosureLabels([a, intruding]).get('A'), { direction: 'left' });
});

test('S10–S11: new screen positions and in-view obstacles recalculate hidden labels', () => {
  const selected = makeItem('selected', { priority: 1 });
  const close = [
    makeItem('east', { x: 20, label: null }),
    makeItem('west', { x: -20, label: null }),
    makeItem('north', { y: -20, label: null }),
    makeItem('south', { y: 20, label: null })
  ];
  assert.deepEqual(layoutEnclosureLabels([selected, ...close]).get('selected'), { hidden: true });
  const zoomedIn = close.map(item => ({ ...item, x: item.x * 10, y: item.y * 10 }));
  assert.deepEqual(layoutEnclosureLabels([selected, ...zoomedIn]).get('selected'), { direction: 'right' });
  assert.deepEqual(layoutEnclosureLabels([selected]).get('selected'), { direction: 'right' });
});

test('S12–S14: enlarged and moved markers, and longer names, change placement', () => {
  const a = makeItem('A', { labelWidth: 20 });
  const b = makeItem('B', { x: 80, label: null });
  assert.deepEqual(layoutEnclosureLabels([a, b]).get('A'), { direction: 'right' });
  assert.deepEqual(layoutEnclosureLabels([{ ...a, labelWidth: 100 }, b]).get('A'), { direction: 'left' });
  assert.deepEqual(layoutEnclosureLabels([{ ...a, labelWidth: 100 }, { ...b, x: 200 }]).get('A'), { direction: 'right' });
  assert.deepEqual(getEnclosureLabelOffset('icon', true, 'right'), [14, 0]);
});

test('S15: compact widths still pass marker and label collision checks', () => {
  const items = [makeItem('A', { labelWidth: LABEL_COMPACT_MAX_WIDTH, labelHeight: 19 }), makeItem('B', { x: 40, labelWidth: LABEL_COMPACT_MAX_WIDTH, labelHeight: 19 })];
  assertSafePlacements(items);
});

test('measurement constants cover compact layout, long renames and font-ready cache clearing', () => {
  assert.equal(getEnclosureLabelHeight(false), 21);
  assert.equal(getEnclosureLabelHeight(true), 19);
  assert.equal(measureEnclosureLabelWidth('x'.repeat(100), false), LABEL_NORMAL_MAX_WIDTH);
  assert.equal(measureEnclosureLabelWidth('x'.repeat(100), true), LABEL_COMPACT_MAX_WIDTH);
  const before = measureEnclosureLabelWidth('Rename', false);
  clearEnclosureLabelWidthCache();
  assert.equal(measureEnclosureLabelWidth('Rename', false), before);
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
