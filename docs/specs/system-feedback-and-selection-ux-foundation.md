# system-feedback-and-selection-ux-foundation

Archived by `agent-flow` on 2026-10-27 after an approved review.

- Branch: `vpunpum-sudo/signing-authority-rules`
- Base commit: `47ee894`
- Verification: `npm run verify`, Started: 2026-10-27T15:28:52Z, Exit code: 0

Status: APPROVED
Feature: system-feedback-and-selection-ux-foundation
Risk: STANDARD — this is a client-side UX and presentation change. It touches no auth, permission logic, Firestore rules, migrations, Cloud Functions, CI or deployment config. Existing permission checks stay exactly where they are. The only behaviour change is that delete dialogs now close on success instead of on any outcome, and they show an inline error on failure.
Mode: COLLAB

### Objective

Make the app feel responsive and self-explanatory, following `docs/specs/system-feedback-and-selection-ux.md`. At any moment a user can tell:
- which page, project and selection is active;
- whether the app received their action;
- whether that action is pending, succeeded or failed.

Delivery has two layers:
1. Shared primitives: `AsyncActionButton`, queued notifications, `PageHeader`/breadcrumb/project context, selected/active styles, skeleton/empty/error states, and interaction tokens.
2. Rollout pass 2, which applies them to navigation, the projects dashboard, project create/edit/delete, project context, and map selection.

Brand blue/gray, both color modes, Thai-first copy, role permissions and backend workflows stay unchanged.

### In scope

Shared primitives:
- **Pure logic in `src/utils/`.** It is unit-tested with the existing `node --test` runner, which has no DOM:
  - async-action state machine
  - single-flight guard
  - user-safe action error mapper
  - notification queue reducer
  - page-context/breadcrumb resolver
  - selection reconciler
  - active-filter counter
- **`AsyncActionButton`.**
- **Toast system.** `Toast.tsx` becomes a queued notification stack with a stable live region. The `useToast()(message, type?)` API stays backward compatible, and the `'warning'` kind is added.
- **`PageHeader`** with breadcrumbs, and **`ProjectContextBar`**.
- **`StateViews`:** skeleton, empty state, inline error with retry, stale/refresh banner.
- **Interaction tokens and state classes in `src/index.css`.** They have dark and light variants and a `prefers-reduced-motion` override.

Pass 2 applications:
- **Navigation**
  - Dashboard desktop nav and mobile menu show an active item with `aria-current="page"`.
  - Only the first nav item for a given path is marked current. `ตั้งค่า` and `โลโก้ Owner` both point at `/settings`.
  - The dashboard renders a `PageHeader` (title and breadcrumb).
  - `ProjectWorkspace` shows a breadcrumb `โครงการ › <project name>`.
  - A small route-effect component in `App.tsx` sets `document.title` from the page context on every route.
- **Dashboard**
  - Initial-load skeleton and a standardized empty state.
  - Active-filter count plus a "ล้างตัวกรอง" action.
  - The local `successMessage` toast block and its `setTimeout`s are replaced by the shared notifications.
  - English error text in the migrate flow becomes Thai.
- **Project create/edit/delete**
  - Save and delete use `AsyncActionButton`: pending verb, duplicate-submit protection, success toast.
  - Enter-key submit goes through the same single-flight guard.
  - On failure the modal stays open, typed values are kept, and an inline error shows with a toast. Today `handleFirestoreError` rethrows, so the failure is silent.
  - The delete dialog stays open and pending until `deleteDoc` and the activity log succeed.
- **Project context**
  - `ProjectContextBar` in the workspace sidebar replaces the ad-hoc block: name, route code, owners, status badge. It shows a skeleton while `currentProject` is loading.
  - A compact context chip stays visible over the map when the sidebar is collapsed.
  - The existing approval button and its role gating (`viewApprovalDocs`) are kept unchanged.
- **Map selection**
  - Sidebar rows for routes, enclosures and loops get the shared selected style and `aria-selected`.
  - The selected map route and enclosure get a halo/outline that differs from hover and status colors. Today selected and hover share `#3b82f6`.
  - Selection is reconciled against fresh snapshot data. If the selected route, enclosure or loop disappears, the selection clears and an info notice says why.
  - Route and enclosure delete confirmations stay open and pending until the backend confirms. On failure they stay open with an inline error. Today they close regardless.

### Out of scope

