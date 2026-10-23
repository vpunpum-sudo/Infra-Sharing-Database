import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PERMISSIONS } from '../constants';
import type { CoreOwner, DesignApproval, OwnerSignOff, Project, User, UserRole } from '../types';
import { buildSigningQueue, canSeeSigningQueue, canSignAsOwner, formatWaiting } from './approvalQueue';

const now = Date.parse('2026-10-23T12:00:00Z');
const hour = 3_600_000;
const user = (role: UserRole = 'Admin', owner?: CoreOwner): User => ({ id: 'synthetic', email: 'synthetic@example.test', role, owner, isApproved: true });
const approval = (patch: Partial<DesignApproval> = {}): DesignApproval => ({ id: 'request', status: 'Pending Approval', documentNumber: 'QA-DOC', requestedAt: new Date(now - 5 * hour).toISOString(), requestedBy: 'Synthetic', requestedByUid: 'synthetic', ...patch });
const project = (patch: Partial<Project> = {}): Project => ({ id: 'synthetic-project', name: 'Synthetic project', uid: 'synthetic', owners: ['ITEL', 'SYMC'], designApproval: approval(), ...patch });
const signs = (owners: CoreOwner[], status: OwnerSignOff['status'] = 'Approved') => Object.fromEntries(owners.map(owner => [owner, { owner, status }]));
const queue = (projects: Project[], u = user(), permissions = DEFAULT_PERMISSIONS[u.role]) => buildSigningQueue(projects, u, permissions, now);

test('1–3: Planning rows retain original project and distinguish unsigned from signable owners', () => {
  const p = project();
  const row = queue([p])[0];
  assert.equal(row.project, p);
  assert.equal(row.stage, 'Planning');
  assert.deepEqual(row.unsignedOwners, ['ITEL', 'SYMC']);
  assert.deepEqual(row.signableOwners, ['ITEL', 'SYMC']);
  assert.deepEqual(queue([p], user(), { ...DEFAULT_PERMISSIONS.Admin, approvePlanning: false }), []);
  const partial = project({ designApproval: approval({ planningSignOffs: signs(['ITEL']) }) });
  assert.deepEqual(queue([partial])[0].unsignedOwners, ['SYMC']);
  assert.deepEqual(queue([partial], user('Planning', 'ITEL')), []);
  const own = queue([p], user('Planning', 'ITEL'))[0];
  assert.deepEqual(own.unsignedOwners, ['ITEL', 'SYMC']);
  assert.deepEqual(own.signableOwners, ['ITEL']);
});

test('4–7: role, stage and absent/None owner follow existing permissions', () => {
  const om = project({ owners: ['UIH'], designApproval: approval({ planningSignOffs: signs(['UIH']) }) });
  assert.equal(queue([om], user('Management', 'UIH'))[0].stage, 'OM');
  assert.deepEqual(queue([om], user(), { ...DEFAULT_PERMISSIONS.Admin, approveOM: false }), []);
  assert.deepEqual(queue([project({ owners: ['UIH'] })], user('Management', 'UIH')), []);
  for (const role of ['Planning', 'Design', 'Viewer', 'Sub-contract'] as const) assert.deepEqual(queue([om], user(role, 'UIH')), []);
  for (const role of ['Viewer', 'Sub-contract'] as const) assert.deepEqual(queue([project()], user(role)), []);
  for (const owner of ['None', undefined] as const) {
    assert.deepEqual(queue([project()], user('Planning', owner))[0].signableOwners, ['ITEL', 'SYMC']);
    assert.deepEqual(queue([], user('Planning', owner)), []);
  }
  assert.deepEqual(buildSigningQueue([project()], null, DEFAULT_PERMISSIONS.Admin, now), []);
});

test('8: every status guard excludes inconsistent or completed requests', () => {
  const excluded = [project({ designApproval: undefined }),
    ...(['Approved', 'Rejected', 'Draft'] as const).map(status => project({ designApproval: approval({ status }) })),
    ...(['Completed', 'Rejected'] as const).map(approvalStage => project({ designApproval: approval({ approvalStage }) })),
    ...(['Approved', 'Rejected', 'Draft'] as const).map(status => project({ status }))];
  assert.deepEqual(queue(excluded), []);
  assert.equal(queue([project(), project({ status: 'Pending Approval' })]).length, 2);
});

test('9: participating owners use normalized ordered owners, fall back to owner and exclude unresolved owners', () => {
  const p = project({ owners: [' uih ', 'symc', 'ITEL', 'ITEL'] as CoreOwner[] });
  assert.deepEqual(queue([p])[0].unsignedOwners, ['ITEL', 'SYMC', 'UIH']);
  assert.deepEqual(queue([project({ owners: [], owner: 'SYMC' })])[0].unsignedOwners, ['SYMC']);
  assert.deepEqual(queue([project({ owners: undefined, owner: 'UIH' })])[0].unsignedOwners, ['UIH']);
  for (const owner of [undefined, 'None'] as const) assert.deepEqual(queue([project({ owners: undefined, owner })]), []);
});

