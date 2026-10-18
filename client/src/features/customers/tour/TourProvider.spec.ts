import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TourProvider } from './TourProvider';
import { useTour } from './tourContext';
import type { TourSection } from './tourSections';

const SECTIONS: TourSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    steps: [{ title: 'Welcome', text: 'Welcome text' }],
  },
  {
    id: 'booking',
    title: 'Booking',
    steps: [
      { title: 'Book a Service', text: 'Book text' },
      { title: 'My Bookings', text: 'Bookings text' },
    ],
  },
];

/** Shows the router state, plus buttons that call the tour like Settings
 * and the mascot do. */
function Page() {
  const location = useLocation();
  const { startTour, openSectionPicker, isActive } = useTour();

  return createElement(
    'div',
    null,
    createElement(
      'p',
      { 'data-testid': 'router-state' },
      JSON.stringify(location.state)
    ),
    createElement('p', null, isActive ? 'tour active' : 'tour idle'),
    createElement(
      'button',
      { type: 'button', onClick: () => startTour('booking') },
      'Booking only'
    ),
    createElement(
      'button',
      { type: 'button', onClick: openSectionPicker },
      'Replay tutorial'
    )
  );
}

function renderProvider(entry: { pathname: string; state?: unknown }) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [entry] },
      createElement(
        TourProvider,
        { sections: SECTIONS },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '*', element: createElement(Page) })
        )
      )
    )
  );
}

describe('TourProvider', () => {
  it('starts the full tour after a fresh registration and clears the flag straight away', async () => {
    renderProvider({ pathname: '/portal', state: { justRegistered: true } });

    expect(
      await screen.findByRole('dialog', { name: 'Welcome' })
    ).toBeInTheDocument();
    // Cleared the moment it starts - a refresh or Back can't start it again.
    expect(screen.getByTestId('router-state')).toHaveTextContent('null');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('does not start again once finished, even though the page stays on /portal', async () => {
    const user = userEvent.setup();
    renderProvider({ pathname: '/portal', state: { justRegistered: true } });

    await user.click(await screen.findByRole('button', { name: 'Skip' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('tour idle')).toBeInTheDocument();
  });

  it('does not start on a normal visit to /portal (a login)', () => {
    renderProvider({ pathname: '/portal' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('only auto-starts on /portal, not on another page carrying the flag', () => {
    renderProvider({
      pathname: '/portal/pets',
      state: { justRegistered: true },
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('startTour(sectionId) runs just that section', async () => {
    const user = userEvent.setup();
    renderProvider({ pathname: '/portal/settings' });

    await user.click(screen.getByRole('button', { name: 'Booking only' }));

    expect(
      screen.getByRole('dialog', { name: 'Book a Service' })
    ).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('replay opens the section picker, which can start one section or the full tour', async () => {
    const user = userEvent.setup();
    renderProvider({ pathname: '/portal/settings' });

    await user.click(screen.getByRole('button', { name: 'Replay tutorial' }));
    expect(screen.getByText('tour active')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /^Booking\s*2 steps/ })
    );
    expect(
      screen.getByRole('dialog', { name: 'Book a Service' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.click(screen.getByRole('button', { name: 'Replay tutorial' }));
    await user.click(screen.getByRole('button', { name: 'Full tour' }));
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});
