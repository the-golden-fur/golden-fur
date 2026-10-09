import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StorePoliciesModal } from './StorePoliciesModal';

describe('StorePoliciesModal', () => {
  it('keeps Continue disabled until the agreement is ticked', async () => {
    const onAgree = vi.fn();
    const user = userEvent.setup();
    render(createElement(StorePoliciesModal, { onClose: vi.fn(), onAgree }));

    expect(
      screen.getByRole('dialog', { name: 'Store policies' })
    ).toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();

    await user.click(
      screen.getByLabelText('I have read and agree to the store policies')
    );
    expect(continueButton).toBeEnabled();

    await user.click(continueButton);
    expect(onAgree).toHaveBeenCalledTimes(1);
  });

  it('closes without agreeing', async () => {
    const onClose = vi.fn();
    const onAgree = vi.fn();
    const user = userEvent.setup();
    render(createElement(StorePoliciesModal, { onClose, onAgree }));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAgree).not.toHaveBeenCalled();
  });
});
