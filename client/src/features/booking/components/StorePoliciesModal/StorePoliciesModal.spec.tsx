import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorePoliciesModal } from './StorePoliciesModal';
import {
  STORE_POLICIES_VERSION,
  isStorePoliciesAgreementCurrent,
} from './storePoliciesAgreement';

describe('isStorePoliciesAgreementCurrent', () => {
  const NOW = new Date('2026-11-08T12:00:00.000Z');
  const daysAgo = (days: number) =>
    new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it('is current for the current version agreed under 30 days ago', () => {
    expect(
      isStorePoliciesAgreementCurrent(STORE_POLICIES_VERSION, daysAgo(29), NOW)
    ).toBe(true);
  });

  it('expires at 30 days', () => {
    expect(
      isStorePoliciesAgreementCurrent(STORE_POLICIES_VERSION, daysAgo(30), NOW)
    ).toBe(false);
  });

  it('is not current for an older version, or with no agreement saved', () => {
    expect(
      isStorePoliciesAgreementCurrent(
        STORE_POLICIES_VERSION - 1,
        daysAgo(1),
        NOW
      )
    ).toBe(false);
    expect(isStorePoliciesAgreementCurrent(null, null, NOW)).toBe(false);
    expect(
      isStorePoliciesAgreementCurrent(STORE_POLICIES_VERSION, null, NOW)
    ).toBe(false);
  });
});

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
    expect(onAgree).toHaveBeenCalledWith(false);
  });

  it('"Remember policies" unlocks only after agreeing, and is passed to onAgree', async () => {
    const onAgree = vi.fn();
    const user = userEvent.setup();
    render(createElement(StorePoliciesModal, { onClose: vi.fn(), onAgree }));

    const agree = screen.getByLabelText(
      'I have read and agree to the store policies'
    );
    const remember = screen.getByLabelText(/Remember policies/);
    expect(remember).toBeDisabled();

    await user.click(agree);
    expect(remember).toBeEnabled();
    await user.click(remember);

    // Un-ticking the agreement clears and re-locks Remember.
    await user.click(agree);
    expect(remember).not.toBeChecked();
    expect(remember).toBeDisabled();

    await user.click(agree);
    await user.click(remember);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onAgree).toHaveBeenCalledWith(true);
  });

  it('view mode shows the policies read-only with just a Close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(createElement(StorePoliciesModal, { onClose, mode: 'view' }));

    expect(
      screen.getByRole('dialog', { name: 'Store policies' })
    ).toBeInTheDocument();
    expect(screen.getByText('Waiver Form')).toBeInTheDocument();
    expect(
      screen.queryByLabelText('I have read and agree to the store policies')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue' })
    ).not.toBeInTheDocument();

    // The Modal's own header close button is also named "Close"; the
    // footer one is the last.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
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
