import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpMascot } from './HelpMascot';
import styles from './HelpMascot.module.css';

vi.mock('./mascots', () => ({
  CURRENT_MASCOT: {
    id: 'doggy',
    alt: 'Dog mascot',
    idleGif: '/test/idle.gif',
    fallbackEmoji: '🐶',
    pet: {
      handImage: '/test/pet-hand.gif',
      handGifDurationMs: 300,
      gif: '/test/petting.gif',
      gifDurationMs: 1000,
      sound: 'Woof!',
    },
  },
}));

function renderMascot() {
  return render(
    createElement(
      MemoryRouter,
      null,
      createElement(HelpMascot, {
        links: [
          { label: 'Create an account', href: '#' },
          { label: 'Create a ticket', href: '#' },
        ],
      })
    )
  );
}

function mascotButton() {
  return screen.getByRole('button', { name: 'Pet the mascot' });
}

function mascotImage() {
  return screen.getByAltText('Dog mascot');
}

/** Lets the petting GIF's one-off download (a mocked fetch) settle. */
async function flushGifDownload() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('HelpMascot - hide / show', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the mascot, its tip bubble and its hover links by default', () => {
    const { container } = renderMascot();

    expect(mascotButton()).toBeInTheDocument();
    expect(container.querySelector(`.${styles.bubble}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'FAQs' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show mascot' })
    ).not.toBeInTheDocument();
  });

  it('offers "Hide me" as the last bubble of the hover menu', () => {
    renderMascot();

    const bubbles = Array.from(
      screen.getByRole('navigation', { name: 'Support links' }).children
    );

    expect(bubbles.map((bubble) => bubble.textContent)).toEqual([
      'FAQs',
      'Create an account',
      'Create a ticket',
      'Hide me',
    ]);
  });

  it('hiding removes the gold circle, tips, hover links and hand, leaving only a way back', () => {
    const { container } = renderMascot();

    fireEvent.click(screen.getByRole('button', { name: 'Hide me' }));

    expect(
      screen.queryByRole('button', { name: 'Pet the mascot' })
    ).not.toBeInTheDocument();
    expect(container.querySelector(`.${styles.bubble}`)).toBeNull();
    expect(container.querySelector(`.${styles.menu}`)).toBeNull();
    expect(container.querySelector(`.${styles.hand}`)).toBeNull();
    expect(screen.queryByRole('button', { name: 'FAQs' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Show mascot' })
    ).toBeInTheDocument();
  });

  it('never shows a tip while hidden, and tips resume once shown again', () => {
    vi.useFakeTimers();
    const { container } = renderMascot();

    fireEvent.click(screen.getByRole('button', { name: 'Hide me' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(container.querySelector(`.${styles.bubble}`)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show mascot' }));
    act(() => {
      vi.advanceTimersByTime(900);
    });

    const bubble = container.querySelector(`.${styles.bubble}`);
    expect(bubble).toHaveClass(styles.isVisible);
    expect(bubble?.textContent).not.toBe('');

    vi.useRealTimers();
  });

  it('remembers the choice on this device', () => {
    const first = renderMascot();
    fireEvent.click(screen.getByRole('button', { name: 'Hide me' }));
    expect(window.localStorage.getItem('golden-fur.mascotHidden')).toBe('true');
    first.unmount();

    // A later visit / another page: still hidden.
    renderMascot();
    expect(
      screen.queryByRole('button', { name: 'Pet the mascot' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show mascot' }));
    expect(mascotButton()).toBeInTheDocument();
    expect(window.localStorage.getItem('golden-fur.mascotHidden')).toBe(
      'false'
    );
  });
});

describe('HelpMascot - petting', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();

    // Each GIF's data downloads successfully...
    const nameByData = new WeakMap<Blob, string>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const data = new Blob([url]);
        nameByData.set(data, url.includes('hand') ? 'hand' : 'pet');

        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(data),
        });
      })
    );
    // ...and every object URL made from it is a brand-new address, numbered
    // per GIF: blob:pet-1, blob:pet-2, ... and blob:hand-1, blob:hand-2, ...
    const countByName: Record<string, number> = {};
    URL.createObjectURL = vi.fn((data: Blob | MediaSource) => {
      const name = nameByData.get(data as Blob) ?? 'unknown';
      countByName[name] = (countByName[name] ?? 0) + 1;

      return `blob:${name}-${countByName[name]}`;
    });
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the hand image at the pointer while the mouse is over the mascot, and hides it on leaving', () => {
    const { container } = renderMascot();
    const hand = container.querySelector(`.${styles.hand}`) as HTMLElement;

    expect(hand).not.toHaveClass(styles.handVisible);

    fireEvent.pointerMove(mascotButton(), {
      pointerType: 'mouse',
      clientX: 120,
      clientY: 340,
    });

    expect(hand).toHaveClass(styles.handVisible);
    expect(hand.style.left).toBe('120px');
    expect(hand.style.top).toBe('340px');
    expect(hand.querySelector('img')).toHaveAttribute(
      'src',
      '/test/pet-hand.gif'
    );

    fireEvent.pointerLeave(mascotButton());

    expect(hand).not.toHaveClass(styles.handVisible);
  });

  it('does not show the hand for a touch pointer', () => {
    const { container } = renderMascot();

    fireEvent.pointerMove(mascotButton(), {
      pointerType: 'touch',
      clientX: 10,
      clientY: 10,
    });

    expect(container.querySelector(`.${styles.hand}`)).not.toHaveClass(
      styles.handVisible
    );
  });

  it('pressing the mascot plays the petting GIF, then goes back to the idle GIF once it has played through', async () => {
    renderMascot();
    const idleSrc = mascotImage().getAttribute('src');

    fireEvent.click(mascotButton());

    expect(mascotImage()).toHaveAttribute('src', '/test/petting.gif');

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(mascotImage()).toHaveAttribute('src', '/test/petting.gif');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mascotImage()).toHaveAttribute('src', idleSrc);
  });

  it('plays the hand GIF from its first frame on every press, then rests it again', async () => {
    const { container } = renderMascot();
    const handImage = () =>
      container.querySelector(`.${styles.hand} img`) as HTMLImageElement;

    fireEvent.pointerEnter(mascotButton(), { pointerType: 'mouse' });
    await flushGifDownload();
    const restingSrc = handImage().getAttribute('src');

    fireEvent.click(mascotButton());
    expect(handImage()).toHaveAttribute('src', 'blob:hand-1');

    // A second press mid-stroke restarts it from a brand-new address.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.click(mascotButton());
    expect(handImage()).toHaveAttribute('src', 'blob:hand-2');

    // The hand's own (short) duration, not the petting GIF's.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(handImage()).toHaveAttribute('src', restingSrc);
    // The mascot's petting GIF is still going.
    expect(mascotImage()).toHaveAttribute('src', 'blob:pet-2');
  });

  it('downloads each GIF once, on first hover, not on page load', async () => {
    renderMascot();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.pointerEnter(mascotButton(), { pointerType: 'mouse' });
    fireEvent.pointerMove(mascotButton(), { pointerType: 'mouse' });
    await flushGifDownload();
    fireEvent.click(mascotButton());
    fireEvent.click(mascotButton());

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('/test/petting.gif');
    expect(fetch).toHaveBeenCalledWith('/test/pet-hand.gif');
  });

  it('every press plays the petting GIF from its first frame, by showing it from a brand-new address', async () => {
    renderMascot();
    fireEvent.pointerEnter(mascotButton(), { pointerType: 'mouse' });
    await flushGifDownload();

    fireEvent.click(mascotButton());
    const firstPlay = mascotImage();
    expect(firstPlay).toHaveAttribute('src', 'blob:pet-1');

    // A second press part-way through.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    fireEvent.click(mascotButton());

    // A different address in a different <img> element - the browser has no
    // running animation for it, so it starts from frame one.
    expect(mascotImage()).toHaveAttribute('src', 'blob:pet-2');
    expect(mascotImage()).not.toBe(firstPlay);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pet-1');

    // 1400ms after the first press, but only 700ms into the second play.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(mascotImage()).toHaveAttribute('src', 'blob:pet-2');

    // The second play finishes its full duration, then idle comes back.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mascotImage().getAttribute('src')).not.toMatch(/^blob:/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pet-2');
  });

  describe('"Woof!" bubbles', () => {
    function woofBubbles(container: HTMLElement) {
      return Array.from(
        container.querySelectorAll<HTMLElement>(`.${styles.woof}`)
      );
    }

    it('pops one out on every press', () => {
      const { container } = renderMascot();

      expect(woofBubbles(container)).toHaveLength(0);

      fireEvent.click(mascotButton());
      fireEvent.click(mascotButton());
      fireEvent.click(mascotButton());

      const bubbles = woofBubbles(container);
      expect(bubbles).toHaveLength(3);
      expect(bubbles[0]).toHaveTextContent('Woof!');
    });

    it('sends each one out to the left of the circle, staying close to it', () => {
      const { container } = renderMascot();

      for (let press = 0; press < 6; press += 1) {
        fireEvent.click(mascotButton());
      }

      for (const bubble of woofBubbles(container)) {
        const toX = parseFloat(bubble.style.getPropertyValue('--woof-to-x'));
        const toY = parseFloat(bubble.style.getPropertyValue('--woof-to-y'));
        const distance = Math.hypot(toX, toY);

        expect(toX).toBeLessThan(0); // left of the circle's centre
        // jsdom has no layout, so the circle falls back to its 65px radius:
        // the bubble ends 30-60px outside it.
        expect(distance).toBeGreaterThanOrEqual(95);
        expect(distance).toBeLessThanOrEqual(125);
      }
    });

    it('removes a bubble once its animation has finished', () => {
      const { container } = renderMascot();

      fireEvent.click(mascotButton());
      fireEvent.click(mascotButton());
      fireEvent.animationEnd(woofBubbles(container)[0]);

      expect(woofBubbles(container)).toHaveLength(1);
    });

    it('keeps at most six on screen when the mascot is pressed rapidly', () => {
      const { container } = renderMascot();

      for (let press = 0; press < 10; press += 1) {
        fireEvent.click(mascotButton());
      }

      expect(woofBubbles(container)).toHaveLength(6);
    });
  });

  it('a press after the mascot went back to idle starts the petting GIF from the start again', async () => {
    renderMascot();
    fireEvent.pointerEnter(mascotButton(), { pointerType: 'mouse' });
    await flushGifDownload();

    fireEvent.click(mascotButton());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(mascotButton());

    expect(mascotImage()).toHaveAttribute('src', 'blob:pet-2');
  });
});
