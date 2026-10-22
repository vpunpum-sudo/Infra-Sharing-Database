# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue — resolved statuses always carry their resolution date

---

## 2026-10-20

### Observation 1: Serialize writes to the same work-state list

**Status:** OPEN
**Date:** 2026-10-20
**Session context:** Closing a multi-step development workflow and marking two canonical work-state tasks complete.
**Skill:** task-observer
**Type:** open-source
**Phase/Area:** Work-state integration and task completion

**Issue:** Two concurrent writes to the same work-state list raced. The second write was based on stale list state and restored a task that the first write had just marked done, so the completion state had to be written again sequentially.

**Suggested improvement:** Add an explicit rule that writes targeting the same work-state list must be awaited serially. Parallel reads are safe, but parallel mutations to one canonical list are not.

**Principle:** Mutations to shared canonical state need serialization or atomic merge semantics; parallelizing them can silently lose a successful update.

## 2026-10-22

### Observation 2: Preserve review gates when publishing a draft PR

**Status:** OPEN
**Date:** 2026-10-22
**Session context:** A high-risk implementation passed automated verification and self-review, but its independent reviewer was quota-limited; the user then requested a commit and pull request.
**Skill:** New skill candidate: gated draft PR handoff
**Type:** open-source
**Phase/Area:** Integration after an incomplete review gate

**Issue:** Branch-finishing guidance assumes implementation is ready to integrate, while staged review workflows can legitimately need a remote PR for collaboration before every release gate has passed. Treating that PR as ordinary or merge-ready would erase the distinction between a recoverable checkpoint and release approval.

**Suggested improvement:** Define a reusable handoff path that permits a commit and Draft PR after fresh verification, while prominently recording the missing independent review and manual QA, keeping the review task open, and forbidding merge or deployment claims.

**Principle:** Publishing work for collaboration must preserve unresolved assurance gates; a Draft PR can be a checkpoint without becoming evidence that the change is ready to merge or release.
