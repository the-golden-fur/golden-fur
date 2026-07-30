import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';

describe('AboutPage', () => {
  it('renders the page heading and a link back home', () => {
    render(createElement(MemoryRouter, null, createElement(AboutPage)));

    expect(
      screen.getByRole('heading', { name: /about/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to home/i })
    ).toHaveAttribute('href', '/');
  });
});
