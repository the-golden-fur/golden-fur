import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaymentMethodForm } from './PaymentMethodForm';
import { PAYMENT_METHODS, type PaymentFields } from '../../billing.types';

function setup(
  value: Partial<PaymentFields> = {},
  methods?: readonly string[]
) {
  const onChange = vi.fn();
  render(
    <PaymentMethodForm
      value={{ payment_method: 'Cash', ...value }}
      onChange={onChange}
      amountDue={693}
      methods={methods}
    />
  );
  return { onChange };
}

describe('PaymentMethodForm', () => {
  it('defaults its method options to PAYMENT_METHODS and can be given extras', () => {
    const { unmount } = render(
      <PaymentMethodForm
        value={{ payment_method: 'Cash' }}
        onChange={vi.fn()}
        amountDue={100}
      />
    );
    expect(screen.queryByRole('option', { name: 'Credit' })).toBeNull();
    unmount();

    setup({}, [...PAYMENT_METHODS, 'Credit']);
    expect(screen.getByRole('option', { name: 'Credit' })).toBeInTheDocument();
  });

  it('shows a placeholder of the amount due on the cash field', () => {
    setup({ payment_method: 'Cash' });
    expect(screen.getByLabelText(/cash tendered/i)).toHaveAttribute(
      'placeholder',
      '693.00'
    );
  });

  it('renders no bank / reference / cash fields for Credit', () => {
    setup({ payment_method: 'Credit' }, [...PAYMENT_METHODS, 'Credit']);
    expect(screen.queryByLabelText(/cash tendered/i)).toBeNull();
    expect(screen.queryByLabelText(/reference number/i)).toBeNull();
    expect(screen.queryByLabelText(/^bank$/i)).toBeNull();
    expect(screen.getByText(/account credit/i)).toBeInTheDocument();
  });

  it('still shows a reference field for Card', async () => {
    setup({ payment_method: 'Card' });
    expect(screen.getByLabelText(/reference number/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/reference number/i), 'ref-1');
  });

  it('shows a plain Amount field alongside the reference field for Card/GCash', () => {
    setup({ payment_method: 'Card' });
    expect(screen.getByLabelText('Amount (PHP)')).toHaveAttribute(
      'placeholder',
      '693.00'
    );
    expect(screen.getByLabelText(/reference number/i)).toBeInTheDocument();
  });

  it('hideCashTendered drops the amount field (Cash tendered or Amount), the change line and any reference field for Cash', () => {
    render(
      <PaymentMethodForm
        value={{ payment_method: 'Cash', cash_tendered: 800 }}
        onChange={vi.fn()}
        amountDue={693}
        hideCashTendered
      />
    );
    expect(screen.queryByLabelText(/cash tendered/i)).toBeNull();
    expect(screen.queryByText(/^Change:/i)).toBeNull();
    expect(screen.queryByLabelText(/reference number/i)).toBeNull();
  });

  it('hideCashTendered also drops the Amount field for a non-cash method, keeping only the reference field', () => {
    render(
      <PaymentMethodForm
        value={{ payment_method: 'GCash' }}
        onChange={vi.fn()}
        amountDue={693}
        hideCashTendered
      />
    );
    expect(screen.queryByLabelText('Amount (PHP)')).toBeNull();
    expect(screen.getByLabelText(/reference number/i)).toBeInTheDocument();
  });

  it('hideLegend drops the "Payment method" heading and renders bare fields with the given classes', () => {
    const { container } = render(
      <PaymentMethodForm
        value={{ payment_method: 'Cash' }}
        onChange={vi.fn()}
        amountDue={693}
        hideLegend
        fieldClassName="custom-field"
        inputClassName="custom-input"
      />
    );
    expect(screen.queryByText('Payment method')).toBeNull();
    expect(container.querySelector('fieldset')).toBeNull();
    expect(screen.getByLabelText('Method').closest('label')).toHaveClass(
      'custom-field'
    );
    expect(screen.getByLabelText('Method')).toHaveClass('custom-input');
  });
});
