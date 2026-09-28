import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RenameModal } from './RenameModal';

function renderModal(
  overrides: Partial<Parameters<typeof RenameModal>[0]> = {}
) {
  const props = {
    isOpen: true,
    entityLabel: 'cage',
    currentName: 'Cage A',
    onSubmit: vi.fn().mockResolvedValue(null),
    onClose: vi.fn(),
    ...overrides,
  };

  render(createElement(RenameModal, props));

  return props;
}

describe('RenameModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prefills the current name and disables Save until it changes', async () => {
    renderModal();

    const input = screen.getByRole('textbox', { name: /new cage name/i });
    expect(input).toHaveValue('Cage A');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'Cage B');

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('submits the trimmed name and closes on success', async () => {
    const props = renderModal();

    const input = screen.getByRole('textbox', { name: /new cage name/i });
    await userEvent.clear(input);
    await userEvent.type(input, '  Cage B  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith('Cage B'));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
  });

  it('shows the error inline and stays open when the submit fails', async () => {
    const props = renderModal({
      onSubmit: vi.fn().mockResolvedValue('That name is taken.'),
    });

    const input = screen.getByRole('textbox', { name: /new cage name/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Cage B');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That name is taken.'
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('rejects an empty name without calling onSubmit', async () => {
    const props = renderModal();

    const input = screen.getByRole('textbox', { name: /new cage name/i });
    await userEvent.clear(input);
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Name is required.'
    );
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('closes via Cancel without submitting', async () => {
    const props = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
