import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaymentStep } from './PaymentStep';
import type { PaymentFields } from '../../billing.types';

function setup(payment: PaymentFields) {
  const onPaymentChange = vi.fn();
  const onCreditChange = vi.fn();
  render(
    <PaymentStep
      payment={payment}
      onPaymentChange={onPaymentChange}
      creditToApply={50}
      onCreditChange={onCreditChange}
      amountDue={500}
      availableCredit={200}
      creditError={null}
      creditTotal={500}
    />
  );
  return { onPaymentChange, onCreditChange };
}

describe('PaymentStep', () => {
  it('hides the Customer credit panel when Cash is selected', () => {
    setup({ payment_method: 'Cash' });
    expect(screen.queryByText('Customer credit')).toBeNull();
  });

  it('still shows the Customer credit panel for other methods', () => {
    setup({ payment_method: 'GCash' });
    expect(screen.getByText('Customer credit')).toBeInTheDocument();
  });

  it('drops any partial credit top-up when switching to Cash', async () => {
    const { onCreditChange } = setup({ payment_method: 'GCash' });
    await userEvent.selectOptions(screen.getByLabelText('Method'), 'Cash');
    expect(onCreditChange).toHaveBeenCalledWith(0);
  });
});
