# logviewer-read-limit

Archived by `agent-flow` on 2026-10-21 after an approved review.

- Branch: `vpunpum-sudo/logviewer-limit`
- Base commit: `dd49d8f`
- Verification: `npm run verify`, Started: 2026-10-21T06:14:24Z, Exit code: 0

Status: APPROVED
Feature: logviewer-read-limit
Risk: STANDARD — this changes only how one admin page reads data, on the frontend. `firestore.rules`, indexes, backend functions, auth gates, deployment config and CI do not change. The new queries are narrower versions of the query that `match /logs/{logId} { allow read: if isAdmin(); }` already allows.

### Objective

Stop the System Activity Logs page (`src/components/LogViewer.tsx`) from reading every document in the `logs` collection each time it opens. It should also stop re-reading while the page stays open. Today the page uses an unbounded `onSnapshot(query(collection(db,'logs'), orderBy('timestamp','desc')))`. On 2026-10-21 this used up the Firebase Free Tier daily read quota and made production unusable. After this change, each open, refresh or "load more" makes one bounded query. Admins can still page back through older history when they need to.

### In scope

- Replace the unbounded realtime listener with one-time, bounded, cursor-paginated reads (`getDocs`):
  - First page and Refresh: `orderBy('timestamp','desc')`, `limit(LOG_PAGE_SIZE + 1)`.
  - Load more: the same query plus `startAfter(<DocumentSnapshot of the last displayed row>)`.
  - `LOG_PAGE_SIZE = 50` is a single named constant.
- A **Refresh** button and a **Load more** button.
- A count of the rows shown ("Showing N logs").
- An end-of-list indicator ("No more logs").
- Error states that can be retried, for both refresh and load-more.
- A new pure module, `src/utils/logPagination.ts`, with no React or Firebase imports. It holds all the decision logic:
  - query spec building;
  - page fetching through an injected fetcher;
  - page splitting and the `hasMore` decision;
  - merging and de-duplication;
  - the list-state reducer, including stale-response handling and retry;
  - the "should query" gate.
- Unit tests in `src/utils/logPagination.test.ts`. They run under `npm test`, which is part of `npm run verify`.
- `LogViewer.tsx` becomes a thin adapter that connects Firebase `query`/`getDocs` and React state to the pure module.
- These stay exactly as they are today:
  - the table markup and columns;
  - the expand/collapse detail panel;
  - the empty-state text "No activity logs found.";
  - the "Access Denied…" text;
  - the existing role-based admin gate;
  - `data-wi-pii="log-user"` and `data-wi-pii="log-description"` on the same cells.

### Out of scope

- Changes to `firestore.rules`, Firestore indexes (none needed), Cloud Functions, `src/services/logService.ts` (the write path), or log retention/TTL.
- Changes to any admin gate. This covers the role check in `LogViewer.tsx` and the `/logs` route in `App.tsx`. Email allow-lists in rules are not added to the UI gate.
- Server-side search or filtering, and date-range filters.
- Changing `UserLog` in `src/types.ts`. The Firestore doc id is carried in a local view type.
- Reducing reads on other pages.
- React component test infrastructure (jsdom, React Testing Library). Behaviour is covered through the pure module instead.
- Any deployment: Cloudflare frontend or Firebase functions.
- Changing the WI screenshot scripts or mask spec.

### Acceptance criteria

- [ ] `LogViewer.tsx` no longer imports or calls `onSnapshot`. Every `logs` query it builds comes from `buildLogPageQuery`, so every query has `limit(LOG_PAGE_SIZE + 1)`.
- [ ] `buildLogPageQuery(cursor?)` returns `{ orderByField: 'timestamp', direction: 'desc', limit: LOG_PAGE_SIZE + 1 }`. It adds `startAfter: cursor` only when a cursor is given.
- [ ] `fetchLogPage(fetcher, cursor?)`:
  - calls the injected fetcher exactly once, with that spec;
  - returns `{ items, nextCursor, hasMore }`;
  - shows at most `LOG_PAGE_SIZE` items and never shows the extra (+1) doc;
  - sets `hasMore` true only when the fetcher returned more than `LOG_PAGE_SIZE` docs;
  - sets `nextCursor` to the cursor of the last displayed item, or `null` when there are no items.