- **Follow-ups for rollout pass 3**, each a separate plan:
  - Files modal: upload/delete pending, progress.
  - Schedules modal.
  - Approval/signing: `DesignApprovalModal` (4.4k lines), signing queue, history. `ApprovalHistory*` and `SigningQueuePanel` are untouched.
  - Admin screens: `UserManagement`, `PermissionManagement`/`PermissionManager`, `LogViewer`, `OwnerLogoSettings`.
  - `ProfileSettings`, `SettingsManager`, `ForceChangePassword`, `Login`.
  - `PageHeader`/breadcrumb on non-dashboard routes (`/settings`, `/user-management`, `/logs`, `/permission-management`, `/profile`, `/manual`). Only `document.title` is covered now.
  - `ProjectContextBar`/chip inside the files/schedule/approval dialogs.
  - The remaining modals in `App.tsx`: enclosure/route/loop save, split/cut, `SpliceManager` and `CoreManager` actions.
- **Pass 4, consistency sweep:** remaining empty/loading/error states, responsive review, remaining English labels. This includes the Quota banner text in `App.tsx`.
- **Not changing:** `firestore.rules`, `functions/`, permissions, approval rules, schema, project ownership, deployment, CI. `ConfirmModal` and `useConfirm` are only touched for incidental token or class consistency. The route/enclosure/project delete dialogs keep their current structure (state-driven in `App.tsx`, inline in `ProjectsDashboard`).
- **Not renaming** strings or attributes that the Work Instruction screenshot tooling depends on:
  - exact labels `Back to Projects`, `สร้างโครงการ`, `ยกเลิก`, `ปิด` and the others in `EXACT_SAFE_LABELS` (`src/utils/wiScreenshotActions.ts`);
  - the `header` element and `data-wi-*` attributes.
  - Idle labels stay as they are; pending labels are transient.
- No fake progress percentages for operations that cannot report progress.

### Acceptance criteria

- [ ] Shared primitives exist and are used by the pass 2 surfaces. No pass 2 surface keeps a one-off toast, spinner or pending state for the actions listed above.
- [ ] The notification system queues messages (up to 3 visible, the rest waiting) instead of overwriting them. Errors use `role="alert"`, others `role="status"`, inside one always-mounted live region. The `useToast()(message, type?)` signature is unchanged for existing callers.
- [ ] `AsyncActionButton` shows idle, pending, success and error states. It sets `aria-busy`, blocks duplicate activation synchronously (not only via React state), and exposes a visible and screen-reader `disabledReason` when disabled.
- [ ] The primary nav shows the active item with `aria-current="page"` plus a non-hover style. Each pass 2 page exposes one h1 title and a breadcrumb whose last crumb has `aria-current="page"`. `document.title` reflects the current page on all routes.
- [ ] The workspace shows project name, route code (when set), owners and status in `ProjectContextBar`. It stays visible, as a compact chip, when the sidebar is collapsed.
- [ ] Selected rows and cards (route, enclosure, loop) and the selected map route and enclosure have a persistent style distinct from hover. They carry `aria-selected` (rows) and a marker that is not color-only.
- [ ] A selection whose entity no longer exists is cleared with an explanation. A selection is not cleared while its list is still loading.
- [ ] Project create, edit and delete show a pending verb ("กำลังสร้าง…", "กำลังบันทึก…", "กำลังลบ…"). On success they close and show a Thai success toast. On failure they keep the modal open and the input values, show an inline error, and also show an error toast.
- [ ] User-facing error text never contains raw Firestore or auth JSON (no emails, uids, paths). Unclassified errors get the caller's Thai generic fallback and are logged to `console`.
- [ ] Skeleton, empty, error and stale states are visually and semantically distinct on the dashboard project list.
- [ ] `src/index.css` defines the interaction tokens and state classes with light-theme variants. `prefers-reduced-motion: reduce` disables the new animations, transitions and shimmer. Brand palette and both color modes are visually preserved.
- [ ] No change to permission checks, Firestore paths, document shapes or log activity names.
- [ ] `npm run verify` passes. New unit tests cover every pure module listed under Interfaces.

### Acceptance scenarios

