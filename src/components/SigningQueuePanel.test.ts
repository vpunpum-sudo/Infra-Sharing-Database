import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SigningQueuePanel } from './SigningQueuePanel';
import { DEFAULT_PERMISSIONS } from '../constants';
import type { Project, User } from '../types';
import { checkMaskResult, WI_MASK_SPECS, WI_MASK_PLACEHOLDERS, type PageSnapshot } from '../utils/wiScreenshotMaskSpec';

const appUser: User = { id: 'synthetic', email: 'synthetic@example.test', role: 'Admin', isApproved: true };
const project: Project = { id: 'queue-fixture', uid: 'synthetic', name: 'Private synthetic project', routeCode: 'QA-ROUTE', owners: ['ITEL', 'SYMC'], designApproval: { id: 'request', documentNumber: 'PRIVATE-DOC', status: 'Pending Approval', requestedAt: '2026-10-20T12:00:00Z', requestedBy: 'Synthetic', requestedByUid: 'synthetic' } };
const render = (projects: Project[], permissions = DEFAULT_PERMISSIONS.Admin, u = appUser) => renderToStaticMarkup(React.createElement(SigningQueuePanel, { projects, appUser: u, permissions, onOpenApproval: () => {} }));

test('16: populated and empty panels satisfy the WI outer-container/descendant contract', () => {
  for (const projects of [[project], []]) {
    const markup = render(projects);
    const outer = markup.match(/^<section\b[^>]*>/)?.[0];
    assert.ok(outer);
    assert.match(outer, /data-wi-pii="other-project-card"/);
    assert.doesNotMatch(outer, /aria-label=|title=/);
    assert.doesNotMatch(markup, /data-wi-project-id/);
    if (projects.length) {
      assert.match(markup, /<button[^>]*type="button"[^>]*aria-label="เปิดเอกสารอนุมัติ Private synthetic project PRIVATE-DOC"/);
      for (const text of ['QA-ROUTE', 'PRIVATE-DOC', 'Planning', 'ITEL (คุณลงนามได้)', 'SYMC (คุณลงนามได้)', '(1 โครงการ)']) assert.ok(markup.includes(text), text);
    } else assert.match(markup, /ไม่มีโครงการที่รอคุณลงนาม/);
  }
});

test('16: synthetic masked PageSnapshot passes dashboard and card-actions checks; unmasked variant fails', () => {
  const masked: PageSnapshot = { bodyText: WI_MASK_PLACEHOLDERS.ownName, inputs: [], attrs: [], regions: {
    'account-name': { matches: 1, values: [WI_MASK_PLACEHOLDERS.ownName], maskValid: [true] },
    'other-project-card': { matches: 1, values: [], maskValid: [true] }
  } };
  const known = { displayName: project.name };
  for (const id of ['dashboard', 'card-actions'] as const) {
    assert.deepEqual(checkMaskResult(masked, WI_MASK_SPECS[id], known), []);
    const unsafe = { ...masked, bodyText: `${masked.bodyText} ${project.name} PRIVATE-DOC`, attrs: [`เปิด ${project.name} PRIVATE-DOC`] };
    assert.ok(checkMaskResult(unsafe, WI_MASK_SPECS[id], known).some(error => error === 'known-value' || error.startsWith('pii:')));
    assert.deepEqual(checkMaskResult(masked, WI_MASK_SPECS[id], { displayName: 'PRIVATE-DOC' }), []);
    assert.ok(checkMaskResult(unsafe, WI_MASK_SPECS[id], { displayName: 'PRIVATE-DOC' }).includes('known-value'));
  }
});

test('17,19: role-specific counts, signable-owner labels, empty state and Viewer visibility', () => {
  const planning = { ...appUser, role: 'Planning', owner: 'ITEL' } as User;
  const management = { ...appUser, role: 'Management', owner: 'UIH' } as User;
  const om = { ...project, id: 'om', owners: ['UIH'], designApproval: { ...project.designApproval!, planningSignOffs: { UIH: { owner: 'UIH', status: 'Approved' } } } } as Project;
  assert.match(render([project, om]), /\(2 โครงการ\)/);
  const planningMarkup = render([project, om], DEFAULT_PERMISSIONS.Planning, planning);
  assert.match(planningMarkup, /\(1 โครงการ\)/);
  assert.ok(planningMarkup.includes('ITEL (คุณลงนามได้)'));
  assert.ok(!planningMarkup.includes('SYMC (คุณลงนามได้)'));
  assert.match(render([project, om], DEFAULT_PERMISSIONS.Management, management), /O&amp;M/);
  assert.match(render([], DEFAULT_PERMISSIONS.Planning, planning), /ไม่มีโครงการที่รอคุณลงนาม/);
  assert.equal(render([project], DEFAULT_PERMISSIONS.Viewer, { ...appUser, role: 'Viewer' }), '');
});

test('18: updated project fixtures advance the stage and remove completed requests', () => {
  const signedPlanning = { ...project, designApproval: { ...project.designApproval!, planningSignOffs: Object.fromEntries(['ITEL', 'SYMC'].map(owner => [owner, { owner, status: 'Approved' }])) } } as Project;
  assert.match(render([signedPlanning]), /O&amp;M/);
  assert.match(render([signedPlanning], DEFAULT_PERMISSIONS.Planning, { ...appUser, role: 'Planning', owner: 'ITEL' }), /ไม่มีโครงการที่รอคุณลงนาม/);
  const completed = { ...signedPlanning, designApproval: { ...signedPlanning.designApproval!, omSignOffs: signedPlanning.designApproval!.planningSignOffs } };
  assert.match(render([completed]), /ไม่มีโครงการที่รอคุณลงนาม/);
});

test('20–23: dashboard integration passes unfiltered state to panel; timer stays inside child', () => {
  const dashboard = readFileSync('src/components/ProjectsDashboard.tsx', 'utf8');
  assert.match(dashboard, /canSeeSigningQueue\(userPermissions\) && \(\s*<SigningQueuePanel projects=\{projects\} appUser=\{appUser\} permissions=\{userPermissions\} onOpenApproval=\{setApprovalModalProject\}/);
  assert.ok(dashboard.indexOf('<SigningQueuePanel') < dashboard.indexOf('{/* Filter & Search Bar */}'));
  assert.doesNotMatch(dashboard, /useNow|setInterval/);
  const modal = readFileSync('src/components/DesignApprovalModal.tsx', 'utf8');
  assert.match(modal, /import \{ canSignAsOwner \} from '..\/utils\/approvalQueue'/);
  assert.match(modal, /const canUserSign = .*?=> \{\s*if \(!appUser \|\| snapshotUnavailable \|\| usingLivePreview\) return false;\s*return canSignAsOwner\(appUser, permissions, owner, level\);\s*\};/s);
});