- [ ] The pure reducer `logListReducer` handles actions `start(kind, requestId)`, `success(requestId, page)` and `failure(requestId, error)`, where `kind` is `'refresh' | 'more'`:
  - **`start('refresh')`** always takes over as the current request, even while a load-more is pending. It keeps the existing rows visible until success.
  - **`start('more')`** is ignored unless all of these hold: no request is pending, `hasMore` is true, and a cursor exists.
  - **`success` or `failure` for an outdated request** (`requestId` is not the current one) is ignored. The state stays exactly the same.
  - **Refresh success** replaces the rows, de-duplicated within the page. It sets the cursor to `page.nextCursor` and sets `hasMore` from the page. It clears the error.
  - **Load-more success** appends the rows, de-duplicated by doc id with the first occurrence kept. It moves the cursor forward to `page.nextCursor`, or keeps the old cursor if that is null. It updates `hasMore` and clears the error.
  - **Failure (refresh or load-more)** keeps the existing rows, cursor and `hasMore`. It clears the pending request and sets `error = { kind, message }`, so the admin can retry by starting the same kind again.
- [ ] Button rules come from pure selectors:
  - **Refresh** is disabled only while a *refresh* is pending. It stays enabled while a load-more is pending, and clicking it then makes the pending load-more outdated through the request generation counter.
  - **Load more** is disabled while *any* request is pending. It is hidden when `hasMore` is false.
- [ ] `shouldQueryLogs(isAdmin, adminCheckDone)` returns true only when both are true. The component runs the first-page fetch only when it returns true.
- [ ] The UI shows:
  - "Showing N logs", where N is the current number of rows;
  - "No more logs" when the first page has loaded, `hasMore` is false and there is at least one row;
  - the existing empty-state row when there are zero rows and nothing is pending.
- [ ] The error message is short and generic, and the full error goes to `console.error`. A **Retry** control re-dispatches the failed kind (refresh or more).
- [ ] An expanded row stays expanded across load-more. After a refresh, it collapses if its doc id is no longer in the rows.
- [ ] Row rendering, the detail panel, empty-state text, "Access Denied…" text and both `data-wi-pii` attributes are unchanged. React keys and expansion use the Firestore doc id.
- [ ] `npm run verify` passes.
- [ ] `firestore.rules`, functions, the `App.tsx` route gate and deploy config are not changed. Nothing is deployed.

### Acceptance scenarios

Unit tests in `src/utils/logPagination.test.ts` cover scenarios 1–14. They use deterministic fixtures and fake fetchers that the tests resolve in a controlled order. Scenarios 15–18 are checked by review or static inspection.

1. **First-page query spec:** `buildLogPageQuery()` returns timestamp/desc, `limit` 51 (with `LOG_PAGE_SIZE` = 50) and no `startAfter`. `fetchLogPage(fetcher)` calls the fetcher once with exactly that spec.
2. **Next-page query spec:** `buildLogPageQuery(c)` and `fetchLogPage(fetcher, c)` pass `startAfter: c` with the same ordering and limit 51.
3. **Page splitting:**

   | Fetcher returns | Items shown | `hasMore` | `nextCursor` |
   |---|---|---|---|
   | 0 docs | 0 | false | `null` |
   | 12 docs | 12 | false | last item's cursor |
   | 50 docs | 50 | false | last item's cursor |
   | 51 docs | 50 | true | cursor of the 50th item, not the 51st |