1. **Active nav (desktop).** Given an Admin on `/logs`, the "ประวัติการใช้งาน" item has `aria-current="page"` and an active style; no other item has it. On `/` the dashboard has no nav item marked current, but its breadcrumb shows only "โครงการ" as current.
2. **Duplicate-path nav.** On `/settings`, only the first of the two items that point at `/settings` carries `aria-current`.
3. **Active nav (mobile menu).** In the lg-hidden menu, the item for the current route is marked current and the menu still closes on navigation.
4. **Workspace breadcrumb.** On `/project/abc` with a loaded project "Route A", the breadcrumb is `โครงการ › Route A`. The "โครงการ" crumb links to `/`, and the last crumb is current. Before the project snapshot arrives, the second crumb reads "กำลังโหลดโครงการ…" and never shows `abc` or `undefined`. Unknown paths such as `/login` give no breadcrumbs.
5. **Project context persistence.** Collapsing the workspace sidebar leaves a visible chip with the project name. Reopening restores the full bar. Switching to another project replaces the name and does not flash the previous project's name.
6. **Save pending.** Clicking "สร้างโครงการ" shows the spinner and "กำลังสร้าง…", and the button is disabled with `aria-busy="true"`. Clicking again, or pressing Enter in the name field while pending, creates no second document. On success the modal closes, a green "สร้างโครงการแล้ว" toast appears, and the new card is listed.
7. **Save failure (permission).** If `setDoc` rejects with `permission-denied`, the modal stays open, the name, route code and owner inputs are unchanged, and an inline Thai permission message appears. A red toast announces it (`role="alert"`), the button returns to idle, and a retry works.
8. **Save failure (unknown error).** An unclassified error shows the generic Thai fallback. The raw error text and the email/uid JSON do not appear in the UI. The error is logged via `console.error`.
9. **Quota exceeded.** The quota path still sets the global quota flag (still via `handleFirestoreError`) and the user sees the quota-specific Thai message. The existing quota banner is unchanged.
10. **Delete pending.** Confirming "ลบโครงการ" keeps the dialog open with "กำลังลบ…" until `deleteDoc` and the log write finish. Only then does it close, and a toast "ลบโครงการแล้ว" appears. On failure the dialog stays open with an inline error and a retry button, and the project card is still listed.
11. **Cancel while pending.** The cancel button and the backdrop do not dismiss a pending delete. After a failure they dismiss it normally.
12. **Route/enclosure delete on the map.** The confirm dialog stays open while pending, and on success the selection of that item is cleared. On failure it stays open with an error message and the selection is kept. A user without `deleteRoutes` / `deleteEnclosures` still gets the existing permission error and never reaches the dialog.
13. **Notification queue.** Firing 5 notifications in the same tick shows 3 and queues 2. As each expires or is dismissed, the next appears and none is lost. An identical message and kind already showing or queued is not duplicated. Errors persist longer (6 s) than success (3 s). Existing `useToast()('...')` calls in `OwnerLogoSettings`, `SettingsManager`, `UserManagement` and others still work with no edits.
14. **Filters.** With a search query and an owner filter active, the dashboard shows "ตัวกรอง 2 รายการ" and a "ล้างตัวกรอง" button that resets both. With none active, the count and button are hidden. When filters produce zero results, the empty state says no results match and offers "ล้างตัวกรอง". When the user simply has no projects, it offers create (only if `createProjects` permission allows it).
15. **Initial load vs empty.** Before the first projects snapshot, the dashboard shows a skeleton list and not the empty state. After the snapshot, a refresh keeps the existing cards visible. If the snapshot errors after data exists, a stale banner shows and the data stays.
16. **Map selection (sidebar).** Selecting a route marks its sidebar row `aria-selected="true"` with a check/marker and a persistent accent. Hovering another row changes only the hover style. Selecting an enclosure deselects the route as it does today.
17. **Map selection (map).** The selected route is drawn with a halo that differs in color, weight and outline from the hover state. The selected enclosure icon has a visible ring and is not just brighter. Hover and selected on the same object stay distinguishable.
18. **Selection reconcile.** If another user deletes the selected route, the next snapshot clears `selectedRouteId` and shows "รายการที่เลือกถูกลบหรือไม่มีอยู่แล้ว". If the snapshot list has not loaded yet (`loadedLists` lacks it), the selection is kept. A selection that still exists survives a data refresh.
19. **Keyboard and AT.** All new interactive elements are reachable by Tab and show a visible `:focus-visible` ring. Pressing Enter or Space on `AsyncActionButton` behaves like a click once and is ignored while pending. The live region announces success and failure once. Disabled buttons with a `disabledReason` expose it via `aria-describedby` and `title`.
20. **Reduced motion.** With `prefers-reduced-motion: reduce`, shimmer, ping and pulse, toast slide and progress animations, and button spinners' non-essential transitions are removed or reduced. A spinner may still rotate, but state changes are instant.
21. **Light and dark mode.** Selected, active, skeleton, toast, error and success styles are legible in both themes. The `.light-theme [class*="bg-slate-…"]` override rules do not wash out the new classes. Brand blue and gray are unchanged elsewhere.
22. **Mobile width (~390px).** The page title and project name remain visible and the breadcrumb may truncate or collapse. The toast stack fits within the viewport with 44px dismiss targets. Pending labels do not overflow buttons.
23. **Regression: permissions.** A Viewer cannot open the create-project modal path it could not before. A role without `viewMap` still does not navigate on card click. Admin-only nav items stay admin-only. Role-gated approval button visibility is unchanged.
24. **Regression: WI screenshot tooling.** The labels in `EXACT_SAFE_LABELS` still exist as idle labels. `header`, `[data-wi-loaded]`, `[data-wi-project-fresh]` and `[data-wi-pii=...]` attributes are still present. Existing `wiScreenshot*.test.ts` still pass. New elements that show the project name or account name use the existing `data-wi-pii` markers if the redaction spec requires them.
25. **Regression: data.** Project documents written by create and edit have the same fields as before. Activity-log action names (`create_project`, `edit_project`, `delete_project`, `delete_route`, `delete_enclosure`) are unchanged.

