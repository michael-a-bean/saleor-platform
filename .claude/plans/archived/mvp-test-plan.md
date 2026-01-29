# MVP Test Plan

**Status: ARCHIVED**
**Archived**: 2026-01-28
**Reason**: Converted to reference document; original scope unrealistic

---

## Archive Summary

### What Shipped
- 1 test file: `saleor-apps/apps/pos/src/modules/register/register-router.test.ts`

### What Remains
- Test specifications preserved in `docs/reference/testing/testing-standards.md`
- Use as reference when writing tests, not as backlog

### Why Archived
The original plan documented 200+ test cases across 1,112 lines of specifications. With only 1 test file written over several weeks, the plan was aspirational rather than actionable.

The test specifications have value as **patterns and examples**, so they've been converted to a reference document rather than discarded.

---

## Lessons Learned

1. **Test plans should match team capacity** - 200 tests requires dedicated sprint(s)
2. **Write tests alongside features** - Not as a separate "testing phase"
3. **Reference docs > checklists** - Patterns are more useful than exhaustive lists
4. **P0 tests first** - Pricing, WAC, and payout are business-critical

---

## Reference

Test patterns and specifications are now in:
`docs/reference/testing/testing-standards.md`
