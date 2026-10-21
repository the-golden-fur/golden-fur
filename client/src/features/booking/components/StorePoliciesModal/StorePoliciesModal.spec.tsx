import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  describe('when the policies are longer than the box', () => {
    // jsdom lays nothing out (every height is 0), so give the box a scrollable
    // size: 1000px of text in a 300px window.
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
        1000
      );
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(
        300
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('only unlocks the agreement once scrolled to the end', () => {
      render(
        createElement(StorePoliciesModal, {
          onClose: vi.fn(),
          onAgree: vi.fn(),
        })
      );

      const agreement = screen.getByLabelText(
        'I have read and agree to the store policies'
      );
      expect(agreement).toBeDisabled();
      expect(
        screen.getByText('Scroll to the end of the policies to continue.')
      ).toBeInTheDocument();

      const policyBox = screen.getByLabelText('Store policy text');

      // Halfway down - still locked.
      Object.defineProperty(policyBox, 'scrollTop', {
        value: 350,
        configurable: true,
      });
      fireEvent.scroll(policyBox);
      expect(agreement).toBeDisabled();

      // At the bottom (scrollTop + clientHeight == scrollHeight).
      Object.defineProperty(policyBox, 'scrollTop', {
        value: 700,
        configurable: true,
      });
      fireEvent.scroll(policyBox);
      expect(agreement).toBeEnabled();
      expect(
        screen.queryByText('Scroll to the end of the policies to continue.')
      ).not.toBeInTheDocument();
    });
  });

  it('lists every policy section', () => {
    render(
      createElement(StorePoliciesModal, { onClose: vi.fn(), onAgree: vi.fn() })
    );

    for (const title of [
      'Requirements for Grooming, Daycare, and Pet Hotel',
      'Waiver Form',
      'Veterinary Services',
      'Pet Hotel and Daycare',
      'Cancellations and Refunds',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(
      screen.getByText('Below 4 months: not accepted.')
    ).toBeInTheDocument();
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
