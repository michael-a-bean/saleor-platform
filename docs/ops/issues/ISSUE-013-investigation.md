# ISSUE-013 Investigation: React Compiler Disabled

**Investigation Date:** 2026-01-23
**Total Effort Estimate:** 46-66 hours
**Root Blocker:** Formik library incompatibility

## Current Config

**File:** `storefront/eslint.config.mjs`

React Compiler is completely disabled through aggressive filtering:
- Filter out configs that define react-compiler plugin
- Remove react-compiler plugin from multi-plugin configs
- Disable all react-compiler/* rules

## Incompatible Patterns Found

### Pattern A: Exhaustive-Deps Violations (9.5 hours)

| File | Line | Issue | Hours |
|------|------|-------|-------|
| `useFetch.ts` | 43 | Dynamic spread in deps | 2 |
| `useDebouncedSubmit.ts` | 18 | Empty deps array | 2.5 |
| `useAddressListForm.ts` | 114 | Ref mutation + selective deps | 3 |
| `useCheckoutCompleteRedirect.ts` | 131 | Ref mutation in effect | 2 |

### Pattern B: Formik Incompatibility (CRITICAL)

- `useForm.ts` wraps Formik which has mutable internal state
- Formik is NOT React Compiler compatible
- 37 hook files affected, 60% of codebase

### Pattern C: Dynamic Object Construction (4 hours)

- `Object.values(args)` creates new arrays
- `Object.keys().reduce()` with spread syntax
- Found in: useFetch, useErrorMessages, useSetCheckoutFormValidationState

### Pattern D: Lodash Utilities (1.5 hours)

- `pick()` in useAutoSaveAddressForm
- Runtime operation breaks compile-time analysis

## Effort Summary

| Pattern | Hours | Priority |
|---------|-------|----------|
| Exhaustive-deps fixes | 9.5 | HIGH |
| Dynamic object deps | 4 | MEDIUM |
| Lodash utilities | 1.5 | MEDIUM |
| Debounce redesign | 2 | MEDIUM |
| Ref elimination | 2 | MEDIUM |
| **Formik migration** | **20-40** | **CRITICAL** |
| Testing & validation | 8 | HIGH |
| **TOTAL** | **46-66** | - |

## Migration Path

**Formik is the root blocker.** Options:

1. **Option A:** Upgrade Formik (if RC-compatible version exists)
2. **Option B:** Migrate to React Hook Form (RECOMMENDED)
3. **Option C:** Build minimal form wrapper on React hooks

## Recommended Approach

1. **Phase 1:** Fix quick wins (exhaustive-deps, lodash) - 15 hours
2. **Phase 2:** Implement React Hook Form integration layer - 20 hours
3. **Phase 3:** Gradually migrate forms - 20+ hours
4. **Phase 4:** Re-enable React Compiler rules incrementally

## Strategic Decision Required

Enabling React Compiler requires **significant investment** (~50-70 hours) primarily due to Formik dependency. Options:

- **Invest in migration** to unlock React 19 optimizations
- **Maintain current config** and accept performance trade-off
