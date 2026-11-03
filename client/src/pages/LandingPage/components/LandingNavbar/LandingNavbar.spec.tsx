import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LandingNavbar } from './LandingNavbar';

function renderNavbar() {
  render(
    <MemoryRouter>
      <LandingNavbar />
      <p>Outside</p>
    </MemoryRouter>
  );
  return {
    toggle: screen.getByRole('button', { name: 'Open menu' }),
    menu: document.getElementById('landing-nav-menu') as HTMLElement,
  };
}

describe('LandingNavbar hamburger', () => {
  it('opens and closes from the toggle', async () => {
    const user = userEvent.setup();
    const { toggle, menu } = renderNavbar();

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(menu).not.toHaveClass('is-open');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Close menu');
    expect(menu).toHaveClass('is-open');

    await user.click(toggle);
    expect(menu).not.toHaveClass('is-open');
  });

  it('closes on Escape and returns focus to the toggle', async () => {
    const user = userEvent.setup();
    const { toggle, menu } = renderNavbar();

    await user.click(toggle);
    await user.click(menu);
    await user.keyboard('{Escape}');

    expect(menu).not.toHaveClass('is-open');
    expect(toggle).toHaveFocus();
  });

  it('closes on an outside press', async () => {
    const user = userEvent.setup();
    const { toggle, menu } = renderNavbar();

    await user.click(toggle);
    await user.click(screen.getByText('Outside'));

    expect(menu).not.toHaveClass('is-open');
  });

  it('closes when an action link is used but stays open for the theme toggle', async () => {
    const user = userEvent.setup();
    const { toggle, menu } = renderNavbar();

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /theme/i }));
    expect(menu).toHaveClass('is-open');

    await user.click(screen.getByRole('link', { name: 'Book Now' }));
    expect(menu).not.toHaveClass('is-open');
  });
});
