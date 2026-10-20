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
