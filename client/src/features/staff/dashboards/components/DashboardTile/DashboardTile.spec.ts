import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DashboardTile } from './DashboardTile';

function renderTile(props: {
  title: string;
  description: string;
  to?: string;
}) {
  return render(
    createElement(MemoryRouter, null, createElement(DashboardTile, props))
  );
}

describe('DashboardTile', () => {
  it('renders as a link when `to` is provided', () => {
    renderTile({
      title: 'Staff Directory',
      description: 'Manage staff accounts.',
      to: '/staff/admin/staff',
    });

    expect(
      screen.getByRole('link', { name: /staff directory/i })
    ).toHaveAttribute('href', '/staff/admin/staff');
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('renders as a disabled "Coming soon" placeholder when `to` is omitted', () => {
    renderTile({
      title: 'Grooming Queue',
      description: "Today's grooming appointments.",
    });

    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /grooming queue/i })
    ).not.toBeInTheDocument();
  });
});
