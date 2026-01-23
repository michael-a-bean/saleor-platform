# ISSUE-008: Storefront Test Coverage 1.9%

**Priority:** P1 - High
**Category:** Code Quality
**Status:** Open
**Created:** 2026-01-23
**Source:** Repository Health Audit

---

## Problem

Storefront has critically low test coverage: only 7 test files for 363 TypeScript files (1.9%).

**Location:** `storefront/`

## Current State

**Existing Tests (7 files):**
```
src/checkout/components/AddressForm/utils.test.ts
src/checkout/sections/Summary/utils.test.ts
src/checkout/sections/PaymentSection/utils.test.ts
src/checkout/lib/utils/money.test.ts
src/checkout/lib/utils/common.test.ts
src/lib/meilisearch.test.ts
src/lib/filters/urlFilters.test.ts
```

**Missing Coverage:**
- Zero component tests
- Zero page tests
- Zero checkout flow tests (most critical user journey)
- Zero integration tests
- Zero hook tests

## Impact

- No regression protection for checkout (revenue-critical)
- Refactoring is risky without test safety net
- Bugs discovered in production instead of CI
- React Compiler migration blocked (needs test verification)

## Target

**6-month goal:** 60% coverage
**Immediate goal:** Cover checkout flow

## Remediation Steps

### Phase 1: Setup Test Infrastructure (Day 1)

```bash
cd storefront

# Install testing dependencies
pnpm add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event

# Create test utilities directory
mkdir -p src/__tests__/utils
mkdir -p src/__tests__/mocks
mkdir -p src/__tests__/fixtures
```

Create `src/__tests__/utils/render.tsx`:
```typescript
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

// Add providers here (e.g., IntlProvider, ApolloProvider)
function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const customRender = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  render(ui, { wrapper: AllProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
```

### Phase 2: Checkout Component Tests (Week 1)

Priority components to test:
1. `src/checkout/components/AddressForm/AddressForm.tsx`
2. `src/checkout/sections/PaymentSection/PaymentSection.tsx`
3. `src/checkout/sections/Summary/Summary.tsx`
4. `src/checkout/components/CheckoutForm/CheckoutForm.tsx`

Example test for AddressForm:
```typescript
// src/checkout/components/AddressForm/AddressForm.test.tsx
import { render, screen, fireEvent } from '@/__tests__/utils/render';
import { AddressForm } from './AddressForm';

describe('AddressForm', () => {
  it('renders all required fields', () => {
    render(<AddressForm onSubmit={jest.fn()} />);

    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
  });

  it('validates required fields on submit', async () => {
    const onSubmit = jest.fn();
    render(<AddressForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

### Phase 3: Integration Tests (Week 2-3)

Test complete user flows:
1. Add to cart → Checkout → Payment
2. Guest checkout flow
3. Registered user checkout

### Phase 4: CI Integration

Add coverage threshold to `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    coverage: {
      reporter: ['text', 'json', 'html'],
      statements: 60,
      branches: 60,
      functions: 60,
      lines: 60,
    },
  },
});
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test file
pnpm test src/checkout/components/AddressForm/AddressForm.test.tsx

# Watch mode
pnpm test --watch
```

## Verification

```bash
# After adding tests, verify coverage increased:
pnpm test --coverage

# Coverage report shows:
# - Statements: X% (target: 60%)
# - Branches: X%
# - Functions: X%
# - Lines: X%
```

## Definition of Done

### Immediate (Week 1)
- [ ] Test infrastructure set up
- [ ] At least 5 component tests for checkout
- [ ] CI runs tests on PR

### 6-Month Target
- [ ] 60% statement coverage
- [ ] All critical paths tested
- [ ] Integration tests for checkout flow
- [ ] Coverage thresholds enforced in CI