### Proposed design

#### Data flow and boundaries

- All decision logic lives in pure, side-effect-free modules under `src/utils/`. React components are thin and consume them. This keeps the logic unit-testable without a DOM and keeps `firebase` imports out of the new modules.
- Components never call Firestore in the primitives. Callers pass `onAction` closures. Permissions are still evaluated by the callers exactly as today.
- `handleFirestoreError` stays the place where quota state and error logging happen. It still throws, so flows wrap it:

  ```ts
  try { handleFirestoreError(e, op, path) } catch { /* logged */ }
  ```

  Then they surface `describeActionError(e, fallbackThai)` in the UI. The thrown JSON is never rendered.

#### Async action lifecycle

- `reduceAsyncAction` models `idle → pending → success | error → idle`.
- `createSingleFlight` gives a synchronous re-entrancy guard (a ref-held flag). This closes the gap where React state has not yet re-rendered and a double click or Enter can fire twice.
- `AsyncActionButton` owns a single-flight and a reducer state:
  - It sets `aria-busy` and `disabled` while pending and shows a Loader2 spinner plus `pendingLabel`.
  - It shows `successLabel` for about 1.2 s if provided.
  - A rejected `onAction` is swallowed by the button after the caller has surfaced the error (the button never shows raw errors). The button then returns to idle with a brief error ring.
  - It clears its timers on unmount and does not set state after unmount.
  - A `pending` prop lets a parent force the pending state (for example, delete state held in parent state).

#### Notifications

- `Toast.tsx` keeps `Toast`, `ToastProvider`, `useToast` and `ToastType` exports. `ToastType` gains `'warning'`.
- `ToastProvider` holds `NotificationQueueState` via a reducer. It renders a single always-mounted container (`aria-live="polite"`, `aria-atomic="false"`). Each item is `role="alert"` for errors and `role="status"` otherwise.
- Each item self-dismisses after its `durationMs`. Timers are per-item and pause on hover/focus (optional). Dismiss buttons keep `aria-label="ปิดการแจ้งเตือน"`.
- IDs come from a module counter, not `Date.now()`, so two notifications in the same millisecond do not collide.

#### Orientation

- `resolvePageContext(pathname, {projectName})` is the single source of titles, breadcrumb trails and nav ids. `PageHeader` renders `<nav aria-label="เส้นทางหน้า"><ol>…</ol></nav>` and an h1. The last crumb gets `aria-current="page"`. On small screens, middle crumbs may hide but the current crumb stays.
- The dashboard's brand title ("FIBER SHARING DATABASE") is demoted from h1 to a non-heading element so each page has one h1. Workspace sidebar title likewise.
- `ProjectContextBar` takes `{ project: Project | null; compact?: boolean; actions?: ReactNode }`. When `project` is null it renders a skeleton. The status-badge code from `App.tsx` moves into a shared `ProjectStatusBadge` inside this file, with identical Thai labels and colors.

#### Selection and state styling

- `src/index.css` gets tokens, for example: `--ux-duration-fast/base`, `--ux-ease-standard`, `--ux-focus-ring`, `--ux-selected-bg/border/accent`, `--ux-success/warn/danger`, `--ux-radius`, `--ux-elevation-*`. It also gets classes: `.ux-selectable`, `.ux-selected` (`[aria-selected="true"]`, `[aria-current="page"]`, `[aria-pressed="true"]` variants), `.ux-skeleton` (shimmer), `.ux-pressable` (active scale), and a global `:focus-visible` ring for buttons, links and inputs (leaflet keeps its existing `outline: none`).
- Every new class has a `.light-theme` counterpart. The new classes avoid `bg-slate-*` substring names so the existing light-theme attribute overrides do not hit them.
- Map: in `FiberMap.tsx`, the selected route adds an underlay polyline (wider, halo color) beneath the main line, with a distinct selected color/weight. Hover stays a lighter highlight. `.enclosure-map-icon-selected` gets a ring/drop-shadow instead of only `brightness`. No change to how selection is set.
- `reconcileSelection(...)` runs in `ProjectWorkspace` effects keyed on the snapshot data. It runs only when `loadedLists` contains the relevant list, which guards the loading window.

