# Testing Guide

Comprehensive testing documentation for the Haven application.

## Test Suite Overview

Haven includes a complete test suite covering:

1. **Unit Tests** - Component and utility function testing
2. **Integration Tests** - API and service integration testing
3. **E2E Tests** - End-to-end user flow testing with Playwright
4. **Accessibility Tests** - WCAG 2.0/2.1 AA compliance testing
5. **Load Tests** - Performance and scalability testing
6. **Stress Tests** - System limits and breaking point testing

## Quick Start

```bash
# Install dependencies
npm install

# Run all unit and integration tests
npm test

# Run E2E tests
npm run test:e2e

# Run specific test file
npm test -- auth.test.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

## Unit and Integration Tests

### Technology Stack
- **Vitest** - Fast unit test runner
- **React Testing Library** - Component testing
- **@testing-library/user-event** - User interaction simulation
- **MSW** (Mock Service Worker) - API mocking

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/components/Button.test.tsx

# Run tests matching pattern
npm test -- --grep "Button component"

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

### Test Structure

```typescript
// Component test example
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('should render with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    await userEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

### Test Files Location
- `tests/unit/` - Unit tests
- `tests/integration/` - Integration tests
- `tests/components/` - Component tests
- `tests/mocks/` - Mock data and handlers

## End-to-End (E2E) Tests

### Technology Stack
- **Playwright** - Cross-browser E2E testing
- **@axe-core/playwright** - Accessibility testing

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e -- --headed

# Run specific test file
npm run test:e2e -- auth.spec.ts

# Run on specific browser
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox
npm run test:e2e -- --project=webkit

# Debug mode
npm run test:e2e -- --debug

# Generate HTML report
npx playwright show-report
```

### E2E Test Files

Located in `e2e/`:

- **auth.spec.ts** - Authentication flows (login, signup, validation)
- **listings.spec.ts** - Listing creation and browsing
- **matching.spec.ts** - Matching algorithm and swipe interface
- **onboarding.spec.ts** - User onboarding flow
- **responsive.spec.ts** - Responsive design across devices
- **accessibility.spec.ts** - Comprehensive accessibility testing

### Configuration

See `playwright.config.ts` for:
- Multi-browser support (Chromium, Firefox, WebKit)
- Mobile device emulation (iPhone, Android)
- Screenshot and video capture on failure
- Parallel test execution

## Accessibility Testing

### WCAG Compliance

All pages are tested for WCAG 2.0/2.1 Level A and AA compliance using @axe-core/playwright.

### Running Accessibility Tests

```bash
# Run all accessibility tests
npm run test:e2e -- accessibility.spec.ts

# Run accessibility checks in specific E2E tests
npm run test:e2e -- auth.spec.ts --grep "accessible"
```

### Accessibility Test Coverage

- ✅ Color contrast compliance
- ✅ Keyboard navigation
- ✅ Screen reader compatibility
- ✅ Proper heading hierarchy
- ✅ Form labels and ARIA attributes
- ✅ Image alt text
- ✅ Focus management

### Example Accessibility Test

```typescript
import AxeBuilder from '@axe-core/playwright';

test('page should be accessible', async ({ page }) => {
  await page.goto('/dashboard');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## Load and Stress Testing

See `load-tests/README.md` for comprehensive load testing documentation.

### Quick Load Testing

```bash
# k6 load test
k6 run load-tests/k6/listings-load.js

# Artillery load test
BASE_URL=http://localhost:3000 artillery run load-tests/artillery/config.yml

# Stress test
k6 run load-tests/k6/stress-test.js

# Spike test
k6 run load-tests/k6/spike-test.js
```

## Test Coverage

### Current Coverage Goals

- Unit tests: > 80%
- Integration tests: > 70%
- E2E critical paths: 100%
- Accessibility: WCAG AA compliance

### Viewing Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View HTML coverage report
open coverage/index.html
```

### Coverage Reports Include

- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Continuous Integration

### GitHub Actions

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Nightly builds

### CI Test Commands

```yaml
# Unit and integration tests
- run: npm test -- --run

# E2E tests
- run: npm run test:e2e

# Accessibility tests
- run: npm run test:e2e -- accessibility.spec.ts
```

## Writing Tests

### Best Practices

1. **Test Behavior, Not Implementation**
   - Focus on user-facing behavior
   - Avoid testing internal implementation details

2. **Use Descriptive Test Names**
   ```typescript
   // Good
   test('should display error message when email is invalid')

   // Bad
   test('test 1')
   ```

3. **Follow AAA Pattern**
   - Arrange: Set up test data
   - Act: Perform action
   - Assert: Verify result

4. **Keep Tests Independent**
   - Each test should run in isolation
   - No shared state between tests

5. **Use Testing Library Queries**
   ```typescript
   // Preferred (accessibility-friendly)
   screen.getByRole('button', { name: /submit/i })
   screen.getByLabelText('Email')

   // Avoid
   document.querySelector('.submit-button')
   ```

### Unit Test Example

```typescript
import { calculateMatchScore } from './matching';

describe('calculateMatchScore', () => {
  it('should return 100 for perfect match', () => {
    const seeker = { budget: 2000, bedrooms: 2, location: 'Houston' };
    const listing = { price: 2000, bedrooms: 2, city: 'Houston' };

    const score = calculateMatchScore(seeker, listing);

    expect(score).toBe(100);
  });

  it('should return lower score for partial match', () => {
    const seeker = { budget: 2000, bedrooms: 2, location: 'Houston' };
    const listing = { price: 2500, bedrooms: 2, city: 'Houston' };

    const score = calculateMatchScore(seeker, listing);

    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
  });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Login', () => {
  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'user@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });
});
```

## Debugging Tests

### Unit Tests

```bash
# Run specific test in watch mode
npm test -- --watch matching.test.ts

# Debug with Node inspector
node --inspect-brk node_modules/.bin/vitest run
```

### E2E Tests

```bash
# Debug mode (step through tests)
npm run test:e2e -- --debug

# Headed mode (see browser)
npm run test:e2e -- --headed

# Screenshot on failure (automatic)
# Videos saved in test-results/

# Playwright Inspector
PWDEBUG=1 npm run test:e2e
```

## Troubleshooting

### Common Issues

**Tests timeout**
- Increase timeout in test configuration
- Check for network issues or slow operations

**Flaky E2E tests**
- Add explicit waits for elements
- Use `waitFor` instead of fixed delays
- Check for race conditions

**Coverage not updating**
- Clear coverage cache: `rm -rf coverage`
- Ensure all test files are running

**E2E tests fail in CI but pass locally**
- Check viewport size differences
- Verify environment variables
- Review CI-specific timeouts

## Performance Testing Results

### Expected Performance Metrics

- Unit tests: < 10 seconds total
- E2E tests: < 5 minutes total
- Load test baseline: 200 concurrent users
- Response time p95: < 500ms

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [Axe Accessibility](https://www.deque.com/axe/)
- [k6 Documentation](https://k6.io/docs/)
- [Artillery Documentation](https://www.artillery.io/docs)
