import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CreditBalanceContext } from '../../providers/CreditBalanceContext';
import type { CreditBalanceContextValue } from '../../providers/CreditBalanceContext';
import { CreditBalanceIndicator } from './CreditBalanceIndicator';

function renderIndicator(overrides: Partial<CreditBalanceContextValue> = {}) {
  const value: CreditBalanceContextValue = {
    balances: [],
    total: 0,
    isLoading: false,
    refresh: vi.fn(),
    ...overrides,
  };

  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(
        CreditBalanceContext.Provider,
        { value },
        createElement(CreditBalanceIndicator)
      )
    )
  );
}

describe('CreditBalanceIndicator', () => {
  it('renders the summed total as a link to the portal', () => {
    renderIndicator({
      total: 1750.5,
      balances: [
        // shape only matters for `total` here
      ],
    });

    const link = screen.getByRole('link', {
      name: /account credit: ₱1,750\.50/i,
    });
    expect(link).toHaveAttribute('href', '/portal');
    expect(link).toHaveTextContent('₱1,750.50');
  });

  it('renders nothing when the customer has no credit', () => {
    const { container } = renderIndicator({ total: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the balance is still loading', () => {
    const { container } = renderIndicator({ total: 500, isLoading: true });
    expect(container).toBeEmptyDOMElement();
  });
});