#### Error handling, security and privacy

- `describeActionError` returns fixed Thai strings for permission-denied, resource-exhausted/quota, and network/unavailable. Anything else returns the caller's fallback. It never forwards `error.message`.
- No credentials, tokens or user data are added to the UI or logs. No new network calls and no new dependencies (uses the existing `motion` and `lucide-react`).
- The permission model is not touched. UI gating (`disabled`, hidden buttons) is cosmetic and the Firestore rules remain the authority.

### Interfaces

All modules are pure TypeScript, with no React, DOM or Firebase imports, and use named exports.

#### `src/utils/asyncAction.ts`

```ts
export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';
export interface AsyncActionState { readonly status: AsyncActionStatus; readonly message?: string }
export const IDLE_ACTION: AsyncActionState; // { status: 'idle' }
export type AsyncActionEvent =
  | { type: 'start' }
  | { type: 'succeed'; message?: string }
  | { type: 'fail'; message: string }
  | { type: 'reset' };
export function reduceAsyncAction(state: AsyncActionState, event: AsyncActionEvent): AsyncActionState;
```

Reducer rules:
- `start` from `pending` returns the same state object (duplicate ignored). From idle, success or error it returns `{status:'pending'}` with the message cleared.
- `succeed` and `fail` apply only while `pending`. In any other state they return the same state object. `succeed` gives `{status:'success', message?}` and `fail` gives `{status:'error', message}`.
- `reset` always returns `IDLE_ACTION`.

```ts
export const SKIPPED: unique symbol;
export interface SingleFlight {
  run<T>(task: () => Promise<T>): Promise<T | typeof SKIPPED>;
  isRunning(): boolean;
}
export function createSingleFlight(): SingleFlight;
```

Single-flight rules:
- If a task is running, `run` resolves `SKIPPED` immediately and does not call `task`.
- Otherwise it calls `task` and sets running synchronously, before awaiting.
- It clears running when the task resolves or rejects. A rejection propagates to the caller, and a synchronous throw from `task` is treated as a rejection.
- After settling, `run` accepts a new task.

```ts
export const ACTION_ERROR_MESSAGES: {
  readonly permission: string; // 'คุณไม่มีสิทธิ์ทำรายการนี้'
  readonly quota: string;      // 'โควต้าการเขียนข้อมูลวันนี้เต็มแล้ว กรุณาลองใหม่หลังโควต้ารีเซ็ต'
  readonly offline: string;    // 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
};
export function describeActionError(error: unknown, fallback: string): string;
```

Error-mapper rules:
- Input may be an `Error`, a string, or an object with a string `code` or `message`. Matching is case-insensitive over the combined `code` and `message`.
- `permission-denied` or `insufficient permissions` maps to `permission`.
- `resource-exhausted` or `quota exceeded` maps to `quota`.
- `unavailable`, `network`, `offline` or `failed to fetch` maps to `offline`.
- Anything else, including `null` and `undefined`, returns `fallback`.
- The return value is always one of those constants or `fallback`, so raw text such as an email or JSON is never returned.

#### `src/utils/notificationQueue.ts`

```ts
export type NotificationKind = 'success' | 'error' | 'info' | 'warning';
export interface QueuedNotification {
  readonly id: string; readonly message: string; readonly kind: NotificationKind; readonly durationMs: number;
}
export interface NotificationQueueState { readonly items: readonly QueuedNotification[] }
export const EMPTY_QUEUE: NotificationQueueState;
export const MAX_VISIBLE_NOTIFICATIONS: 3;
export const MAX_STORED_NOTIFICATIONS: 10;
export const NOTIFICATION_DURATION_MS: Record<NotificationKind, number>; // success 3000, info 4000, warning 5000, error 6000
export function enqueueNotification(
  state: NotificationQueueState,
  input: { message: string; kind?: NotificationKind; durationMs?: number },
  id: string,
): NotificationQueueState;
export function dismissNotification(state: NotificationQueueState, id: string): NotificationQueueState;
export function visibleNotifications(state: NotificationQueueState): readonly QueuedNotification[];
```

