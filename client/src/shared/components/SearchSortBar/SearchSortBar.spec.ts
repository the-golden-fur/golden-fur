import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SearchSortBar } from './SearchSortBar';

describe('SearchSortBar', () => {
  it('renders the current search value and sort options', () => {
    render(
      createElement(SearchSortBar<'soonest' | 'latest'>, {
        searchValue: 'bantay',
        onSearchChange: vi.fn(),
        searchPlaceholder: 'Search by pet name...',
        sortValue: 'soonest',
        onSortChange: vi.fn(),
        sortOptions: [
          { value: 'soonest', label: 'Sort: Soonest' },
          { value: 'latest', label: 'Sort: Latest' },
        ],
      })
    );

    expect(screen.getByPlaceholderText('Search by pet name...')).toHaveValue(
      'bantay'
    );
    expect(screen.getByRole('combobox')).toHaveValue('soonest');
  });

  it('calls onSearchChange as the user types', async () => {
    const onSearchChange = vi.fn();
    render(
      createElement(SearchSortBar<'soonest'>, {
        searchValue: '',
        onSearchChange,
        searchPlaceholder: 'Search...',
        sortValue: 'soonest',
        onSortChange: vi.fn(),
        sortOptions: [{ value: 'soonest', label: 'Soonest' }],
      })
    );

    await userEvent.type(screen.getByPlaceholderText('Search...'), 'x');

    expect(onSearchChange).toHaveBeenCalledWith('x');
  });

  it('calls onSortChange when a different sort option is selected', async () => {
    const onSortChange = vi.fn();
    render(
      createElement(SearchSortBar<'soonest' | 'latest'>, {
        searchValue: '',
        onSearchChange: vi.fn(),
        searchPlaceholder: 'Search...',
        sortValue: 'soonest',
        onSortChange,
        sortOptions: [
          { value: 'soonest', label: 'Sort: Soonest' },
          { value: 'latest', label: 'Sort: Latest' },
        ],
      })
    );

    await userEvent.selectOptions(screen.getByRole('combobox'), 'latest');

    expect(onSortChange).toHaveBeenCalledWith('latest');
  });
});
