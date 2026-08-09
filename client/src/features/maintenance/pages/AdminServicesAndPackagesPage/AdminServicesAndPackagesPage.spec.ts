import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AdminServicesAndPackagesPage } from './AdminServicesAndPackagesPage';

vi.mock('../AdminServicesPage/AdminServicesPage', () => ({
  AdminServicesPage: () => createElement('div', null, 'Services content'),
}));
vi.mock('../AdminServiceTypesPage/AdminServiceTypesPage', () => ({
  AdminServiceTypesPage: () =>
    createElement('div', null, 'Service Types content'),
}));
vi.mock('../AdminPackageBuilderPage/AdminPackageBuilderPage', () => ({
  AdminPackageBuilderPage: () => createElement('div', null, 'Packages content'),
}));

function renderPage() {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/staff/admin/maintenance/services-and-packages'] },
      createElement(AdminServicesAndPackagesPage)
    )
  );
}

describe('AdminServicesAndPackagesPage', () => {
  it('defaults to the Services section', () => {
    renderPage();

    expect(screen.getByText('Services content')).toBeInTheDocument();
    expect(screen.queryByText('Service Types content')).not.toBeInTheDocument();
    expect(screen.queryByText('Packages content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Services' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switches to Service Types without touching Services/Packages content', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Service Types' }));

    expect(screen.getByText('Service Types content')).toBeInTheDocument();
    expect(screen.queryByText('Services content')).not.toBeInTheDocument();
    expect(screen.queryByText('Packages content')).not.toBeInTheDocument();
  });

  it('switches to Packages', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Packages' }));

    expect(screen.getByText('Packages content')).toBeInTheDocument();
    expect(screen.queryByText('Services content')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Types content')).not.toBeInTheDocument();
  });
});
