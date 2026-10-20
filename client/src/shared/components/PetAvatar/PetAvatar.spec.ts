import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PetAvatar } from './PetAvatar';

describe('PetAvatar', () => {
  it('shows the photo when the pet has one', () => {
    render(
      createElement(PetAvatar, {
        name: 'Biscuit',
        photoUrl: 'https://example.com/biscuit.png',
      })
    );

    expect(screen.getByAltText("Biscuit's photo")).toHaveAttribute(
      'src',
      'https://example.com/biscuit.png'
    );
  });

  it('shows the first letter when the pet has no photo', () => {
    const { container } = render(
      createElement(PetAvatar, { name: 'biscuit', photoUrl: null })
    );

    expect(screen.queryByRole('img')).toBeNull();
    expect(container).toHaveTextContent('B');
  });

  it('falls back to the first letter when the photo fails to load', () => {
    const { container } = render(
      createElement(PetAvatar, {
        name: 'Biscuit',
        photoUrl: 'https://example.com/missing.png',
      })
    );

    fireEvent.error(screen.getByAltText("Biscuit's photo"));

    expect(screen.queryByAltText("Biscuit's photo")).toBeNull();
    expect(container).toHaveTextContent('B');
  });
});
