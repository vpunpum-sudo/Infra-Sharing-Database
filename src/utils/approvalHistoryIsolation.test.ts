import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';

const trusted = 'src/utils/approvalSnapshot.ts';
const viewer = [
  'src/components/ApprovalHistoryEntry.tsx', 'src/components/ApprovalHistoryPanel.tsx', 'src/components/ApprovalHistoryView.tsx',
  'src/components/ApprovalVersionSummary.tsx', 'src/components/ApprovalDiffSummary.tsx',
  ...['approvalHistory', 'approvalSnapshotSummary', 'approvalSnapshotDiff', 'approvalHistoryController', 'approvalSnapshotReader', 'approvalSnapshotCache'].map(n => `src/utils/${n}.ts`),
  'src/services/approvalHistoryService.ts', trusted, 'src/utils/geo.ts', 'src/types.ts',
];
const allowed = new Set(viewer);
const reads = new Set(['collection', 'doc', 'getDoc', 'getDocs', 'query', 'orderBy', 'limit', 'startAfter', 'where']);
const forbidden = /\b(updateDoc|setDoc|addDoc|deleteDoc|writeBatch|runTransaction|httpsCallable|logActivity|uploadProjectFile|createApprovalPdf|exportApprovalPdf|createObjectURL|XMLHttpRequest|sendBeacon)\b|\bfetch\s*\(|\bwindow\s*\.\s*open\b/;
const forbiddenImport = /DesignApprovalModal|approvalSnapshotService|exportApprovalPdf|projectFileUpload|\bkmz\b|printProjectMap|logService|(^|\/)functions(\/|$)/;
function scan(root: string, fixtures: Record<string, string> = {}) {
  const visited = new Set<string>(), exceptions: string[] = [];
  function resolve(from: string, spec: string) {
    const path = posix.normalize(posix.join(posix.dirname(from), spec));
    return [path, `${path}.ts`, `${path}.tsx`].find(p => Object.hasOwn(fixtures, p) || existsSync(p)) || `${path}.ts`;
  }
  function walk(path: string) {
    if (visited.has(path)) return; visited.add(path);
    const source = fixtures[path] ?? readFileSync(path, 'utf8');
    assert.ok(!forbidden.test(source), `forbidden token: ${path}`);
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      // Dynamic module loading and reexports cannot bypass the graph allowlist.
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) assert.fail(`dynamic import: ${path}`);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) assert.fail(`reexport: ${path}`);
      if (ts.isImportDeclaration(node)) {
        assert.ok(ts.isStringLiteral(node.moduleSpecifier)); const spec = node.moduleSpecifier.text;
        assert.ok(!forbiddenImport.test(spec), `forbidden import: ${spec}`);
        const clause = node.importClause;
        const named = clause?.namedBindings;
        const runtime = clause?.isTypeOnly ? [] : [
          ...(clause?.name ? ['default'] : []),
          ...(named && ts.isNamespaceImport(named) ? ['*'] : named && ts.isNamedImports(named) ? named.elements.filter(e => !e.isTypeOnly).map(e => (e.propertyName || e.name).text) : []),
        ];
        if (spec === 'firebase/firestore') {
          for (const name of runtime) {
            if (path === trusted) { assert.equal(name, 'Timestamp', `trusted module runtime: ${name}`); exceptions.push(`${path}:${name}`); }
            else assert.ok(reads.has(name), `Firestore runtime: ${path}:${name}`);
          }
        } else if (spec === 'react' || spec === 'lucide-react') { /* approved external UI dependencies */ }
        else if (spec.startsWith('.')) {
          const target = resolve(path, spec);
          if (target === 'src/firebase.ts') { assert.ok(runtime.length > 0 && runtime.every(n => n === 'db'), 'firebase binding must be db'); }
          else { assert.ok(allowed.has(target), `relative import outside viewer graph: ${target}`); walk(target); }
        } else assert.fail(`package outside allowlist: ${spec}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  walk(root); return { visited, exceptions };
}
test('18: positive control walks real graph including exact Timestamp exception', () => {
  const result = scan('src/components/ApprovalHistoryEntry.tsx'); assert.ok(result.visited.has(trusted));
  assert.deepEqual(result.exceptions, [`${trusted}:Timestamp`]); assert.deepEqual(scan(trusted).exceptions, [`${trusted}:Timestamp`]);
  for (const file of viewer) assert.ok(result.visited.has(file), file);
});
test('18: negative controls reject write APIs, forbidden packages/modules and firebase bindings', () => {
  const path = 'src/components/ApprovalHistoryEntry.tsx';
  const imports = ['updateDoc', 'setDoc', 'addDoc', 'deleteDoc', 'writeBatch', 'runTransaction'].map(n => `import { ${n} } from 'firebase/firestore';`);
  imports.push("import { httpsCallable } from 'firebase/functions';", "import { uploadProjectFile } from '../utils/projectFileUpload';", "import { createApprovalPdf } from '../utils/exportApprovalPdf';", "import { exportApprovalPdf } from '../utils/exportApprovalPdf';", "import Modal from './DesignApprovalModal';");
  for (const n of ['auth', 'functions', 'loginWithEmail', 'logout']) imports.push(`import { ${n} } from '../firebase';`);
  for (const code of [...imports, "fetch('/example')", 'window.open()', 'navigator.sendBeacon()', 'URL.createObjectURL(blob)', 'new XMLHttpRequest()', "import * as firestore from 'firebase/firestore';", "import './Unknown';", "import('../firebase')"]) assert.throws(() => scan(path, { [path]: code }), code);
});
test('18: exception boundaries, aliases and erased types', () => {
  const path = 'src/components/ApprovalHistoryEntry.tsx';
  assert.throws(() => scan(path, { [path]: "import { Timestamp } from 'firebase/firestore';" }));
  const fake = 'other/approvalSnapshot.ts'; assert.throws(() => scan(fake, { [fake]: "import { Timestamp } from 'firebase/firestore';" }));
  for (const n of ['setDoc', 'serverTimestamp', 'getDoc']) assert.throws(() => scan(trusted, { [trusted]: `import { Timestamp, ${n} } from 'firebase/firestore';` }));
  assert.throws(() => scan(path, { [path]: "import { serverTimestamp as safe } from 'firebase/firestore';" }));
  assert.doesNotThrow(() => scan(path, { [path]: "import type { FieldValue } from 'firebase/firestore'; import { type DocumentData } from 'firebase/firestore';" }));
});
test('19/20: exact modal references and permission-gated unconditional entry, no other history binding', () => {
  const modal = readFileSync('src/components/DesignApprovalModal.tsx', 'utf8');
  let refs = 0; const ast = ts.createSourceFile('modal.tsx', modal, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const count = (node: ts.Node) => { if (ts.isIdentifier(node) && node.text === 'ApprovalHistoryEntry') refs++; ts.forEachChild(node, count); }; count(ast); assert.equal(refs, 2);
  assert.match(modal, /import \{ ApprovalHistoryEntry \} from '.\/ApprovalHistoryEntry';/);
  assert.match(modal, /\{permissions\?\.viewApprovalDocs && <ApprovalHistoryEntry project=\{project\} uid=\{appUser\?\.id\} \/>\}/);
  assert.doesNotMatch(modal, /approvalHistory|summarizeCurrentApproval|ApprovalHistoryPanel|ApprovalHistoryView|ApprovalVersionSummary|ApprovalDiffSummary/);
  assert.match(modal, /<div className="flex items-center gap-2 shrink-0">\s*\{permissions\?\.viewApprovalDocs && <ApprovalHistoryEntry[^\n]+\n\s*<button\s+onClick=\{\(\) => setViewMode\('slides'\)\}/);
  const panel = readFileSync('src/components/ApprovalHistoryPanel.tsx', 'utf8');
  assert.doesNotMatch(panel, /permissions|appUser|project:|reader:/);
  assert.match(panel, /Escape/); assert.doesNotMatch(panel, /controller\.dispose/);
});
