import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ConfigTab } from './ConfigTab';

function renderTab(isSuperadmin: boolean) {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(ConfigTab, { isSuperadmin })
    )
  );
}

describe('ConfigTab', () => {
  it('links to every admin-config page for an Admin (no System Configuration)', () => {
    renderTab(false);

    expect(screen.getByRole('link', { name: /^services/i })).toHaveAttribute(
      'href',
      '/staff/admin/maintenance/services-and-packages'
    );
    expect(screen.getByRole('link', { name: /^discounts/i })).toHaveAttribute(
      'href',
      '/staff/admin/discounts'
    );
    expect(
      screen.queryByRole('link', { name: /system configuration/i })
    ).not.toBeInTheDocument();
  });

  it('adds the System Configuration tile for a Superadmin', () => {
    renderTab(true);

    expect(
      screen.getByRole('link', { name: /system configuration/i })
    ).toHaveAttribute('href', '/staff/admin/maintenance/system-configuration');
  });
});
