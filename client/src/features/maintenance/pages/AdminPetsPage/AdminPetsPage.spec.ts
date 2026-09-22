import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPetsPage } from './AdminPetsPage';

vi.mock('../AdminPetTypesPage/AdminPetTypesPage', () => ({
  AdminPetTypesPage: () => createElement('div', null, 'Pet Types content'),
}));
vi.mock('../AdminBreedsPage/AdminBreedsPage', () => ({
  AdminBreedsPage: () => createElement('div', null, 'Breeds content'),
}));

describe('AdminPetsPage', () => {
  it('defaults to the Pet Types section', () => {
    render(createElement(AdminPetsPage));

    expect(screen.getByText('Pet Types content')).toBeInTheDocument();
    expect(screen.queryByText('Breeds content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pet Types' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('switches to Breeds without touching Pet Types content', async () => {
    render(createElement(AdminPetsPage));
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Breeds' }));

    expect(screen.getByText('Breeds content')).toBeInTheDocument();
    expect(screen.queryByText('Pet Types content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Breeds' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
