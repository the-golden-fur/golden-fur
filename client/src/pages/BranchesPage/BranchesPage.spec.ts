import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BranchesPage } from './BranchesPage';

describe('BranchesPage', () => {
  it('renders the page heading and a link back home', () => {
    render(createElement(MemoryRouter, null, createElement(BranchesPage)));

    expect(
      screen.getByRole('heading', { name: /branches/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('renders a Get Directions link per branch pointing at Google Maps', () => {
    render(createElement(MemoryRouter, null, createElement(BranchesPage)));

    const directionsLinks = screen.getAllByRole('link', {
      name: /get directions/i,
    });

    expect(directionsLinks).toHaveLength(2);
    directionsLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining(
          'https://www.google.com/maps/dir/?api=1&destination='
        )
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });
});