4. **Refresh replaces the list:** start with 120 rows, cursor X and `hasMore` true. A refresh that succeeds with a 50-item page with `hasMore` true and cursor Y gives exactly those 50 rows, cursor Y, `hasMore` true and no error.
5. **Load more appends and de-duplicates:** start with 50 rows (ids a1..a50). A load-more page containing a50 plus b1..b49 gives 99 rows in the order a1..a50, b1..b49. The cursor moves to the page's `nextCursor`.
6. **End of list after load more:** a load-more page with 1 item and `hasMore` false gives 51 rows and `hasMore` false. `start('more')` is then ignored.
7. **Refresh outdates a pending load-more (race):** after `start('more', 1)` and then `start('refresh', 2)`:
   - `success(1, pageB)` that arrives late is ignored;
   - `success(2, pageA)` gives exactly pageA.

   Reversing the order of the two completions gives the same final state.
8. **Outdated failure is ignored:** after `start('more', 1)`, `start('refresh', 2)` and `failure(1, err)`, there is no error, and refresh 2 is still pending.
9. **Load-more failure keeps state:** start with 50 rows, cursor X and `hasMore` true. After `start('more', 3)` and `failure(3, err)`, the state still has 50 rows, cursor X and `hasMore` true, with `error.kind === 'more'` and nothing pending. The Load more selector is enabled again.
10. **Refresh failure keeps state:** start with 80 rows and cursor X. After `start('refresh', 4)` and `failure(4, err)`, the state still has 80 rows and cursor X, with `error.kind === 'refresh'` and the Refresh selector enabled.
11. **Retry works:**
    - After scenario 9, `start('more', 5)` then `success(5, page)` appends the page and clears the error.
    - After scenario 10, `start('refresh', 6)` then `success(6, page)` replaces the rows and clears the error.
12. **Initial-load failure:** from the empty initial state, `start('refresh', 1)` then `failure(1, err)` gives 0 rows and `error.kind === 'refresh'`, and Refresh/Retry is enabled. The UI shows the error and Retry rather than just a silent empty table.
13. **Button selectors:**
    - While a refresh is pending, Refresh and Load more are both disabled.
    - While a load-more is pending, Refresh is enabled and Load more is disabled.
    - When idle with `hasMore` true and a cursor set, both are enabled.
    - When idle with `hasMore` false, Load more is not offered.
    - `start('more')` while anything is pending leaves the state unchanged.
14. **No query before or without admin:** `shouldQueryLogs(false, false)`, `shouldQueryLogs(true, false)` and `shouldQueryLogs(false, true)` are false. Only `shouldQueryLogs(true, true)` is true.
15. **Admin permission (unchanged behaviour):** only a signed-in user whose `users/{uid}` document has `role === 'Admin'` reaches the logs table. That is the existing gates in `LogViewer.tsx` and the `/logs` route in `App.tsx`, which are not modified. Their bounded `getDocs` queries are allowed by the unchanged `allow read: if isAdmin()` rule. A non-Admin sees "Access Denied. Only administrators can view system logs.", and the component never calls `getDocs` on `logs` (it is guarded by `shouldQueryLogs`).
16. **Index:** `orderBy('timestamp','desc')` with `limit` and `startAfter(snapshot)` uses the automatic single-field index. No `firestore.indexes.json` entry is added. Using a snapshot cursor means docs with the same timestamp at a page boundary are neither skipped nor duplicated.
17. **Expand/collapse and rendering regression:**
    - Clicking a row toggles Environment Details and Additional Metadata as before, including for rows added by Load more.
    - Columns, formatting and the empty-state text are unchanged in the diff.
18. **WI screenshot regression:** `td[data-wi-pii="log-user"]` and `td[data-wi-pii="log-description"]` stay on the user and description cells, and the existing `wiScreenshot*` and `WiFigures` tests pass in `npm test`.

### Proposed design

**Realtime or one-time read: one-time `getDocs` plus Refresh.**

