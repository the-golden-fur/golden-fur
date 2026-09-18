import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(
  overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}
) {
  return render(
    createElement(ConfirmDialog, {
      isOpen: true,
      title: 'Are you sure?',
      body: 'This cannot be undone.',
      confirmLabel: 'Confirm',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    })
  );
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enables the confirm button by default', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('disables only the confirm button when confirmDisabled is true, not cancel', () => {
    renderDialog({ confirmDisabled: true });

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('disables both buttons while isConfirming, regardless of confirmDisabled', () => {
    renderDialog({ isConfirming: true, confirmDisabled: false });

    expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
