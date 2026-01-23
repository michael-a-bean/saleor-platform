# ISSUE-015 Investigation: TypeScript @ts-ignore Directives

**Investigation Date:** 2026-01-23
**Total Directives Found:** 3
**Total Effort Estimate:** 5-8 hours

## Summary

| File | Line | Type | Effort |
|------|------|------|--------|
| FormProvider.tsx | 19 | Library type incompatibility | 2-3 hrs |
| useForm.ts | 17 | Library type incompatibility | 2-3 hrs |
| useSubmit.ts | 72 | Hook overload mismatch | 1-2 hrs |

## Issue 1: FormProvider.tsx (Line 19)

**Directive:** `@ts-expect-error - UseFormReturn extends FormikContextType with stricter types`

**Root Cause:**
- `UseFormReturn<TData>` narrows type signatures for better type safety
- `setFieldValue`, `validateForm`, `setValues` have stricter signatures
- `FormikProvider` expects the broader `FormikContextType`

**Proposed Fix:** Type assertion on form value:
```typescript
const typedForm = form as FormikContextType<any>;
<FormikProvider value={typedForm}>
```

**Effort:** 2-3 hours

## Issue 2: useForm.ts (Line 17)

**Directive:** `@ts-expect-error - FormProps has stricter types than FormikConfig`

**Root Cause:**
- `FormProps<TData>` replaces `onSubmit` and `validationSchema`
- `validationSchema` typed as `any` due to Yup schema typing issues
- `useFormik` expects original `FormikConfig<TData>`

**Proposed Fix:**
- **Quick:** Type assertion (2-3 hrs)
- **Better:** Resolve Yup schema typing (4-6 hrs)

**Effort:** 2-6 hours depending on approach

## Issue 3: useSubmit.ts (Line 72)

**Directive:** `@ts-expect-error - scope can be undefined, hook handles this gracefully`

**Root Cause:**
- `scope` is optional in `UseSubmitProps`
- `useCheckoutUpdateStateChange` has overloads for defined/undefined
- No overload for the union type `CheckoutUpdateStateScope | undefined`

**Proposed Fix:** Add overload signature:
```typescript
export function useCheckoutUpdateStateChange(
  scope: CheckoutUpdateStateScope | undefined
): { setCheckoutUpdateState: (status?: CheckoutUpdateStateStatus) => void };
```

**Effort:** 1-2 hours (Quick win!)

## Recommended Fix Order

### Phase 1: Quick Win
1. **Issue 3** (useSubmit.ts) - 1-2 hours
   - Simplest fix, minimal risk
   - Just add missing overload

### Phase 2: Core Fixes
2. **Issue 1** (FormProvider.tsx) - 2-3 hours
3. **Issue 2** (useForm.ts) - 2-3 hours (Option A)

## Key Finding

All three directives address **intentional type design decisions**, not bugs. Each can be resolved with targeted type refinements without changing runtime behavior.

## Dependencies

```
Issue 2 (useForm.ts)
  └─ Depends on: Yup schema type resolution

Issue 1 (FormProvider.tsx)
  └─ Can fix independently

Issue 3 (useSubmit.ts)
  └─ Independent - no dependencies (START HERE)
```
