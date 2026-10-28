import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { aggregateDistanceMeters } from './approvalDocumentDistance';
const source = readFileSync('src/components/DesignApprovalModal.tsx', 'utf8');
const ast = ts.createSourceFile('modal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes: ts.Node[] = [];
function visit(node: ts.Node) { nodes.push(node); ts.forEachChild(node, visit); } visit(ast);
function memo(name: string) {
  const declaration = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name) as ts.VariableDeclaration;
  assert.ok(declaration?.initializer && ts.isCallExpression(declaration.initializer));
  return declaration.initializer.arguments[0].getText(ast);
}
const effects = nodes.filter(n => ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect') as ts.CallExpression[];

test('14/21/24: all modal output uses derived distances, units omit unknown, default is read-only', () => {
  for (const node of nodes) {
    if (ts.isIdentifier(node)) assert.ok(!['totalLength', 'markStart', 'markEnd', 'distanceTo', 'latLng'].includes(node.text), node.text);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.SlashToken) assert.notEqual(node.right.getText(ast), '1000');
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'toFixed') {
      assert.notEqual(node.arguments[0]?.getText(ast), '2');
    }
  }
  assert.doesNotMatch(source, /(?:\$?\{[^}\n]*\bdistanceKm[^}\n]*\})\s*(?:km|กม)/);
  for (const helper of ['documentRouteDistances', 'aggregateDistanceMeters', 'distanceWithUnit', 'resolveOperationKmInput', 'submittedOperationKm']) {
    assert.ok(nodes.some(n => ts.isImportSpecifier(n) && n.name.text === helper), `import ${helper}`);
    assert.ok(nodes.some(n => ts.isCallExpression(n) && n.expression.getText(ast) === helper), `call ${helper}`);
  }
  const defaultEffect = effects.find(n => n.getText(ast).includes('resolveOperationKmInput'))!;
  assert.ok(defaultEffect);
  assert.doesNotMatch(defaultEffect.getText(ast), /\b(saveDraftField|updateDoc|setDoc|attachApprovalSnapshot|writeApprovalSnapshot)\s*\(/);
  assert.match(defaultEffect.getText(ast), /ready: readiness.ready, defaultKm: liveDistanceKm/);
  assert.match(source, /documentRouteDistances\(liveSource.routes, liveSource.enclosures\)/);
  assert.match(source, /submittedOperationKm\(operationKmInput, liveDistanceKm\)/);
  assert.match(source, /distanceKm: routeSummary\?\.distanceKm \?\? '-'/);
  assert.equal((source.match(/distanceKm: '-'/g) || []).length, 2);
  assert.doesNotMatch(source, /current\s*\|\|/);
  assert.match(source, /onBlur=\{\(\) => saveDraftField\('totalOperationDistanceKm', Number.parseFloat\(operationKmInput\) \|\| 0\)\}/);
  assert.match(source, /\{permissions\?\.viewApprovalDocs && <ApprovalHistoryEntry project=\{project\} uid=\{appUser\?\.id\} \/>\}/);
});

test('20: project reset precedes default effect; touched is captured before deferred state update', () => {
  const resetIndex = effects.findIndex(n => n.getText(ast).includes('if (reset) operationKmTouchedFor.current = null'));
  const defaultIndex = effects.findIndex(n => n.getText(ast).includes('resolveOperationKmInput'));
  assert.ok(resetIndex >= 0 && defaultIndex > resetIndex);
  const effect = effects[defaultIndex].getText(ast);
  assert.match(effect, /const touched = operationKmTouchedFor.current === project.id/);
  assert.ok(effect.indexOf('const touched') < effect.indexOf('setOperationKmInput'));
  assert.doesNotMatch(effect.slice(effect.indexOf('current =>')), /operationKmTouchedFor.current/);
  assert.match(effect, /\[project.id,/);
  assert.match(source, /onChange=\{e => \{ operationKmTouchedFor.current = project.id; setOperationKmInput\(e.target.value\); \}\}/);
});

test('13: execute actual modal totals callback, each segment adds metres and shared cable counts cores once', () => {
  const callback = ts.transpile(`const calculate = ${memo('fiberRouteTotals')};`, { target: ts.ScriptTarget.ES2022 });
  const calculate = new Function('fiberRouteSchedule', 'aggregateDistanceMeters', `${callback}; return calculate();`);
  const segment = { cableId: 'c', distanceMeters: 1004, distanceKm: '1.00', symcCores: 4, uihCores: 3, itelCores: 2, totalCores: 9 };
  assert.deepEqual(calculate([segment, { ...segment }], aggregateDistanceMeters), {
    distanceKm: '2.01', symcCores: 4, uihCores: 3, itelCores: 2, totalCores: 9,
  });
});

test('11: actual modal grouping rounds unrounded metres, including unknown-only type', () => {
  const callback = ts.transpile(`const calculate = ${memo('fiberOpticSummary')};`, { target: ts.ScriptTarget.ES2022 });
  const calculate = new Function('fiberRouteSchedule', 'effectiveRoutes', 'aggregateDistanceMeters', `${callback}; return calculate();`);
  assert.deepEqual(calculate([{ capacity: 48, distanceMeters: 1004 }, { capacity: 48, distanceMeters: 1004 }, { capacity: 12 }], [{ fiberType: 'SM' }, { fiberType: 'SM' }, {}], aggregateDistanceMeters), [
    { label: 'OFC 48 Core (SM)', distanceKm: '2.01' }, { label: 'OFC 12 Core', distanceKm: '0.00' },
  ]);
});

test('23/26: document helper is pure and history graph cannot import it; geo imports only types', () => {
  const helper = readFileSync('src/utils/approvalDocumentDistance.ts', 'utf8');
  const forbidden = /\b(updateDoc|setDoc|addDoc|deleteDoc|writeBatch|runTransaction|httpsCallable|logActivity|uploadProjectFile|createApprovalPdf|exportApprovalPdf|createObjectURL|XMLHttpRequest|sendBeacon)\b|\bfetch\s*\(|\bwindow\s*\.\s*open\b/;
  assert.doesNotMatch(helper, forbidden);
  assert.doesNotMatch(helper, /firebase|react|finalDocuments/);
  const helperAst = ts.createSourceFile('helper.ts', helper, ts.ScriptTarget.Latest, true);
  for (const n of helperAst.statements) if (ts.isImportDeclaration(n)) assert.equal((n.moduleSpecifier as ts.StringLiteral).text, './geo');
  const graph = [
    ...['ApprovalHistoryEntry', 'ApprovalHistoryPanel', 'ApprovalHistoryView', 'ApprovalVersionSummary', 'ApprovalDiffSummary'].map(n => `src/components/${n}.tsx`),
    ...['approvalHistory', 'approvalSnapshotSummary', 'approvalSnapshotDiff', 'approvalHistoryController', 'approvalSnapshotReader', 'approvalSnapshotCache', 'approvalSnapshot', 'geo'].map(n => `src/utils/${n}.ts`),
    'src/services/approvalHistoryService.ts',
  ];
  for (const file of graph) assert.doesNotMatch(readFileSync(file, 'utf8'), /approvalDocumentDistance/, file);
  const geo = ts.createSourceFile('geo.ts', readFileSync('src/utils/geo.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  assert.deepEqual(geo.statements.filter(ts.isImportDeclaration).map(n => (n.moduleSpecifier as ts.StringLiteral).text), ['../types']);
});
