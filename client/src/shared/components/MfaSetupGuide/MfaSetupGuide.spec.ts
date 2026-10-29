import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MfaSetupGuide } from './MfaSetupGuide';

function mockPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: coarse } as MediaQueryList)
  );
}

describe('MfaSetupGuide', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts collapsed and expands from its summary', async () => {
    mockPointer(false);
    const { container } = render(createElement(MfaSetupGuide));

    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');

    await userEvent.click(screen.getByText(/step-by-step setup guide/i));
    expect(details).toHaveAttribute('open');
  });

  it('defaults to the QR scan steps on a computer', () => {
    mockPointer(false);
    render(createElement(MfaSetupGuide));

    expect(screen.getByRole('tab', { name: /on a computer/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Scan the QR code')).toBeInTheDocument();
    expect(screen.queryByText('Type in the setup key')).not.toBeInTheDocument();
  });

  it('defaults to the setup key steps on a touch device', () => {
    mockPointer(true);
    render(createElement(MfaSetupGuide));

    expect(screen.getByRole('tab', { name: /on this phone/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Type in the setup key')).toBeInTheDocument();
  });

  it('switches between the computer and phone steps', async () => {
    mockPointer(false);
    render(createElement(MfaSetupGuide));

    await userEvent.click(screen.getByRole('tab', { name: /on this phone/i }));
    expect(screen.getByText('Type in the setup key')).toBeInTheDocument();
    expect(screen.queryByText('Scan the QR code')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /on a computer/i }));
    expect(screen.getByText('Scan the QR code')).toBeInTheDocument();
  });

  it('offers the setup key path from the troubleshooting tips', async () => {
    mockPointer(false);
    render(createElement(MfaSetupGuide));

    await userEvent.click(
      screen.getByRole('button', { name: /type in the setup key instead/i })
    );
    expect(screen.getByText('Type in the setup key')).toBeInTheDocument();
  });

  it('links to both app stores in a new tab', () => {
    mockPointer(false);
    render(createElement(MfaSetupGuide));

    for (const name of [/app store \(iphone\)/i, /google play \(android\)/i]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('falls back to the computer steps when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    render(createElement(MfaSetupGuide));

    expect(screen.getByText('Scan the QR code')).toBeInTheDocument();
  });
});
