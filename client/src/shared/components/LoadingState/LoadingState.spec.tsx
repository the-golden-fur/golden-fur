import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadingState } from './LoadingState';

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

describe('LoadingState', () => {
  it('announces its label as a status and shows it as text', () => {
    render(<LoadingState label="Loading bookings..." />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading bookings...');
  });

  it('defaults the label to "Loading..."', () => {
    render(<LoadingState />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading...');
  });

  it('shows the loader GIF, hidden from screen readers', () => {
    stubReducedMotion(false);
    render(<LoadingState />);

    const icon = screen.getByTestId('loading-icon');
    expect(icon).toHaveAttribute('src', '/loading/loader.gif');
    expect(icon).toHaveAttribute('alt', '');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the label visually while the loader GIF is showing', () => {
    stubReducedMotion(false);
    render(<LoadingState label="Loading pets..." />);

    expect(screen.getByText('Loading pets...').className).toContain(
      'srOnlyLabel'
    );
  });

  it('shows the label as text when the GIF fails to load', () => {
    stubReducedMotion(false);
    render(<LoadingState label="Loading pets..." />);

    fireEvent.error(screen.getByTestId('loading-icon'));

    expect(screen.getByText('Loading pets...').className).not.toContain(
      'srOnlyLabel'
    );
  });

  it('leaves out the animated icon when reduced motion is requested', () => {
    stubReducedMotion(true);
    render(<LoadingState label="Loading pets..." />);

    expect(screen.queryByTestId('loading-icon')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading pets...');
  });

  it('drops the icon (keeping the label) when the GIF fails to load', () => {
    render(<LoadingState label="Loading pets..." />);

    fireEvent.error(screen.getByTestId('loading-icon'));

    expect(screen.queryByTestId('loading-icon')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading pets...');
  });
});
