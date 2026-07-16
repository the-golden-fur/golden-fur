import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders Active when isActive is true', () => {
    render(createElement(StatusBadge, { isActive: true }));
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders Inactive when isActive is false', () => {
    render(createElement(StatusBadge, { isActive: false }));
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});
