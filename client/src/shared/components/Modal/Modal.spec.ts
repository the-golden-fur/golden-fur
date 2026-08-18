import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      createElement(
        Modal,
        { isOpen: false, title: 'Configure', onClose: vi.fn() },
        'Body content'
      )
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and children when open', () => {
    render(
      createElement(
        Modal,
        { isOpen: true, title: 'Configure', onClose: vi.fn() },
        'Body content'
      )
    );

    expect(
      screen.getByRole('dialog', { name: 'Configure' })
    ).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('closes on backdrop click and on the close button, but not on a click inside the dialog', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(
        Modal,
        { isOpen: true, title: 'Configure', onClose },
        'Body content'
      )
    );

    await user.click(screen.getByText('Body content'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
