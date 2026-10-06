import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../providers/ToastProvider/ToastProvider';
import { MfaMethodEnrollFlow } from './MfaMethodEnrollFlow';

vi.mock('../TotpEnrollPanel/TotpEnrollPanel', () => ({
  TotpEnrollPanel: ({
    onEnrolled,
    onError,
  }: {
    onEnrolled: () => void;
    onError?: (message: string) => void;
  }) =>
    createElement(
      'div',
      null,
      createElement('p', null, 'Authenticator panel'),
      createElement('button', { onClick: onEnrolled }, 'Finish authenticator'),
      createElement(
        'button',
        { onClick: () => onError?.('authenticator failed') },
        'Fail authenticator'
      )
    ),
}));

vi.mock('../EmailMfaEnrollPanel/EmailMfaEnrollPanel', () => ({
  EmailMfaEnrollPanel: ({
    onEnrolled,
    onError,
  }: {
    onEnrolled: () => void;
    onError?: (message: string) => void;
  }) =>
    createElement(
      'div',
      null,
      createElement('p', null, 'Email panel'),
      createElement('button', { onClick: onEnrolled }, 'Finish email'),
      createElement(
        'button',
        { onClick: () => onError?.('email failed') },
        'Fail email'
      )
    ),
}));

function renderFlow(
  props: Partial<Parameters<typeof MfaMethodEnrollFlow>[0]> = {}
) {
  const onEnrolled = vi.fn();
  render(
    createElement(
      ToastProvider,
      null,
      createElement(MfaMethodEnrollFlow, {
        role: 'staff',
        accessToken: 'token',
        onEnrolled,
        ...props,
      })
    )
  );
  return { onEnrolled };
}

describe('MfaMethodEnrollFlow', () => {
  it('shows a method choice when no initialMethod is given', () => {
    renderFlow();

    expect(
      screen.getByRole('button', { name: 'Authenticator app' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.queryByText('Authenticator panel')).not.toBeInTheDocument();
  });

  it('renders the authenticator panel after choosing it', async () => {
    renderFlow();

    await userEvent.click(
      screen.getByRole('button', { name: 'Authenticator app' })
    );

    expect(screen.getByText('Authenticator panel')).toBeInTheDocument();
  });

  it('renders the email panel after choosing it', async () => {
    renderFlow();

    await userEvent.click(screen.getByRole('button', { name: 'Email' }));

    expect(screen.getByText('Email panel')).toBeInTheDocument();
  });

  it('skips the choice step when initialMethod is given', () => {
    renderFlow({ initialMethod: 'email' });

    expect(screen.getByText('Email panel')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Authenticator app' })
    ).not.toBeInTheDocument();
  });

  it('fires a success toast and the onEnrolled callback together', async () => {
    const { onEnrolled } = renderFlow({ initialMethod: 'authenticator' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Finish authenticator' })
    );

    expect(onEnrolled).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Multi-factor authentication is now set up.')
    ).toBeInTheDocument();
  });

  it('fires an error toast when the underlying panel reports one', async () => {
    renderFlow({ initialMethod: 'email' });

    await userEvent.click(screen.getByRole('button', { name: 'Fail email' }));

    expect(await screen.findByText('email failed')).toBeInTheDocument();
  });
});
