import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApprovalTimeline, parseSnapshotMetadata, summarizeCurrentApproval, pickDefaultComparison, historyTimeLabel, HISTORY_LABELS, type CurrentLookup } from './approvalHistory';
import { raw, snapshot, current, projectWithApproval, project } from './approvalHistory.testFixtures';
const parsed = (docs: ReturnType<typeof raw>[]) => docs.map(d => ({ id: d.id, parsed: parseSnapshotMetadata(d.id, d.data, 'project') }));
const timeline = (c = current(), docs = [raw()], lookup?: CurrentLookup) => buildApprovalTimeline(c, parsed(docs), 'user-private', lookup, 'project');
test('1: parser rejects malformed inputs without throwing; normal/backfill accepted; ids dropped', () => {
  const m = snapshot().metadata;
  for (const data of [null, 'text', [], {}, 4, ...[
    { schemaVersion: 2 }, { id: 'other' }, { projectId: 'other' }, { approvalId: 5 }, { createdAt: '' }, { createdByUid: null },
    { participatingOwners: 'ITEL' }, { participatingOwners: ['Invalid'] }, { project: 5 }, { project: { name: 5 } }, { project: { name: 'n', routeCode: 2 } },
    { project: { name: 'n', owners: ['x'] } }, { project: { name: 'n', owner: 5 } }, { backfill: false }, { backfill: true }, { approvalId: 'other' },
    { ids: [] }, { idIndex: {} }, { idIndex: { mode: 'chunked', chunkCount: 0 } }, { idIndex: { mode: 'chunked', chunkCount: 1.5 } }, { idIndex: { mode: 'unknown', chunkCount: 2 } },
  ].map(p => ({ ...m, ...p }))]) {
    const result = parseSnapshotMetadata('a', data, 'project'); assert.equal(result.ok, false, JSON.stringify(data)); if (!result.ok) assert.ok('reason' in result && result.reason);
  }
  for (const good of [m, snapshot('snap', undefined, 'a').metadata]) {
    const result = parseSnapshotMetadata(good.id, good, 'project'); assert.equal(result.ok, true);
    if (result.ok) { assert.equal('ids' in result.meta, false); assert.equal(result.meta.project.name, project.name); }
  }
  assert.equal(parseSnapshotMetadata('a', new Proxy({}, { getPrototypeOf() { throw Error(); } }), 'project').ok, false);
});
test('2: current statuses, historical truth, backfill and legacy labels; summary is plain data', () => {
  for (const status of ['Pending Approval', 'Rejected', 'Completed']) {
    const list = timeline(current('b', { status, rejectionReason: 'Needs revision' }), [raw('a', '2026-10-19'), raw('b')]);
    assert.deepEqual(list.map(e => e.kind), ['current-frozen', 'earlier']);
    assert.match(list[0].label, /PRIVATE-DOC/); assert.equal(list[0].openable, true);
    assert.ok(list[0].timeLabel.startsWith('ยื่นเมื่อ')); assert.equal(list[0].submitterLabel, 'Synthetic requester');
    if (status === 'Rejected') assert.match(list[0].outcome, /ถูกปฏิเสธ.*Needs revision/);
    // The required "reason not retained" text is truthful; no assertion of rejection.
    assert.ok(list[1].outcome.includes(HISTORY_LABELS.replaced)); assert.ok(!list[1].outcome.includes('ถูกปฏิเสธ ·'));
    assert.equal(list[1].submitterLabel, 'คุณ');
  }
  const backfill = snapshot('snap', undefined, 'a');
  const b = timeline(current('a', { snapshotId: 'snap', backfilled: true }), [{ id: 'snap', data: backfill.metadata }])[0];
  assert.equal(b.kind, 'current-backfilled'); assert.ok(b.timeLabel.startsWith('ล็อกเมื่อ'));
  const oldBackfill = timeline(current('b'), [{ id: 'snap', data: backfill.metadata }]).find(e => e.id === 'snap')!;
  assert.equal(oldBackfill.submitterLabel, HISTORY_LABELS.noName);
  const legacy = timeline(current('a', { snapshotId: undefined }), [raw('old')])[0];
  assert.equal(legacy.kind, 'current-legacy-live'); assert.equal(legacy.openable, false); assert.equal(legacy.comparable, false);
  assert.match(legacy.timeLabel, /ข้อมูลสด ยังไม่ล็อก/);
  assert.equal(summarizeCurrentApproval(project), null);
  const p = projectWithApproval(); const summary = summarizeCurrentApproval(p)!;
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { id: 'a', snapshotId: 'a', documentNumber: 'PRIVATE-DOC', status: 'Pending Approval', stageText: 'Pending Approval', requestedAt: p.designApproval!.requestedAt, requestedBy: 'Synthetic requester', backfilled: false });
  assert.ok(!JSON.stringify(summary).includes('user-private'));
});
test('2: current lookup missing/error/invalid, valid direct get and valid page fallback; deduplicated', () => {
  const invalid = { status: 'found', doc: { id: 'a', data: {} } } as const;
  for (const lookup of [{ status: 'missing' }, { status: 'error' }, invalid] as CurrentLookup[]) {
    const unavailable = timeline(current(), [raw('old')], lookup)[0];
    assert.equal(unavailable.kind, 'current-unavailable'); assert.equal(unavailable.timeLabel, HISTORY_LABELS.unavailable); assert.equal(unavailable.comparable, false);
    const fallback = timeline(current(), [raw(), raw()], lookup);
    assert.equal(fallback.length, 1); assert.equal(fallback[0].kind, 'current-frozen'); assert.equal(fallback[0].comparable, true);
  }
  assert.equal(timeline(current(), [], { status: 'found', doc: raw() })[0].kind, 'current-frozen');
  assert.equal(timeline(current(), [], { status: 'found', doc: { id: 'a', data: { ...(raw().data as any), projectId: 'other' } } })[0].kind, 'current-unavailable');
});
test('2: orphan/invalid/unknown dates, tie-breaking and labels', () => {
  const list = buildApprovalTimeline(null, parsed([raw('unknown', 'bad-time'), raw('z'), raw('b'), { id: 'broken', data: null }]), 'someone-else');
  assert.deepEqual(list.map(e => e.id), ['b', 'z', 'broken', 'unknown']);
  for (const e of list.filter(e => e.meta)) { assert.equal(e.kind, 'not-current'); assert.equal(e.submitterLabel, HISTORY_LABELS.noName); assert.ok(!e.timeLabel.startsWith('ยื่นเมื่อ')); }
  assert.equal(list.at(-1)!.timeLabel, 'บันทึกเมื่อ ไม่ทราบเวลา');
  assert.match(list[0].timeLabel, /ไม่ยืนยันว่ายื่นสำเร็จ/);
  const newer = timeline(current(), [raw('new', '2026-10-21')], { status: 'found', doc: raw() }); assert.equal(newer[0].kind, 'not-current');
  assert.equal(historyTimeLabel(snapshot().metadata, null, false, () => 'LOCAL'), 'บันทึกเมื่อ LOCAL');
});
test('3: default comparison picks nearest older than current; excludes legacy/invalid; never auto-loads', () => {
  assert.deepEqual(pickDefaultComparison(timeline(current('b'), [raw('a', '2026-10-19'), raw('b'), raw('new', '2026-10-21')])), { baseId: 'a', targetId: 'b' });
  assert.deepEqual(pickDefaultComparison(buildApprovalTimeline(null, parsed([raw('a', '2026-10-19'), raw('b')]), undefined)), { baseId: 'a', targetId: 'b' });
  assert.equal(pickDefaultComparison(timeline()), null);
  assert.equal(pickDefaultComparison(timeline(current('a', { snapshotId: undefined }), [{ id: 'bad', data: {} }, raw('old')])), null);
  assert.equal(pickDefaultComparison(timeline(current(), [raw('new', '2026-10-21')], { status: 'found', doc: raw() })), null);
});

