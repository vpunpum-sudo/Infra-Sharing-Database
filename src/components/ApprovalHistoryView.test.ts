import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalDiffSummary, display, formatTotalValue } from './ApprovalDiffSummary';
import { ApprovalHistoryView } from './ApprovalHistoryView';
import { harness, raw, current, snapshot, deferred, project, projectWithApproval } from '../utils/approvalHistory.testFixtures';
import { HISTORY_LABELS } from '../utils/approvalHistory';
import { diffApprovalSnapshots } from '../utils/approvalSnapshotDiff';
import { ApprovalHistoryEntry } from './ApprovalHistoryEntry';
import { DEFAULT_PERMISSIONS } from '../constants';
const render = (h: ReturnType<typeof harness>) => renderToStaticMarkup(React.createElement(ApprovalHistoryView, { state: h.controller.getState(), controller: h.controller, formatTime: () => 'LOCAL TIME' }));
function contract(markup: string) {
  const root = markup.match(/^<section\b[^>]*>/)?.[0]; assert.ok(root); assert.match(root, /data-wi-pii="approval-history"/);
  assert.doesNotMatch(root, /aria-label=|title=|Synthetic|PRIVATE-DOC|user-private/); assert.doesNotMatch(markup, /data-wi-project-id|user-private|@example/);
}
test('10: Draft with orphan snapshots renders timeline and two-newest comparison', async () => {
  const h = harness(); await h.controller.open(null); const html = render(h); contract(html);
  assert.ok(!html.includes('>คำขอปัจจุบัน</span>')); assert.ok(html.includes('ไม่ยืนยันว่ายื่นสำเร็จ')); assert.match(html, /บันทึกเมื่อ LOCAL TIME/);
  assert.deepEqual(h.controller.getState().selection, { baseId: 'a', targetId: 'b' }); assert.equal(h.calls.snapshot, 0);
});
test('11: legacy current is pinned without open/compare; older entries remain', async () => {
  const h = harness(); await h.controller.open(current('legacy', { snapshotId: undefined })); const html = render(h); contract(html);
  assert.ok(html.includes(HISTORY_LABELS.legacy)); const first = html.match(/<li\b[\s\S]*?<\/li>/)![0]; assert.doesNotMatch(first, /<button|<select/); assert.equal(h.calls.metadata, 0);
  assert.ok(html.includes('appr_a')); assert.ok(!html.includes('value="legacy:legacy"'));
});
test('12: rejected current reason shown; earlier entry keeps truthful stored-data text', async () => {
  const h = harness(); await h.controller.open(current('b', { status: 'Rejected', rejectionReason: 'Needs revision' })); const html = render(h); contract(html);
  assert.match(html, /ถูกปฏิเสธ.*Needs revision/); assert.ok(html.includes(HISTORY_LABELS.replaced)); assert.ok(html.includes('คำขอปัจจุบัน'));
});
test('13: missing/error/invalid direct get identical generic UI, page fallback is actionable', async () => {
  const text: string[] = [];
  for (const lookup of [{ status: 'missing' }, { status: 'error' }, { status: 'found', doc: { id: 'b', data: {} } }] as const) {
    const h = harness(); h.behavior.metadata = async () => lookup; h.behavior.page = async () => ({ docs: [raw('a')], fetchedCount: 1, nextCursor: 1 }); await h.controller.open(current('b'));
    const html = render(h); contract(html); const first = html.match(/<li\b[\s\S]*?<\/li>/)![0]; assert.ok(first.includes(HISTORY_LABELS.unavailable)); assert.doesNotMatch(first, /<button/); text.push(first);
    assert.ok(html.includes('appr_a'));
    h.behavior.page = async () => ({ docs: [raw('a'), raw('b')], fetchedCount: 2, nextCursor: 2 }); await h.controller.open(current('b')); assert.ok(!render(h).includes(HISTORY_LABELS.unavailable));
    await h.controller.openVersion('b'); assert.equal(h.controller.getState().version.status, 'ready'); h.controller.selectBase('a'); h.controller.selectTarget('b'); await h.controller.compare(); assert.equal(h.controller.getState().compare.status, 'ready');
  }
  assert.equal(text[0], text[1]); assert.equal(text[1], text[2]);
});
test('14: 120 newer orphans, direct current beyond 100 cap openable/comparable and compare succeeds', async () => {
  const h = harness(); const newer = Array.from({ length: 120 }, (_, i) => raw(`orphan-${i}`, `2026-10-21T12:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`));
  h.behavior.page = async (_p, cursor, size = 20) => ({ docs: newer.slice(Number(cursor || 0), Number(cursor || 0) + size), fetchedCount: size, nextCursor: Number(cursor || 0) + size });
  h.behavior.metadata = async () => ({ status: 'found', doc: raw('a') });
  await h.controller.open(current('a')); for (let i = 0; i < 4; i++) await h.controller.paginate();
  const s = h.controller.getState(), e = s.list.entries.find(e => e.id === 'a')!; assert.equal(e.kind, 'current-frozen'); assert.equal(e.openable, true); assert.equal(e.comparable, true); assert.equal(s.list.fetchedCount, 100); assert.equal(s.list.entries.length, 101); assert.equal(h.calls.metadata, 1);
  assert.equal(s.selection.baseId, undefined); h.controller.selectBase('orphan-0'); h.controller.selectTarget('a'); await h.controller.compare(); assert.equal(h.controller.getState().compare.status, 'ready');
  await h.controller.openVersion('a'); const html = render(h); contract(html); assert.ok(html.includes('PRIVATE-DOC')); assert.ok(!html.includes(HISTORY_LABELS.unavailable)); assert.match(html, /ครบ 100 เวอร์ชัน/); assert.ok(!html.includes('>โหลดเพิ่ม<'));
});
test('15/17: empty/loading/error/populated roots are masked; list retry recovers', async () => {
  const h = harness(); const load = deferred<any>(); h.behavior.page = () => load.promise;
  const opening = h.controller.open(null); let html = render(h); contract(html); assert.match(html, /กำลังโหลดประวัติ/);
  load.resolve({ docs: [], fetchedCount: 0, nextCursor: null }); await opening; html = render(h); contract(html); assert.ok(html.includes(HISTORY_LABELS.empty));
  h.behavior.page = async () => { throw Error('network'); }; await h.controller.open(current()); html = render(h); contract(html); assert.match(html, /โหลดประวัติคำขอไม่สำเร็จ/); assert.match(html, /ลองอีกครั้ง/);
  h.behavior.page = async () => ({ docs: [raw()], fetchedCount: 1, nextCursor: 1 }); await h.controller.retry('list'); contract(render(h));
});
test('16: summary table render caps 50→100→150→200 with exact remainder, warnings and stored lengths', async () => {
  const h = harness(); const data = snapshot();
  Object.assign(data.collections, {
    routes: Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Route ${i}`, capacity: 1, totalLength: 5, path: [], cores: [] })),
    enclosures: Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Box ${i}`, position: { lat: 0, lng: 0 } })),
    loops: Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Loop ${i}`, length: 2, position: { lat: 0, lng: 0 } })),
  });
  (data.collections.routes as any).push(null); h.behavior.snapshot = async () => data;
  await h.controller.open(null); await h.controller.openVersion('a');
  for (const expected of [50, 100, 150, 200, 200]) {
    const html = render(h); contract(html); for (const key of ['routes', 'enclosures', 'loops']) {
      assert.equal(html.match(new RegExp(`data-history-row="version/${key}"`, 'g'))?.length, expected);
      h.controller.showMoreRows(`version/${key}`);
    }
    assert.ok(html.includes(`และอีก ${500 - expected} รายการ`)); assert.match(html, /ความยาวที่บันทึกไว้ \(ม\.\)/); assert.match(html, /ข้ามข้อมูลไม่ถูกต้อง 1 รายการ/);
    assert.ok(html.includes(project.name));
  }
});
test('16: diff counts before closed details, capped row steps, exact remainder and empty message', async () => {
  const h = harness(); const a = snapshot(), b = snapshot(); b.collections.routes = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: 'Route', capacity: 1, path: [], cores: [] }));
  b.collections.enclosures = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: 'Box', position: { lat: 0, lng: 0 } }));
  b.collections.loops = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: 'Loop', position: { lat: 0, lng: 0 }, routeId: 'r', length: 2 }));
  (b.collections.routes as any).push(null);
  h.behavior.snapshot = async id => id === 'a' ? a : b; await h.controller.open(null); await h.controller.compare();
  for (const count of [50, 100, 150, 200, 200]) {
    const html = render(h); for (const key of ['routes', 'enclosures', 'loops']) assert.equal(html.match(new RegExp(`data-history-row="diff/${key}"`, 'g'))?.length, count); assert.match(html, /ข้ามข้อมูลไม่ถูกต้อง 1 รายการ/); assert.ok(html.indexOf('<dl') < html.indexOf('<details')); assert.match(html, /<details class=/); assert.doesNotMatch(html, /<details[^>]*\bopen/); assert.ok(html.includes(`และอีก ${500 - count} รายการ`)); for (const key of ['routes', 'enclosures', 'loops']) h.controller.showMoreRows(`diff/${key}`);
  }
  const empty = diffApprovalSnapshots(a, a); const state = { ...h.controller.getState(), compare: { ...h.controller.getState().compare, diff: empty } };
  assert.ok(renderToStaticMarkup(React.createElement(ApprovalHistoryView, { state, controller: h.controller })).includes('ไม่มีการเปลี่ยนแปลง'));
});
test('version/compare error states stay inline and expose retry, no partial summary', async () => {
  const h = harness(); await h.controller.open(null); h.behavior.snapshot = async () => { throw Error('incomplete'); };
  await h.controller.openVersion('a'); let html = render(h); contract(html); assert.match(html, /โหลดเวอร์ชันไม่สำเร็จ/); assert.match(html, /ลองอีกครั้ง/); assert.ok(!html.includes(project.name));
  await h.controller.compare(); html = render(h); assert.match(html, /เปรียบเทียบไม่สำเร็จ/); assert.ok(!html.includes('สิ่งที่เปลี่ยนแปลง'));
});
test('20: every role uses viewApprovalDocs gate, no reads before explicit click and no action UI', async () => {
  for (const permissions of Object.values(DEFAULT_PERMISSIONS)) for (const p of [project, projectWithApproval()]) {
    const h = harness(); const content = permissions.viewApprovalDocs ? React.createElement(ApprovalHistoryEntry, { project: p, uid: 'user', readerFactory: () => h.reader }) : null;
    const html = renderToStaticMarkup(content); assert.equal(html.includes('ประวัติคำขอ'), permissions.viewApprovalDocs); assert.equal(h.calls.page, 0); assert.equal(h.calls.metadata, 0); assert.equal(h.calls.snapshot, 0); assert.ok(!html.includes('data-wi-pii="approval-history"'));
  }
  const h = harness(); await h.controller.open(current('b')); await h.controller.openVersion('a'); await h.controller.compare();
  const html = render(h); for (const match of html.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)) assert.doesNotMatch(match[1], /ลงนาม|ปฏิเสธ|ถอยกลับ|ล็อก|ส่งออก|แก้ไข|export|sign/i);
});

test('follow-up 7: km before/after/delta rounded, integers unchanged and negative zero normalised', () => {
  const diff = diffApprovalSnapshots(snapshot(), snapshot());
  diff.totals.storedRouteLengthKm = { before: 0.1 + 0.2, after: 12.345000000000001, delta: 12.045000000000002 };
  diff.totals.routes = { before: 3, after: 4, delta: 1 };
  const html = renderToStaticMarkup(React.createElement(ApprovalDiffSummary, { diff, rows: {}, onShowMore: () => {} }));
  assert.ok(html.includes('0.3 → 12.345 (ผลต่าง 12.045)')); assert.ok(html.includes('3 → 4 (ผลต่าง 1)'));
  assert.doesNotMatch(html, /\d+\.\d{8,}/);
  for (const [value, expected] of [[-12.345000000000001, '-12.345'], [-0.0001, '0'], [-0, '0'], [1.2, '1.2']] as const) assert.equal(formatTotalValue('storedRouteLengthKm', value), expected);
});
test('follow-up 8: display handles missing, arrays, known/malformed objects and primitives safely', () => {
  for (const [value, expected] of [
    [undefined, '-'], [null, '-'], [[], '-'], [[{ foo: 1 }, { points: 3 }], '-, 3 จุด'],
    [{ foo: 1 }, '-'], [{ movedMetres: 'x' }, '-'], [{ movedMetres: 1.234 }, 'ย้าย 1.23 ม.'],
    [{ points: 3 }, '3 จุด'], [{ lat: 1, lng: 2 }, '1, 2'], ['plain', 'plain'],
    [{ points: { foo: 1 } }, '-'], [{ lat: {}, lng: {} }, '-'], [{ movedMetres: {} }, '-'],
    [{ points: NaN }, '-'], [{ movedMetres: Infinity }, '-'],
  ]) {
    const result = display(value); assert.equal(result, expected); assert.ok(!result.includes('[object Object]'));
  }
});
test('follow-up 9: timeline and version header consume structured time; unknown labels bypass formatter', async () => {
  const h = harness(); await h.controller.open(null); await h.controller.openVersion('a');
  const state = h.controller.getState();
  state.list.entries = state.list.entries.map(e => ({ ...e, timeLabel: 'DO NOT PARSE THIS LABEL', timeParts: { prefix: 'PREFIX', time: '2026-10-20T12:00:00Z', suffix: ' SUFFIX' } }));
  const seen: string[] = [];
  const html = renderToStaticMarkup(React.createElement(ApprovalHistoryView, { state, controller: h.controller, formatTime: t => { seen.push(t); return 'LOCAL TIME'; } }));
  assert.ok(!html.includes('DO NOT PARSE')); assert.ok(html.includes('PREFIX LOCAL TIME SUFFIX')); assert.ok(seen.length > 0); assert.ok(seen.every(t => t === '2026-10-20T12:00:00Z'));
  assert.ok(html.includes(`${project.name} ·`));
  const section = html.slice(html.indexOf(`${project.name} ·`));
  // Localised text is present in the version summary as well as the timeline/options.
  assert.ok(section.includes('PREFIX LOCAL TIME SUFFIX'));
  state.list.entries = state.list.entries.map(e => ({ ...e, timeLabel: 'VERBATIM UNKNOWN', timeParts: { prefix: 'unused' } }));
  const unknown = renderToStaticMarkup(React.createElement(ApprovalHistoryView, { state, controller: h.controller, formatTime: () => { assert.fail('unknown time must not be formatted'); } }));
  assert.ok(unknown.includes('VERBATIM UNKNOWN')); assert.ok(!unknown.includes('unused'));
});
