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
    renderIndicator({ total: 1750.5 });

    const link = screen.getByRole('link', {
      name: /account credit: ₱1,750\.50/i,
    });
    expect(link).toHaveAttribute('href', '/portal');
    expect(link).toHaveTextContent('₱1,750.50');
  });

  it('still renders (₱0.00) when the customer has no credit', () => {
    renderIndicator({ total: 0 });

    const link = screen.getByRole('link', {
      name: /account credit: ₱0\.00/i,
    });
    expect(link).toHaveTextContent('₱0.00');
  });

  it('renders ₱0.00 while the balance is still loading', () => {
    renderIndicator({ total: 0, isLoading: true });

    expect(screen.getByRole('link')).toHaveTextContent('₱0.00');
  });
});
