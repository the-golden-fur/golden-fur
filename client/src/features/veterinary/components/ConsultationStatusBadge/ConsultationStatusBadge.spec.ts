import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ConsultationStatusBadge } from './ConsultationStatusBadge';
import type { ConsultationStatus } from '../../veterinary.types';

describe('ConsultationStatusBadge', () => {
  const statuses: ConsultationStatus[] = ['Pending', 'Ongoing', 'Completed'];

  it.each(statuses)('renders the %s status label', (status) => {
    render(createElement(ConsultationStatusBadge, { status }));
    expect(screen.getByText(status)).toBeInTheDocument();
  });
});