Queue rules:
- `kind` defaults to `'success'`. `durationMs` defaults to the table value, and a non-positive or non-finite `durationMs` also falls back to the default. An empty or whitespace-only `message` returns the same state.
- An item whose `message` and `kind` equal an existing item (visible or waiting) is not added, and the same state object is returned.
- New items are appended in order.
- When more than `MAX_STORED_NOTIFICATIONS` would be stored, the oldest waiting item (index `MAX_VISIBLE_NOTIFICATIONS`) is dropped. Visible items are never dropped.
- `dismissNotification` removes the id. An unknown id returns the same state object.
- `visibleNotifications` returns the first `MAX_VISIBLE_NOTIFICATIONS` items, so a waiting item becomes visible automatically when a visible one is dismissed.

#### `src/utils/pageContext.ts`

```ts
export type PrimaryNavId = 'projects' | 'settings' | 'users' | 'permissions' | 'logs' | 'profile' | 'manual';
export interface Breadcrumb { readonly label: string; readonly path?: string; readonly current?: boolean }
export interface PageContext { readonly navId: PrimaryNavId | null; readonly title: string; readonly breadcrumbs: readonly Breadcrumb[] }
export const APP_TITLE: 'Fiber Sharing Database';
export const PROJECT_LOADING_LABEL: 'กำลังโหลดโครงการ…';
export function resolvePageContext(pathname: string, options?: { projectName?: string }): PageContext;
export function isNavActive(itemPath: string, pathname: string): boolean;
```

Resolver rules:
- A trailing slash is normalized (`/logs/` equals `/logs`). Query and hash are not part of `pathname`.
- Titles:

  | Path | Title | navId |
  | --- | --- | --- |
  | `/` | `โครงการ` | `projects` |
  | `/project/:id` | `projectName` if non-empty after trim, else `PROJECT_LOADING_LABEL` | `projects` |
  | `/settings` | `ตั้งค่าระบบ` | `settings` |
  | `/user-management` | `จัดการผู้ใช้งาน` | `users` |
  | `/permission-management` | `กำหนดสิทธิ์ตามบทบาท` | `permissions` |
  | `/logs` | `ประวัติการใช้งานระบบ` | `logs` |
  | `/profile` | `โปรไฟล์` | `profile` |
  | `/manual`, `/system-summary` | `คู่มือการใช้งาน` | `manual` |

- Breadcrumbs:
  - `/` gives `[{label:'โครงการ', current:true}]`.
  - Every other known path gives `[{label:'โครงการ', path:'/'}, {label:<title>, current:true}]`.
  - Only the last crumb has `current:true`, and it has no `path`.
  - The project id is never used as a label.
- Unknown or auth paths (`/login`, `/pending-approval`, `/change-password`, anything else): `navId:null`, `title: APP_TITLE`, `breadcrumbs: []`.
- `isNavActive(itemPath, pathname)` is true when the normalized paths are equal, or when `itemPath` is `/` and `pathname` starts with `/project/`.

#### `src/utils/selection.ts`

```ts
export interface SelectionResult { readonly id: string | undefined; readonly cleared: boolean }
export function reconcileSelection(
  selectedId: string | undefined,
  existingIds: ReadonlySet<string> | readonly string[],
  listLoaded: boolean,
): SelectionResult;
export function countActiveFilters(
  values: Readonly<Record<string, string | undefined | null>>,
  neutral?: Readonly<Record<string, string>>,
): number;
```

- `reconcileSelection`:
  - With no `selectedId`, it returns `{id: undefined, cleared: false}`.
  - If `listLoaded` is false, it returns `{id: selectedId, cleared: false}` and never clears.
  - If the id is present, it returns `{id: selectedId, cleared: false}`.
  - If the id is absent, it returns `{id: undefined, cleared: true}`.
- `countActiveFilters` counts keys whose value, after trim, is non-empty and not equal to `neutral[key]`. Empty, undefined and null values do not count.

#### React primitives (signatures both sides rely on)

```ts
// src/components/Toast.tsx (existing exports preserved)
export type ToastType = 'success' | 'error' | 'info' | 'warning';
export function useToast(): (message: string, type?: ToastType) => void;

// src/components/AsyncActionButton.tsx
export interface AsyncActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> {
  onAction: () => Promise<unknown> | void;
  children: React.ReactNode;
  pendingLabel: string;
  successLabel?: string;
  disabledReason?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  pending?: boolean;
}
export function AsyncActionButton(props: AsyncActionButtonProps): React.ReactElement;
```

