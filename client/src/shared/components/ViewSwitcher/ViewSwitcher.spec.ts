import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ViewSwitcher } from './ViewSwitcher';

const options = [
  { value: 'table', label: 'Table' },
  { value: 'board', label: 'Board' },
];

describe('ViewSwitcher', () => {
  it('marks the active option with aria-pressed', () => {
    render(
      createElement(ViewSwitcher, {
        options,
        value: 'board',
        onChange: vi.fn(),
      })
    );

    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('fires onChange with the clicked option value', async () => {
    const onChange = vi.fn();
    render(createElement(ViewSwitcher, { options, value: 'table', onChange }));

    await userEvent.click(screen.getByRole('button', { name: 'Board' }));

    expect(onChange).toHaveBeenCalledWith('board');
  });
});