- **Reads are bounded and predictable.** A limited `onSnapshot` would still cost about one read for every new log written while the tab is open, and `logActivity` writes often, including from the admin's own navigation. It can also re-read the whole window when it reconnects after a long disconnect.
- **Mixing a live window with static `startAfter` pages adds edge cases.** Docs move out of the live window, which leads to gaps or duplicates.
- **This page is an audit view, not a live dashboard.** An explicit Refresh is simple, and the admin controls when reads happen.

**Pure module `src/utils/logPagination.ts`** (generic, no React or Firebase imports):

- **Page size:** `export const LOG_PAGE_SIZE = 50;`
- **Query spec:**
  - `export type LogPageQuerySpec<C> = { orderByField: 'timestamp'; direction: 'desc'; limit: number; startAfter?: C }`
  - `export function buildLogPageQuery<C>(cursor?: C | null): LogPageQuerySpec<C>`
- **Fetched docs and pages:**
  - `export type FetchedDoc<T, C> = { id: string; data: T; cursor: C }`
  - `export type LogPage<T, C> = { items: { id: string; data: T }[]; nextCursor: C | null; hasMore: boolean }`
- **Fetching:**
  - `export async function fetchLogPage<T, C>(fetcher: (spec: LogPageQuerySpec<C>) => Promise<FetchedDoc<T, C>[]>, cursor?: C | null): Promise<LogPage<T, C>>`
  - It uses `splitPage(docs, LOG_PAGE_SIZE)`, which is also exported.
- **Merging:** `export function mergeById<R extends { id: string }>(existing, incoming): R[]` keeps order and the first occurrence of each id.
- **State:** `LogListState<T, C>`:
  - `rows`
  - `cursor: C | null`
  - `hasMore: boolean`
  - `loaded: boolean`
  - `pending: { kind: 'refresh' | 'more'; requestId: number } | null`
  - `currentRequestId: number | null`
  - `error: { kind: 'refresh' | 'more'; message: string } | null`
- **Reducer and selectors:**
  - `initialLogListState()`
  - `logListReducer(state, action)`, following the rules in the acceptance criteria
  - selectors `canRefresh(state)`, `canLoadMore(state)`, `isEndOfList(state)`
- **Gate:** `shouldQueryLogs(isAdmin: boolean, adminCheckDone: boolean): boolean`

**Component `LogViewer.tsx` (adapter only):**

- **Admin check:** stays as it is today (`getDoc(users/{uid})`, role `'Admin'`), followed by `loading=false`. That gives `adminCheckDone = !loading`.
- **State:** `useReducer(logListReducer, …)`, with a `useRef` counter for request ids. The counter increments on each `start`.
- **Firestore fetcher:** builds the query with `query(collection(db,'logs'), orderBy(spec.orderByField, spec.direction), ...(spec.startAfter ? [startAfter(spec.startAfter)] : []), limit(spec.limit))` and runs `getDocs`. It maps each doc to `{ id: d.id, data: d.data() as UserLog, cursor: d }`.
- **`run(kind)`:**
  1. Ignore the call if the selector disallows it.
  2. Take a new id and dispatch `start(kind, id)`.
  3. Call `fetchLogPage(fetcher, kind === 'more' ? state.cursor : null)`.
  4. Dispatch `success(id, page)`, or `failure(id, genericMessage)` together with `console.error` of the full error.
- **First load:** an effect runs `run('refresh')` once when `shouldQueryLogs(isAdmin, !loading)` becomes true.
- **Expanded row:** expanded state keys on the doc id. After rows change, the expansion is cleared if its id is no longer present.
- **UI:**
  - A toolbar above the table shows the count text, a Refresh button (lucide `RefreshCw`, with a spinning or disabled state while a refresh is pending) and an error banner with Retry when `error` is set.
  - A footer below the table shows the "Load more" button (label "Loading…" while pending) or "No more logs".
  - Labels are in English to match the page. The table body and the `data-wi-pii` cells are not restructured.

