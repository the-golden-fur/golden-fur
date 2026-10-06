import type { ReactNode } from 'react';
import { CardContextMenu } from './CardContextMenu';
import { MoreOptionsMenu, type MoreOptionsMenuItem } from './MoreOptionsMenu';
import styles from './CardRowWithMenu.module.css';

interface CardRowWithMenuProps {
  label: string;
  items: MoreOptionsMenuItem[];
  /** true for List rows: a visible "..." at the row's end, in addition to
   * right-click / press-and-hold. false for Board/Gallery cards, where a
   * kebab on every card is noise and the hidden menu is the only trigger. */
  showMenuButton?: boolean;
  children: ReactNode;
}

/**
 * One card/row whose actions open by right-click / press-and-hold
 * (CardContextMenu), optionally with a persistent "..." button too - the
 * shape every admin Config List view uses (visible "..." + hold/right-click)
 * while Board views drop the button.
 */
export function CardRowWithMenu({
  label,
  items,
  showMenuButton = false,
  children,
}: CardRowWithMenuProps) {
  const card = (
    <CardContextMenu label={label} items={items}>
      {children}
    </CardContextMenu>
  );

  if (!showMenuButton) return card;

  return (
    <div className={styles.row}>
      <div className={styles.main}>{card}</div>
      <MoreOptionsMenu label={label} items={items} />
    </div>
  );
}
