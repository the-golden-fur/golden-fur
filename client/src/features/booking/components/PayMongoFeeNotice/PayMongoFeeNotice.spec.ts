import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PayMongoFeeNotice } from './PayMongoFeeNotice';

describe('PayMongoFeeNotice', () => {
  it('AC-2: renders for GCash', () => {
    render(createElement(PayMongoFeeNotice, { paymentMethod: 'GCash' }));
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('AC-2: renders for Maya', () => {
    render(createElement(PayMongoFeeNotice, { paymentMethod: 'Maya' }));
    expect(screen.getByRole('note')).toBeInTheDocument();
  });

  it('AC-2: renders nothing for Cash', () => {
    render(createElement(PayMongoFeeNotice, { paymentMethod: 'Cash' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders nothing when no payment method is selected yet', () => {
    render(createElement(PayMongoFeeNotice, { paymentMethod: '' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
