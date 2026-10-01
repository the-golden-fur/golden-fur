/** One menu item's rendered height (line height + its vertical padding) and
 * the menu's own border/padding - enough to tell, before the menu is in the
 * DOM, whether it will fit below its anchor. An estimate on purpose: being
 * a few pixels off only moves the point at which the menu flips. */
const MENU_ITEM_HEIGHT_PX = 40;
const MENU_CHROME_PX = 10;

export function estimateMenuHeight(itemCount: number): number {
  return itemCount * MENU_ITEM_HEIGHT_PX + MENU_CHROME_PX;
}

interface MenuAnchor {
  /** Viewport y of the anchor's top and bottom edges - the trigger button's
   * rect, or the same click point for both. */
  anchorTop: number;
  anchorBottom: number;
  itemCount: number;
  viewportHeight: number;
  /** Space left between the anchor and the menu. */
  gap?: number;
}

/**
 * Where a `position: fixed` menu goes vertically: below its anchor when it
 * fits there, otherwise above it - so a menu opened from a row near the
 * bottom of the screen isn't cut off by the viewport edge. It only flips
 * when there is actually more room above; with too little room either way
 * it stays below, the familiar side.
 *
 * Returns both `top` and `bottom` so the result can be spread straight into
 * a style object - the unused one is 'auto', which also cancels the
 * stylesheet's own default `top`.
 */
export function placeMenuVertically({
  anchorTop,
  anchorBottom,
  itemCount,
  viewportHeight,
  gap = 0,
}: MenuAnchor): { top: number | 'auto'; bottom: number | 'auto' } {
  const menuHeight = estimateMenuHeight(itemCount);
  const spaceBelow = viewportHeight - anchorBottom - gap;
  const spaceAbove = anchorTop - gap;

  if (spaceBelow >= menuHeight || spaceBelow >= spaceAbove) {
    return { top: anchorBottom + gap, bottom: 'auto' };
  }

  return { top: 'auto', bottom: viewportHeight - anchorTop + gap };
}
