import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { GroomingStatusBadge } from './GroomingStatusBadge';
import type { GroomingStatus } from '../../grooming.types';

describe('GroomingStatusBadge', () => {
  const statuses: GroomingStatus[] = ['Waiting', 'In Progress', 'Completed'];

  it.each(statuses)('renders the %s status label', (status) => {
    render(createElement(GroomingStatusBadge, { status }));
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