test('10–11: derive stage from Approved sign-offs rather than stale stored stage', () => {
  for (const approvalStage of [undefined, 'Planning'] as const) {
    assert.equal(queue([project({ designApproval: approval({ approvalStage, planningSignOffs: signs(['ITEL', 'SYMC']) }) })])[0].stage, 'OM');
  }
  assert.equal(queue([project({ designApproval: approval({ approvalStage: 'OM' }) })])[0].stage, 'Planning');
  assert.deepEqual(queue([project({ designApproval: approval({ planningSignOffs: signs(['ITEL', 'SYMC']), omSignOffs: signs(['ITEL', 'SYMC']) }) })]), []);
  for (const status of ['Pending', 'Rejected'] as const) {
    assert.deepEqual(queue([project({ designApproval: approval({ planningSignOffs: signs(['ITEL', 'SYMC'], status) }) })])[0].unsignedOwners, ['ITEL', 'SYMC']);
    assert.deepEqual(queue([project({ designApproval: approval({ planningSignOffs: signs(['ITEL', 'SYMC']), omSignOffs: signs(['ITEL', 'SYMC'], status) }) })])[0].unsignedOwners, ['ITEL', 'SYMC']);
  }
});

test('12–13: sort oldest first with name ties, unknown dates last; latest request and missing fields', () => {
  const make = (name: string, requestedAt?: string) => project({ name, designApproval: approval({ requestedAt }) });
  const rows = queue([make('Unknown Z', 'invalid'), make('Beta', new Date(now - 5 * hour).toISOString()), make('Future', new Date(now + hour).toISOString()), make('Unknown A'), make('Alpha', new Date(now - 5 * hour).toISOString()), make('Oldest', new Date(now - 24 * hour).toISOString())]);
  assert.deepEqual(rows.map(row => row.name), ['Oldest', 'Alpha', 'Beta', 'Future', 'Unknown A', 'Unknown Z']);
  assert.equal(rows[3].waitingMs, 0);
  assert.equal(formatWaiting(rows[3].waitingMs), 'น้อยกว่า 1 ชม.');
  assert.equal(rows[4].waitingMs, null);
  assert.equal(formatWaiting(rows[5].waitingMs), 'ไม่ระบุ');
  const latest = queue([make('Resubmitted', new Date(now - hour).toISOString())])[0];
  assert.equal(latest.waitingMs, hour);
  const missing = queue([project({ routeCode: undefined, designApproval: approval({ documentNumber: undefined }) })])[0];
  assert.equal(missing.routeCode, '');
  assert.equal(missing.documentNumber, '');
});

test('12b: wait formatting floors boundary values and handles invalid values', () => {
  const cases: [number | null, string][] = [[0, 'น้อยกว่า 1 ชม.'], [60_000, 'น้อยกว่า 1 ชม.'], [3_599_000, 'น้อยกว่า 1 ชม.'], [hour, '1 ชม.'], [5 * hour, '5 ชม.'], [24 * hour - 60_000, '23 ชม.'], [24 * hour, '1 วัน'], [47 * hour, '1 วัน'], [72 * hour, '3 วัน'], [10000 * 24 * hour, '10000 วัน'], [null, 'ไม่ระบุ'], [NaN, 'ไม่ระบุ'], [-hour, 'น้อยกว่า 1 ชม.']];
  for (const [ms, expected] of cases) assert.equal(formatWaiting(ms), expected);
});

// DO NOT EDIT: owner/level predicate frozen from DesignApprovalModal.canUserSign
// at eb1c88cf891a4abad5d3a0a618edfcd71a407f68 (before extraction).
function frozenOldPredicate(appUser: User, permissions: typeof DEFAULT_PERMISSIONS.Admin | undefined, owner: CoreOwner, level: 'Planning' | 'OM') {
  if (!(level === 'Planning' ? permissions?.approvePlanning : permissions?.approveOM)) return false;
  if (appUser.role === 'Admin') return true;

  return !(appUser.owner && appUser.owner !== 'None' && appUser.owner !== owner);
}

test('14: frozen predicate parity over roles, owners, levels and every level permission combination', () => {
  for (const role of Object.keys(DEFAULT_PERMISSIONS) as UserRole[]) {
    for (const own of ['ITEL', 'SYMC', 'UIH', 'None', '', undefined, 'itel', ' ITEL ', 'ItEl']) {
      const appUser = user(role, own as CoreOwner);
      for (const owner of ['ITEL', 'SYMC', 'UIH', 'None'] as const) {
        for (const level of ['Planning', 'OM'] as const) {
          for (const approvePlanning of [false, true]) for (const approveOM of [false, true]) {
            const permissions = { ...DEFAULT_PERMISSIONS[role], approvePlanning, approveOM };
            assert.equal(canSignAsOwner(appUser, permissions, owner, level), frozenOldPredicate(appUser, permissions, owner, level), `${role}/${own}/${owner}/${level}/${approvePlanning}/${approveOM}`);
          }
          assert.equal(canSignAsOwner(appUser, undefined, owner, level), false);
        }
      }
    }
  }
  for (const owner of ['itel', ' ITEL ', 'ItEl']) assert.equal(canSignAsOwner(user('Planning', owner as CoreOwner), DEFAULT_PERMISSIONS.Planning, 'ITEL', 'Planning'), false);
  for (const level of ['Planning', 'OM'] as const) assert.equal(canSignAsOwner(user(), { ...DEFAULT_PERMISSIONS.Admin, approvePlanning: false, approveOM: false }, 'ITEL', level), false);
});

test('15: visibility requires both view permissions and at least one signing permission', () => {
  for (const viewProjects of [false, true]) for (const viewApprovalDocs of [false, true]) {
    for (const approvePlanning of [false, true]) for (const approveOM of [false, true]) {
      assert.equal(canSeeSigningQueue({ ...DEFAULT_PERMISSIONS.Admin, viewProjects, viewApprovalDocs, approvePlanning, approveOM }), viewProjects && viewApprovalDocs && (approvePlanning || approveOM));
    }
  }
});
