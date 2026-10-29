import { render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLandingPage } from '../../features/landing/api/landing.api';
import { resolveLanding } from '../../features/landing/landing.content';
import type { PublicBranch } from '../../features/landing/landing.types';
import GoldenFurLanding from './LandingPage';

vi.mock('../../features/landing/api/landing.api', () => ({
  loadLandingPage: vi.fn(),
}));

// The mascot fetches its own FAQs - not under test here.
vi.mock('../../shared/components/HelpMascot/HelpMascot', () => ({
  HelpMascot: () => null,
}));

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const IMUS: PublicBranch = {
  id: 'b-imus',
  name: 'Imus',
  address: 'Imus, Cavite',
  contact_number: null,
  operating_hours: { monday: { open: '08:00', close: '17:00' } },
  categories: ['Grooming', 'Daycare'],
};

function renderPage() {
  return render(
    createElement(MemoryRouter, null, createElement(GoldenFurLanding))
  );
}

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', NoopIntersectionObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('shows the built-in content when the server could not be reached', async () => {
    vi.mocked(loadLandingPage).mockResolvedValue(resolveLanding(null, null));

    const { container } = renderPage();

    expect(await screen.findByText('Care as warm as')).toBeInTheDocument();
    // Stagger headings are split into one span per letter, so they are
    // found by id rather than by text.
    expect(container.querySelector('#reviewsTitle')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Southwoods' })
    ).toBeInTheDocument();
  });

  it('shows saved text and hides a section a Superadmin turned off', async () => {
    vi.mocked(loadLandingPage).mockResolvedValue(
      resolveLanding(
        {
          content: { 'hero.title_lead': 'Love as deep as' },
          sections: { reviews: false },
          reviews: [],
        },
        [IMUS]
      )
    );

    const { container } = renderPage();

    expect(await screen.findByText('Love as deep as')).toBeInTheDocument();
    expect(container.querySelector('#reviewsTitle')).toBeNull();
    expect(container.querySelector('#servicesSection')).not.toBeNull();
  });

  it('builds the branch tabs, service cards and Visit us from the branches', async () => {
    vi.mocked(loadLandingPage).mockResolvedValue(resolveLanding(null, [IMUS]));

    const { container } = renderPage();

    expect(
      await screen.findByRole('button', { name: 'Imus' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Makati' })
    ).not.toBeInTheDocument();

    // The service cards are built by the setup effect, after React has
    // rendered the branch buttons, so they are waited for on their own.
    await waitFor(() => {
      const cards = container.querySelectorAll('.service-card-title');
      expect([...cards].map((card) => card.textContent)).toEqual([
        'Grooming',
        'Day Care',
      ]);
    });

    const visit = container.querySelector('#visitSection') as HTMLElement;
    expect(within(visit).getByText('Imus, Cavite')).toBeInTheDocument();
    expect(within(visit).getByText('Tue – Sun')).toBeInTheDocument();
  });

  it('shows saved text as text, never as HTML', async () => {
    vi.mocked(loadLandingPage).mockResolvedValue(
      resolveLanding(
        {
          content: { 'services.grooming.name': '<b>Grooming</b>' },
          sections: {},
          reviews: [
            {
              id: 'r-1',
              quote: '<img src=x onerror=alert(1)>',
              name: 'Ana',
              detail: '',
              rating: 5,
            },
          ],
        },
        [IMUS]
      )
    );

    const { container } = renderPage();

    expect(
      await screen.findByText('<img src=x onerror=alert(1)>')
    ).toBeInTheDocument();
    await waitFor(() => {
      const firstCard = container.querySelector('.service-card-title');
      expect(firstCard?.textContent).toBe('<b>Grooming</b>');
    });
    expect(container.querySelector('.service-card-title b')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });
});