**Security:** no rule or gate changes. Queries stay inside the admin-readable `logs` collection, and non-Admins never send them. PII handling is unchanged. The error text shown is generic, not raw Firestore messages.

### Expected files

- `src/components/LogViewer.tsx` (modified)
- `src/utils/logPagination.ts` (new)
- `src/utils/logPagination.test.ts` (new)

### Risks and rollback

- **Read cost is an estimate, not a billing guarantee.** Each open, refresh or load-more reads "at most `LOG_PAGE_SIZE + 1` log documents", plus the existing 1 `users/{uid}` read for the admin check. Firestore billing can add to this: an empty query result is charged a minimum of one read, and evaluating `isAdmin()` in rules can add document reads. Tests verify the query bound (limit and cursor), not billed reads. This still removes the unbounded full-collection read and the ongoing listener reads.
- **Older logs are no longer visible without clicking "Load more".** This is intended, and Load more pages back through older logs.
- **A refresh that fails keeps the existing rows and cursor and shows a retryable error,** so a temporary failure does not blank the page. A load-more that fails does the same.
- **Stale-response races** are handled by the request generation counter in the pure reducer, and covered by tests (scenarios 7 and 8).
- **`timestamp` is an ISO string, so ordering is lexicographic.** This is the same as today and is correct for ISO-8601 UTC. Docs without `timestamp` are excluded by `orderBy`, as they are now.
- **The new toolbar may shift the layout of the WI screenshot.** The mask spec targets `data-wi-pii` attributes, so it still works. Re-capturing screenshots is out of scope.
- **Rollback:** revert the commit. There is no data, rules or index migration.

### Verification

- Focused tests: `node --import tsx --test src/utils/logPagination.test.ts` (scenarios 1–14).
- Regression tests: the existing `src/utils/wiScreenshot*.test.ts` and `src/components/WiFigures.test.ts`, run through `npm test`.
- Static checks:
  - `grep -n "onSnapshot" src/components/LogViewer.tsx` returns nothing;
  - every `logs` query in the component is built from `buildLogPageQuery`;
  - `git diff --stat` shows no changes to `firestore.rules`, `functions/`, `src/App.tsx` or deploy config.
- Manual (optional, emulator or non-production project only, to avoid spending the production quota): scenarios 15 and 17.
- Full gate: `npm run verify`

### Deployment

- Target: NONE
- Surface: not applicable. Neither the Cloudflare frontend nor Firebase functions is deployed in this change.
- Required authorization: deploying would need a separate, explicit human instruction that names the target (Cloudflare frontend). Approving the plan or the review does not authorize deployment.

Status: APPROVED

### Diff reviewed

- Base: dd49d8f (main HEAD, "Capture WI screenshots for every figure from the live system (#84)")
- Head: working tree on `vpunpum-sudo/logviewer-limit`, not committed. It has one modified file, `src/components/LogViewer.tsx`, and two untracked files, `src/utils/logPagination.ts` and `src/utils/logPagination.test.ts`. `git status` shows nothing else, so `firestore.rules`, `functions/`, `src/App.tsx`, indexes, deploy config and the WI screenshot scripts are unchanged.
- Verification evidence checked: `npm run verify` exited 0 on the current tree, as the stage prompt states. I read the full diff and both new files. A static grep shows no `onSnapshot` in `LogViewer.tsx`. The only `getDocs` call (`src/components/LogViewer.tsx:49`) is inside the injected fetcher. That fetcher only receives specs from `fetchLogPage`, which builds them with `buildLogPageQuery`. The removed `Globe` and `MapPin` imports are no longer used anywhere in the file.

### Findings

