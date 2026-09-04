import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { StaffRoleMultiSelect } from './StaffRoleMultiSelect';

describe('StaffRoleMultiSelect', () => {
  it('renders one checkbox per staff role, reflecting the current selection', () => {
    render(
      createElement(StaffRoleMultiSelect, {
        label: 'Eligible staff roles',
        selectedRoles: ['Groomer'],
        onChange: vi.fn(),
      })
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByRole('checkbox', { name: 'Groomer' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Veterinarian' })
    ).not.toBeChecked();
  });

  it('emits the added role, preserving the rest of ALL_STAFF_ROLES order', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(StaffRoleMultiSelect, {
        label: 'Eligible staff roles',
        selectedRoles: ['Groomer'],
        onChange,
      })
    );

    await user.click(screen.getByRole('checkbox', { name: 'Pet Assistant' }));

    expect(onChange).toHaveBeenCalledWith(['Groomer', 'Pet Assistant']);
  });

  it('emits the remaining roles when unchecking', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      createElement(StaffRoleMultiSelect, {
        label: 'Eligible staff roles',
        selectedRoles: ['Groomer', 'Pet Assistant'],
        onChange,
      })
    );

    await user.click(screen.getByRole('checkbox', { name: 'Groomer' }));

    expect(onChange).toHaveBeenCalledWith(['Pet Assistant']);
  });

  it('disables every checkbox when disabled is set', () => {
    render(
      createElement(StaffRoleMultiSelect, {
        label: 'Eligible staff roles',
        selectedRoles: [],
        onChange: vi.fn(),
        disabled: true,
      })
    );

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
    }
  });
});
