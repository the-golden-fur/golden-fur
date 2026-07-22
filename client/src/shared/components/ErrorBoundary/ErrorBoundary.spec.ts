import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      createElement(
        ErrorBoundary,
        null,
        createElement('p', null, 'all good')
      )
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('renders a fallback with the error code when a child throws', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    render(createElement(ErrorBoundary, null, createElement(Bomb)));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong'
    );
    expect(screen.getByText('Error code: SERVER_ERROR')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });

  it('resets and re-renders children after "Try again" is clicked', async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let shouldThrow = true;

    function MaybeBomb() {
      if (shouldThrow) {
        throw new Error('boom');
      }
      return createElement('p', null, 'recovered');
    }

    render(createElement(ErrorBoundary, null, createElement(MaybeBomb)));

    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
