import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServerErrorPage } from './ServerErrorPage';

describe('ServerErrorPage', () => {
  it('shows the 500 code, error code, and a link back home', () => {
    render(createElement(MemoryRouter, null, createElement(ServerErrorPage)));

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /something went wrong/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('SERVER_ERROR');
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute(
      'href',
      '/'
    );
  });
});
