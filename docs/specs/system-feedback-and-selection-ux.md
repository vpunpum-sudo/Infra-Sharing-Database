# System Feedback and Selection UX Design

## Status

Draft for owner approval. No product code is changed by this document.

## Objective

Make the application feel responsive and self-explanatory at every interactive surface. A user should always be able to answer:

1. Which page and section am I in?
2. Which project or work context is active?
3. Which item, tab, filter, row, card, map feature, or form control is selected?
4. Did the system receive my action?
5. Is it still working, did it succeed, or did it fail?

The visual direction is modern professional, preserving the existing blue/gray brand while improving hierarchy, spacing, typography, state colors, and restrained motion.

## Design principles

- **Immediate acknowledgement:** visible response begins as soon as an action is invoked.
- **Persistent orientation:** page, project, and selection context remain visible while relevant.
- **One state language:** the same visual and textual conventions mean the same thing everywhere.
- **Progressive detail:** show concise status first and details or recovery actions when needed.
- **Safe interaction:** prevent duplicate submissions and preserve user input on failure.
- **Accessible by default:** state is communicated by text and semantics, not color alone.
- **Operational clarity over decoration:** polish must improve scanning and confidence.

## Experience model

### 1. Location hierarchy

The interface exposes three levels of location:

- **Application location:** the current primary navigation item is visibly active and uses `aria-current="page"`.
- **Page location:** a consistent page heading and breadcrumb show the route and parent section.
- **Work context:** when inside a project, a persistent project context element shows the project name, route code when available, and operator ownership.

On smaller screens the breadcrumb may collapse, but the current page and project name remain visible.

### 2. Selection hierarchy

All selectable UI uses a consistent selected treatment:

- Cards and rows use an accent border/background, a check or selected marker, and `aria-selected` where appropriate.
- Tabs and navigation items use a persistent active indicator rather than hover styling alone.
- Filters show their active state and the number of active filters; a clear/reset action is available.
- Map points, lines, and enclosures use a selected halo or outline that remains distinct from hover and status colors.
- Multi-select surfaces show a selection count and a clear-selection action.
- Form controls expose focus, validation, changed/unsaved, disabled, and read-only states distinctly.

Selection must remain stable through ordinary data refreshes when the selected entity still exists. When it no longer exists, the system clears the selection and explains why.

### 3. Action lifecycle

Every asynchronous action follows the same lifecycle:

1. **Idle:** clear action label and enabled/disabled reason.
2. **Pressed:** immediate visual press feedback.
3. **Pending:** spinner or progress indicator plus a specific verb such as “กำลังบันทึก…”. The initiating control is protected from duplicate submission.
4. **Success:** the changed content updates and a concise success confirmation appears.
5. **Failure:** an inline error appears near the affected work, with a retry action when safe; a toast may additionally announce the failure.

Longer actions show determinate progress when measurable. Short actions use an indeterminate indicator without inventing a percentage. Destructive actions remain open and visibly pending until the server confirms success.

### 4. Page and data states

Every data-driven region supports:

- An initial skeleton that resembles the final layout.
- A non-blocking refresh state that keeps existing data visible.
- A useful empty state with the next available action.
- An error state that explains what failed and offers retry when possible.
- A stale/offline indication when the screen cannot confirm current server state.

Full-screen spinners are reserved for application initialization or hard route gates.

## Shared interface foundation

Implementation should favor shared primitives instead of one-off states:

- `AsyncActionButton` for idle, pending, success, failure, and disabled-reason behavior.
- A queued application-level notification system so simultaneous messages do not overwrite one another.
- `PageHeader`, breadcrumbs, and a project context element for orientation.
- Reusable selected/active styles for navigation, cards, rows, tabs, filters, and map features.
- Shared skeleton, empty, inline-error, retry, and refresh indicators.
- Central interaction tokens for timing, focus rings, state colors, elevation, radius, and motion.

Existing feedback mechanisms should be consolidated into these primitives incrementally. Business logic, permissions, and data ownership rules remain unchanged.

## Visual refinement

- Preserve the blue/gray brand palette and both supported color modes.
- Strengthen page hierarchy with consistent titles, section spacing, and action placement.
- Reduce visual competition between primary, secondary, and destructive actions.
- Use semantic colors consistently: blue for active/context, green for success, amber for warning or pending attention, and red for destructive/error states.
- Improve card and table density while retaining sufficient touch targets.
- Apply brief, restrained transitions to state changes; honor `prefers-reduced-motion`.
- Standardize Thai-first status copy and remove unnecessary mixed-language labels from user-facing states.

## Coverage and rollout

The requirement covers all interactive surfaces, delivered in controlled passes:

1. Build the shared feedback, orientation, selection, and visual tokens.
2. Apply them to the highest-frequency flows: navigation, dashboard, project create/edit/delete, project context, and map selection.
3. Apply them to files, schedules, approval/signing, administration, profile, and settings.
4. Run a consistency sweep for remaining controls, empty/loading/error states, responsive layouts, and copy.

This is a system-wide interaction refinement, not a replacement of the information architecture or a change to backend workflows.

## Error and recovery behavior

- User-entered values remain intact after a failed save.
- Failed destructive actions do not dismiss their confirmation surface prematurely.
- Retry is offered only when the action is safe to repeat.
- Permission and validation failures explain the required next step.
- Unexpected errors use a traceable generic message without exposing sensitive details.
- If a background refresh fails, existing usable data remains visible with a stale-state warning.

## Accessibility and responsive behavior

- Use `aria-current`, `aria-selected`, `aria-busy`, live regions, and status/alert roles appropriately.
- Keyboard focus is visible and follows opened dialogs and returned actions predictably.
- State never relies on color alone; it includes text, iconography, shape, or position.
- Touch targets and status labels remain usable on mobile widths.
- Motion is reduced or removed when the operating-system preference requests it.

## Acceptance scenarios

1. Moving between primary sections always exposes the active menu, page title, and breadcrumb without relying on URL inspection.
2. Opening a project keeps its identity visible across the project’s relevant tools and dialogs.
3. Selecting any supported card, row, tab, filter, or map feature produces an unambiguous persistent state that differs from hover.
4. Invoking an asynchronous action produces visible acknowledgement immediately, prevents unsafe duplicate submission, and ends in a clear success or recoverable error state.
5. Initial load, refresh, empty, stale, and error states are distinguishable on every migrated data surface.
6. Destructive actions remain pending until confirmed by the backend and preserve context on failure.
7. The same action and selection semantics work with keyboard navigation and assistive technology.
8. Desktop and mobile layouts preserve current page, project, selection, and action status.
9. Existing permissions and business workflows continue to behave as before.
10. Automated verification and targeted browser QA pass for the migrated critical flows.

## Out of scope

- Changing approval rules, permissions, database schema, or project ownership behavior.
- Replacing the brand identity or performing a complete navigation rearchitecture.
- Adding artificial progress values when the underlying operation cannot report progress.