### File ownership

#### Tests

- src/utils/asyncAction.test.ts
- src/utils/notificationQueue.test.ts
- src/utils/pageContext.test.ts
- src/utils/selection.test.ts

#### Source

- src/utils/asyncAction.ts
- src/utils/notificationQueue.ts
- src/utils/pageContext.ts
- src/utils/selection.ts
- src/components/AsyncActionButton.tsx
- src/components/PageHeader.tsx
- src/components/ProjectContextBar.tsx
- src/components/StateViews.tsx
- src/components/Toast.tsx
- src/components/ProjectsDashboard.tsx
- src/components/FiberMap.tsx
- src/App.tsx
- src/index.css

### Expected files

- **New:**
  - `src/utils/asyncAction.ts`, `notificationQueue.ts`, `pageContext.ts`, `selection.ts` and their four `*.test.ts` files.
  - `src/components/AsyncActionButton.tsx`, `PageHeader.tsx`, `ProjectContextBar.tsx`, `StateViews.tsx`.
- **Changed:**
  - `src/components/Toast.tsx`: queued stack, `'warning'` kind, stable live region.
  - `src/components/ProjectsDashboard.tsx`:
    - nav `aria-current` and `PageHeader`
    - skeleton/empty/filter-count states
    - project save/delete flows
    - local toast removal
  - `src/App.tsx`:
    - `ProjectContextBar` in the sidebar plus the collapsed chip
    - breadcrumb
    - selection reconcile effects
    - route/enclosure delete pending flow
    - `document.title` route effect
  - `src/components/FiberMap.tsx`: selected halo for routes, selected ring for enclosures.
  - `src/index.css`: tokens, state classes, reduced-motion.
  - `docs/specs/system-feedback-and-selection-ux.md`: status line updated to "Pass 1 and 2 implemented; passes 3-4 pending" (docs only, outside the COLLAB file lists).
- **Possibly touched (only if needed):** `src/utils/wiScreenshotActions.ts` and its test, but only if a label has to change. The plan's default is to keep the labels.

### Risks and rollback

- **WI screenshot tooling coupling.** Changed labels or removed `data-wi-*` attributes could break `npm run wi:screenshots` and the exact-label allowlist. Mitigation: keep idle labels and attributes; the `wiScreenshot*` tests run in `npm test`; run `npm run wi:screenshots` if the environment is available (it needs credentials, so not part of the gate).
- **Light-theme CSS overrides.** `index.css` has many `.light-theme [class*="bg-slate-…"]` selectors that can silently restyle new elements. Mitigation: token-based classes with explicit light variants, and a manual dark and light check.
- **`App.tsx` and `DesignApprovalModal` size.** `App.tsx` is about 2.9k lines, so edits there must stay surgical: no refactor of unrelated handlers, no changes to the approval modal.
- **Delete flows now stay open on failure.** This is a deliberate behaviour change (previously they closed regardless). Mitigation: acceptance scenarios 10-12, plus guarding `setState` after unmount.
- **Selection reconcile misfires.** Clearing during the initial load would drop the user's selection. Mitigation: the `listLoaded` guard, tested in `selection.test.ts`.
- **Toast API drift.** About 10 files call `useToast`. Mitigation: the signature is unchanged, `'warning'` is additive, and `tsc` (lint) covers every caller.
- **Heading and semantic changes.** Demoting the brand h1 and adding landmarks could affect tooling that targets `header`. The `header` element is retained.
- **Browser QA gap.** Codex stages cannot launch Chromium in this environment, so browser-level visual QA (halo, light/dark, mobile) must be done in the Claude QA stage or by the human. Unit tests cannot prove rendering.
- **Rollback.** All changes are client-side and in one branch. Revert the commit(s) to restore the previous UI; there is no data, rules, function or schema change to undo.

### Verification

- Focused tests: `node --import tsx --test src/utils/asyncAction.test.ts src/utils/notificationQueue.test.ts src/utils/pageContext.test.ts src/utils/selection.test.ts`
- Existing suites that must stay green: all of `src/**/*.test.ts`, especially `wiScreenshotActions` and the other `wiScreenshot*` tests.
- Full gate: `npm run verify` (lint with `tsc --noEmit`, unit tests, functions tests, production build).
- Targeted browser QA (Claude QA or the human, not Codex), in dark and light mode at desktop and ~390px widths:
  - nav active state
  - breadcrumb and `document.title`
  - project create success and failure (simulated by going offline or by a Viewer-restricted role)
  - delete pending and failure
  - workspace sidebar collapse chip
  - route and enclosure selection halo and sidebar row
  - toast stacking
  - `prefers-reduced-motion`
  - keyboard Tab/Enter/Space