- LOW: The empty state can flash briefly on first load (`src/components/LogViewer.tsx:197`, `src/components/LogViewer.tsx:349-353`). When `loading` becomes false, the component renders once before the first-load effect dispatches `start('refresh')`. During that render `pending` is still null, so "No activity logs found." can show for one frame before the request starts. This is cosmetic only. Starting the first fetch, or marking it pending, before that render would remove it.
- LOW: The count text has no plural handling (`src/components/LogViewer.tsx:117`). With one row it reads "Showing 1 logs". The plan wording is matched literally, so this is optional polish.
- LOW: An initial-load failure shows the error banner and the empty-state row together (`src/components/LogViewer.tsx:128-133`, `src/components/LogViewer.tsx:197`). Scenario 12 only requires the error and Retry to be visible, and they are. The extra empty-state row is a little redundant.
- LOW: `dispatchList` runs the reducer twice, once for `listStateRef` and once inside `useReducer` (`src/components/LogViewer.tsx:40-43`). Both runs see the same actions in the same order and the reducer is pure, so the two states stay the same. This synchronous ref is also what blocks double requests from rapid clicks. It is a correct pattern, just worth knowing about if the reducer ever stops being pure.

### Acceptance-criteria result

- [x] Every criterion checked against the implementation.
  - **No unbounded query:** `onSnapshot` is removed. Every `logs` query goes through `fetchLogPage` → `buildLogPageQuery` → `limit(LOG_PAGE_SIZE + 1)` (`src/utils/logPagination.ts:30-36`, `src/components/LogViewer.tsx:45-50`).
  - **Query spec:** `buildLogPageQuery` returns the exact spec and adds `startAfter` only when a cursor is given (`src/utils/logPagination.ts:30-36`). `fetchLogPage` calls the fetcher once. `splitPage` hides the extra (+1) document, sets `hasMore` only when more than `LOG_PAGE_SIZE` docs come back, and returns `nextCursor` as the last visible doc's cursor, or null when there are none (`src/utils/logPagination.ts:38-53`).
  - **Reducer rules all hold:**
    - `start('refresh')` always takes over and keeps the existing rows.
    - `start('more')` is ignored unless `canLoadMore` holds.
    - Outdated success or failure returns the same state object (`src/utils/logPagination.ts:79`).
    - Refresh success replaces the rows, de-duplicated within the page. Load-more success appends with first-occurrence de-duplication and keeps the old cursor when the new one is null.
    - Failure keeps rows, cursor and `hasMore`, clears pending, and sets `{ kind, message }`.
  - **Button selectors:** Refresh is disabled only while a refresh is pending. Load more is disabled while any request is pending and hidden when `hasMore` is false (`src/components/LogViewer.tsx:206-216`). Clicking Refresh during a load-more makes the load-more outdated through the request-id counter.
  - **Admin gate:** `shouldQueryLogs(isAdmin, !loading)` guards the first fetch (`src/components/LogViewer.tsx:349-353`). The "Access Denied…" early return comes before any render path that can call `run`. The role check is unchanged.
  - **UI:** it shows "Showing N logs", "No more logs" via `isEndOfList` (loaded, rows > 0, no more), and the empty state only when nothing is pending. The error message is generic, `console.error` gets the full error, and Retry re-runs the failed kind.
  - **Expansion and keys:** expansion keys on the doc id. It stays open across load-more and collapses after a refresh if the id is gone (`src/components/LogViewer.tsx:355-359`). React keys use the doc id.
  - **Unchanged markup:** the table columns, detail panel, empty-state and access-denied text, and both `data-wi-pii` attributes (`log-user`, `log-description`) are unchanged.
  - **Index (scenario 16):** a snapshot cursor (`QueryDocumentSnapshot`) is used for `startAfter`, so ties at a page boundary work. No index changes.
  - **Tests:** the 16 unit tests cover scenarios 1–14, including both completion orders for the race in scenario 7 and the outdated failure in scenario 8.
  - **Scope:** `npm run verify` passes. Rules, functions, the route gate and deploy config are unchanged. Nothing was deployed.

### Verdict

Verdict: APPROVED
