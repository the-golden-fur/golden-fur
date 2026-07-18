import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CustomerPortalPage } from './CustomerPortalPage';

describe('CustomerPortalPage', () => {
  it('links to the booking flow, bookings list, and profile', () => {
    render(
      createElement(MemoryRouter, null, createElement(CustomerPortalPage))
    );

    expect(
      screen.getByRole('link', { name: /book a service/i })
    ).toHaveAttribute('href', '/portal/book');
    expect(screen.getByRole('link', { name: /my bookings/i })).toHaveAttribute(
      'href',
      '/portal/bookings'
    );
    expect(screen.getByRole('link', { name: /my profile/i })).toHaveAttribute(
      'href',
      '/portal/profile'
    );
  });
});