- Record the exact verify output in `.context/implementation.md`.

### Deployment

- Target: NONE
- Surface: not applicable
- Required authorization: None for this change. Merging does not deploy. Any Cloudflare frontend deploy needs separate, explicit human authorization naming the target.

Title: Independent review

Status: APPROVED

### Diff reviewed

- Base: `main` (HEAD 47ee894), working tree with uncommitted changes
- Head: working tree on `vpunpum-sudo/signing-authority-rules`. This covers the 6 modified source files (`src/App.tsx`, `FiberMap.tsx`, `ProjectsDashboard.tsx`, `Toast.tsx`, `index.css`, `skill-observations/log.md`) and the untracked new files (4 utils with their tests, `AsyncActionButton`, `PageHeader`, `ProjectContextBar`, `StateViews`, and the spec doc).
- Verification evidence checked: `npm run verify` exited 0 on the current tree. The implementer reports tsc clean, 114 unit tests passing and the build succeeding. I did not read `verify.log`. I read the diff for `App.tsx`, `AsyncActionButton.tsx`, `asyncAction.ts` and `selection.ts`. I read the remaining diffs more lightly: `FiberMap.tsx`, `Toast.tsx` and `ProjectsDashboard.tsx`.

### Findings

- MEDIUM: `src/App.tsx:947-960` and `src/App.tsx:1000-1013`. `deleteDoc` and `logActivity` share one try block. If `deleteDoc` succeeds but the activity log write fails, the dialog shows an error, "ลองใหม่" and a retry. The document is already deleted, so the retry runs a second delete, and the user is told the delete failed when it did not. The plan said the dialog should stay pending until both succeed, so this follows the plan. Consider treating a log failure as non-fatal.
- MEDIUM: `src/App.tsx:114-137`. The reconcile effects can fire on the user's own delete. The local snapshot can remove the route or enclosure before `deleteDoc` resolves, while the selected id is still set. The user would then see the "รายการที่เลือกถูกลบหรือไม่มีอยู่แล้ว" info notice alongside "ลบเส้นทางแล้ว". This is cosmetic duplication. The cause is that the delete handler clears the selection only after the await.
- LOW: `src/App.tsx:221`. `loadedLists` is reset when the project changes, so the guard against clearing a selection during the loading window holds. I verified this and no change is needed. I flag it because nothing tests the effect, and the implementer records that no browser QA was done.
- LOW: `src/components/AsyncActionButton.tsx:55-60`. A rejected `onAction` is swallowed and the button shows only a brief error ring. This is correct only if every caller surfaces the error itself. The dashboard callers do, per the implementer. A future caller that omits it would fail silently.
- LOW: `src/App.tsx:~1695`. The ad-hoc breadcrumb in the workspace sidebar duplicates `PageHeader` markup. This is acceptable because the plan scopes `PageHeader` to the dashboard.
- LOW: the implementer notes that no browser QA was done: the map halo, light and dark modes, 390px width, reduced motion and the toast stack. The selected-enclosure ring is CSS-only. These need a visual pass before release, but they do not block this review.

### Acceptance-criteria result

- [x] Shared primitives exist and are used on the pass 2 surfaces: dashboard, project create/edit/delete, workspace context, route and enclosure delete, and selection rows.
- [x] Notifications go through a queued `Toast` provider with a single live region. `useToast()(message, type?)` is backward compatible and adds `'warning'`.
- [x] The async action state machine, single-flight guard and error mapper are pure and unit-tested. `describeActionError` never forwards `error.message`.
- [x] Route and enclosure delete dialogs stay open and pending until the backend confirms, and show an inline error on failure. Cancel is disabled while pending.
- [x] Selection is reconciled against fresh snapshot data, gated on `loadedLists`, and shows an info notice.
- [x] Rows have `aria-selected` and `ux-selectable`. The sidebar brand `h1` is demoted so each page keeps one `h1`.
- [x] Backend, Firestore rules, permissions, `functions/`, approval flows and the `viewApprovalDocs` gating are untouched. No new dependencies.
- [ ] Visual and responsive behaviour (light and dark, 390px, reduced motion, map halo) has not been manually verified. This is non-blocking, and the implementer recorded it as a follow-up.

### Verdict

Verdict: APPROVED

Independence: SELF_REVIEW (Claude reviewed code it wrote; Codex was unavailable)
