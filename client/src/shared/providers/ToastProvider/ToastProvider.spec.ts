import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastProvider';
import { useToast } from './useToast';

function Trigger() {
  const { showToast } = useToast();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      { onClick: () => showToast('Saved successfully', 'success') },
      'Trigger success'
    ),
    createElement(
      'button',
      { onClick: () => showToast('Something failed', 'error') },
      'Trigger error'
    )
  );
}

function renderWithProvider() {
  return render(createElement(ToastProvider, null, createElement(Trigger)));
}

describe('ToastProvider', () => {
  it('throws when useToast is called outside a provider', () => {
    // Suppress the expected React "error boundary" console.error noise -
    // this test intentionally throws during render.
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => render(createElement(Trigger))).toThrow(
      'useToast must be used within a ToastProvider'
    );

    consoleError.mockRestore();
  });

  it('shows a success toast and lets it be dismissed', async () => {
    renderWithProvider();

    await userEvent.click(
      screen.getByRole('button', { name: 'Trigger success' })
    );

    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument()
    );
  });

  it('shows an error toast distinctly from a success one', async () => {
    renderWithProvider();

    await userEvent.click(
      screen.getByRole('button', { name: 'Trigger error' })
    );

    expect(await screen.findByText('Something failed')).toBeInTheDocument();
  });

  it('supports multiple toasts at once', async () => {
    renderWithProvider();

    await userEvent.click(
      screen.getByRole('button', { name: 'Trigger success' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Trigger error' })
    );

    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });
});
