# Work Instruction map screenshots

Run `npm run wi:screenshots` locally when the map interface changes. The script captures the map detail popup and route context menu, then updates the two PNGs in `public/wi/` and `src/content/wiScreenshotMarks.ts`. The Work Instruction keeps its drawn figures until both PNGs are present.

## Setup

Run `npm install`. Playwright is already a development dependency. Then run `npx playwright install chromium` once per machine (about 150 MB). Installing the browser is a human step. The normal `npm run verify` does not launch Playwright or require its browser binary.

Create an ignored `.env.local` with placeholder values, replacing them locally:

```dotenv
WI_SCREENSHOT_EMAIL=sample-account@example.invalid
WI_SCREENSHOT_PASSWORD=replace-locally
WI_SCREENSHOT_PROJECT_ID=sample-project-id
WI_SCREENSHOT_BASE_URL=
WI_SCREENSHOT_ROUTE_NAME=
```

`WI_SCREENSHOT_EMAIL`, `WI_SCREENSHOT_PASSWORD`, and `WI_SCREENSHOT_PROJECT_ID` are required. `WI_SCREENSHOT_BASE_URL` is optional; when blank, the script starts and stops a local Vite server on a free port. `WI_SCREENSHOT_ROUTE_NAME` is optional; when blank, the first route listed is used. If set, it must match exactly one route name after trimming. Shell environment variables override `.env.local`. No credential values are printed or written to the output directory.

## Account and sample project

Use a dedicated, approved, low privilege test account that does not need a password change. It must have permission to see **Cut Fiber Here**, **Split at Enclosure**, and **Edit** in the route context menu. Sign-ins appear in production activity logs.

Use a sample project with no real customer data. It needs at least one Fiber route with an Enclosure on it, an unambiguous name if `WI_SCREENSHOT_ROUTE_NAME` is set, and the Routes layer turned on (the default). Keep it small enough that every route is clearly visible when **Focus all objects** shows all objects; the selected route must not be hidden by the sidebar or controls. If no route point is usable, choose a smaller project or another route.

The script waits up to 20 seconds for the Routes list to load and remain at the same count for about one second. An empty list at first is normal while data loads. An empty-list timeout means either that the project has no routes or that route data did not load in time.

## Actions and capture

The script signs in, opens the project, expands the ROUTES header if collapsed, clicks **Focus all objects**, left-clicks a validated point on the route, closes the detail popup with Escape or its close button, right-clicks the same geographic point, and closes the context menu with Escape. Focus all fits the loaded objects through `map.fitBounds`; the script does not rely on the initial map fit. It recomputes and validates the same length fraction on the route before each click because the popup may pan the map. The static `wi-route-*` classes on route polylines identify the path; changing them breaks the capture script.

It never clicks a sidebar route entry, context-menu command, zoom control, save or confirm button. It never drags or scroll-zooms the map, and it never accepts a native dialog. A dialog aborts the run. The account's access is deliberately limited because the script reads production project data and signs in to production Firebase.

Before either image is saved, all visible tiles must load and no Core Manager or Splice Manager panel may be open. If a mark cannot be measured, the script warns and keeps its previous position. To adjust a mark by hand, edit the corresponding `{ x, y }` percentage in `src/content/wiScreenshotMarks.ts`, then check the figure on screen and in print.

## Outputs and recovery

The script stages both PNGs and the marks module in an ignored `.wi-screenshots-tmp-*/` directory. It backs up existing targets and rolls back if a caught replacement error occurs. A process killed during replacement may leave a mixture of versions. Recover tracked files with:

```sh
git checkout -- public/wi src/content/wiScreenshotMarks.ts
```

On a first run, also delete any untracked `public/wi/*.png` files. A later run warns about and deletes stale temporary directories without restoring them. If rollback itself fails, preserve the printed temporary directory and `.bak` files for manual recovery.

Before the first run and any later run using a different account or project, start from a clean committed implementation tree. After the first run, and after changing accounts or projects, open the sample project and confirm its routes, enclosures, and cuts are unchanged. **Before every commit, open both PNGs and check them by eye for customer names, addresses, locations, network layout, or any other sensitive data.** A successful run should leave only the two PNGs and marks module changed or untracked.

The Work Instruction's numbered markers use fixed colours in light and dark themes and request exact print colours. Browsers and printers may still omit background colours when background graphics are off; check print preview and PDF output before sharing.
