import { describe, expect, it } from 'vitest';
import { estimateMenuHeight, placeMenuVertically } from './menuPlacement';

describe('placeMenuVertically', () => {
  const VIEWPORT = 800;

  it('opens below the anchor when the menu fits there', () => {
    expect(
      placeMenuVertically({
        anchorTop: 100,
        anchorBottom: 128,
        itemCount: 3,
        viewportHeight: VIEWPORT,
        gap: 4,
      })
    ).toEqual({ top: 132, bottom: 'auto' });
  });

  it('opens above the anchor when it would run off the bottom of the screen', () => {
    expect(
      placeMenuVertically({
        anchorTop: 760,
        anchorBottom: 788,
        itemCount: 3,
        viewportHeight: VIEWPORT,
        gap: 4,
      })
      // Its bottom edge sits `gap` above the anchor's top edge.
    ).toEqual({ top: 'auto', bottom: VIEWPORT - 760 + 4 });
  });

  it('flips for a longer menu at a position where a shorter one still fits', () => {
    const anchor = {
      anchorTop: 650,
      anchorBottom: 678,
      viewportHeight: VIEWPORT,
      gap: 4,
    };

    // 118px of room below: enough for 2 items, not for 6.
    expect(estimateMenuHeight(2)).toBeLessThan(118);
    expect(estimateMenuHeight(6)).toBeGreaterThan(118);
    expect(placeMenuVertically({ ...anchor, itemCount: 2 }).bottom).toBe(
      'auto'
    );
    expect(placeMenuVertically({ ...anchor, itemCount: 6 }).top).toBe('auto');
  });

  it('stays below when there is no more room above than below', () => {
    expect(
      placeMenuVertically({
        anchorTop: 20,
        anchorBottom: 48,
        itemCount: 30,
        viewportHeight: 200,
      })
    ).toEqual({ top: 48, bottom: 'auto' });
  });

  it('works for a single click point (the right-click card menu)', () => {
    expect(
      placeMenuVertically({
        anchorTop: 790,
        anchorBottom: 790,
        itemCount: 3,
        viewportHeight: VIEWPORT,
      })
    ).toEqual({ top: 'auto', bottom: 10 });
  });
});