test('2: email/uid fallbacks in historical requestedBy data are never displayed as names', () => {
  for (const requestedBy of ['private@example.test', 'user-private', '']) {
    const p = projectWithApproval(); p.designApproval!.requestedBy = requestedBy;
    assert.equal(summarizeCurrentApproval(p)!.requestedBy, HISTORY_LABELS.noName);
  }
  assert.equal(timeline(current('a', { requestedBy: 'private@example.test' }))[0].submitterLabel, HISTORY_LABELS.noName);
  assert.equal(timeline(current('a', { requestedBy: 'user-private' }))[0].submitterLabel, HISTORY_LABELS.noName);
});

test('follow-up 1: timeline wording, structured times and privacy table', () => {
  const replaced = `${HISTORY_LABELS.earlier} · ${HISTORY_LABELS.replaced}`;
  const locked = { id: 'locked', data: snapshot('locked', '2026-10-19', 'a').metadata };
  const cases = [
    { name: 'no current', c: null, doc: raw('old'), kind: 'not-current', outcome: HISTORY_LABELS.notCurrent, prefix: 'บันทึกเมื่อ', time: '2026-10-20T12:00:00Z', suffix: ' (ไม่ยืนยันว่ายื่นสำเร็จ)' },
    { name: 'newer orphan', c: current(), doc: raw('old', '2026-10-21'), kind: 'not-current', outcome: HISTORY_LABELS.notCurrent, prefix: 'บันทึกเมื่อ', time: '2026-10-21', suffix: ' (ไม่ยืนยันว่ายื่นสำเร็จ)' },
    { name: 'equal', c: current(), doc: raw('old'), kind: 'earlier', outcome: replaced, prefix: 'บันทึกเมื่อ', time: '2026-10-20T12:00:00Z' },
    { name: 'older', c: current(), doc: raw('old', '2026-10-19'), kind: 'earlier', outcome: replaced, prefix: 'บันทึกเมื่อ', time: '2026-10-19' },
    { name: 'new round', c: current('new', { requestedAt: '2026-10-22' }), doc: raw('old'), kind: 'earlier', outcome: replaced, prefix: 'บันทึกเมื่อ', time: '2026-10-20T12:00:00Z' },
    { name: 'bad created', c: current(), doc: raw('old', 'bad'), kind: 'earlier', outcome: HISTORY_LABELS.earlier, prefix: 'บันทึกเมื่อ ไม่ทราบเวลา' },
    { name: 'bad requested', c: current('a', { requestedAt: 'bad' }), doc: raw('old'), kind: 'earlier', outcome: HISTORY_LABELS.earlier, prefix: 'บันทึกเมื่อ', time: '2026-10-20T12:00:00Z' },
    { name: 'current lock', c: current('a', { snapshotId: 'locked', backfilled: true }), doc: locked, kind: 'current-backfilled', outcome: 'Pending Approval · Planning', prefix: 'ล็อกเมื่อ', time: '2026-10-19' },
    { name: 'older lock', c: current(), doc: locked, kind: 'earlier', outcome: replaced, prefix: 'ล็อกเมื่อ', time: '2026-10-19' },
    { name: 'orphan lock', c: null, doc: locked, kind: 'not-current', outcome: HISTORY_LABELS.notCurrent, prefix: 'ล็อกเมื่อ', time: '2026-10-19' },
    { name: 'bad lock time', c: null, doc: { id: 'locked', data: snapshot('locked', 'bad', 'a').metadata }, kind: 'not-current', outcome: HISTORY_LABELS.notCurrent, prefix: 'บันทึกเมื่อ ไม่ทราบเวลา' },
    { name: 'invalid', c: null, doc: { id: 'broken', data: null }, kind: 'invalid', outcome: 'ข้อมูลเวอร์ชันไม่ถูกต้อง', prefix: 'บันทึกเมื่อ ไม่ทราบเวลา', disabled: true },
  ];
  for (const row of cases) {
    const entries = buildApprovalTimeline(row.c, parsed([row.doc]), 'user-private', row.c?.snapshotId === 'a' ? { status: 'found', doc: raw() } : undefined, 'project');
    const e = entries.find(e => e.id === row.doc.id)!;
    assert.equal(e.kind, row.kind, row.name); assert.equal(e.outcome, row.outcome, row.name);
    assert.deepEqual(e.timeParts, { prefix: row.prefix, ...(row.time ? { time: row.time } : {}), ...(row.suffix ? { suffix: row.suffix } : {}) }, row.name);
    assert.equal(e.timeLabel, row.time ? `${row.prefix} ${row.time}${row.suffix || ''}` : row.prefix, row.name);
    assert.equal(e.openable, !row.disabled); assert.equal(e.comparable, !row.disabled);
    if ((row.doc.data as any)?.backfill && !e.current) assert.equal(e.submitterLabel, HISTORY_LABELS.noName);
    for (const entry of entries) assert.doesNotMatch(JSON.stringify([entry.label, entry.timeLabel, entry.timeParts, entry.submitterLabel, entry.outcome]), /user-private|@example/);
    if (row.name === 'newer orphan') {
      const pinned = entries.find(e => e.current)!;
      assert.equal(pinned.kind, 'current-frozen'); assert.equal(pinned.outcome, 'Pending Approval · Planning');
      assert.deepEqual(pinned.timeParts, { prefix: 'ยื่นเมื่อ', time: row.c!.requestedAt });
    }
  }
  for (const [c, kind, label] of [
    [current('a', { snapshotId: undefined }), 'current-legacy-live', HISTORY_LABELS.legacy],
    [current(), 'current-unavailable', HISTORY_LABELS.unavailable],
  ] as const) {
    const e = buildApprovalTimeline(c, [], 'user-private')[0];
    assert.equal(e.kind, kind); assert.equal(e.timeLabel, label); assert.deepEqual(e.timeParts, { prefix: label });
    assert.equal(e.openable, false); assert.equal(e.comparable, false);
    assert.doesNotMatch(JSON.stringify([e.label, e.timeLabel, e.submitterLabel, e.outcome]), /user-private|@example/);
  }
});
