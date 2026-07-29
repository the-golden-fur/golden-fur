import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthCard } from './AuthCard';

describe('AuthCard', () => {
  it('renders the title, subtitle, and children inside a labeled section', () => {
    render(
      createElement(
        AuthCard,
        {
          titleId: 'test-title',
          title: 'Verify MFA',
          subtitle: 'Enter your code.',
        },
        createElement('button', null, 'Verify code')
      )
    );

    const section = screen.getByRole('region', { name: 'Verify MFA' });
    expect(section).toBeInTheDocument();
    expect(screen.getByText('Enter your code.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Verify code' })
    ).toBeInTheDocument();
  });

  it('omits the subtitle when none is given', () => {
    render(
      createElement(
        AuthCard,
        { titleId: 'test-title-2', title: 'Reset your password' },
        createElement('div', null, 'form here')
      )
    );

    expect(
      screen.getByRole('heading', { name: 'Reset your password' })
    ).toBeInTheDocument();
  });
});
