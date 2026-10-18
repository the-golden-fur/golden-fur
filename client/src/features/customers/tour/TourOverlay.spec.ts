import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TourOverlay, type TourOverlayStep } from './TourOverlay';

const STEPS: TourOverlayStep[] = [
  {
    title: 'Welcome',
    text: 'Welcome text',
    sectionTitle: 'Getting started',
    indexInSection: 0,
    sectionLength: 1,
  },
  {
    title: 'Pet Manager',
    text: 'Add your pets here.',
    target: 'nav:/portal/pets',
    image: '/tour/pets.png',
    imageAlt: 'The Pet Manager page',
    sectionTitle: 'Your pets',
    indexInSection: 0,
    sectionLength: 2,
  },
  {
    title: 'Food & Medication',
    text: 'Food text',
    target: 'nav:/portal/food-medication',
    sectionTitle: 'Your pets',
    indexInSection: 1,
    sectionLength: 2,
  },
];

/** A page element the tour can point at, at a known on-screen box. */
function addTarget(
  name: string,
  box = { top: 100, left: 20, width: 200, height: 40 }
) {
  const element = document.createElement('div');
  element.setAttribute('data-tour', name);
  element.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(element);
  return element;
}

function renderOverlay(onClose = vi.fn()) {
  render(createElement(TourOverlay, { steps: STEPS, onClose }));
  return onClose;
}

afterEach(() => {
  document
    .querySelectorAll('[data-tour]')
    .forEach((element) => element.remove());
});

describe('TourOverlay', () => {
  it('starts on the first step with Previous disabled, centred when the step has no target', () => {
    renderOverlay();

    expect(screen.getByRole('dialog', { name: 'Welcome' })).toHaveAttribute(
      'data-placement',
      'centred'
    );
    expect(screen.getByText('Getting started · 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
  });

  it('spotlights the target element and anchors the popover beside it', async () => {
    addTarget('nav:/portal/pets');
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const spotlight = screen.getByTestId('tour-spotlight');
    // The target's box plus the 6px highlight padding on every side.
    expect(spotlight).toHaveStyle({
      top: '94px',
      left: '14px',
      width: '212px',
      height: '52px',
    });
    expect(screen.getByRole('dialog', { name: 'Pet Manager' })).toHaveAttribute(
      'data-placement',
      'anchored'
    );
    expect(screen.getByText('Your pets · 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'The Pet Manager page' })
    ).toHaveAttribute('src', '/tour/pets.png');
  });

  it('falls back to a centred popover when the target is not on the page', async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('dialog', { name: 'Pet Manager' })).toHaveAttribute(
      'data-placement',
      'centred'
    );
    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
  });

  it('falls back to centred for a target that is hidden (zero size)', async () => {
    addTarget('nav:/portal/pets', { top: 0, left: 0, width: 0, height: 0 });
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByTestId('tour-spotlight')).not.toBeInTheDocument();
  });

  it('Previous goes back, and the last step swaps Next for Done and hides Skip', async () => {
    const user = userEvent.setup();
    const onClose = renderOverlay();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      screen.getByRole('dialog', { name: 'Food & Medication' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Skip' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Skip and Escape end the tour; the arrow keys move between steps', async () => {
    const user = userEvent.setup();
    const onClose = renderOverlay();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
