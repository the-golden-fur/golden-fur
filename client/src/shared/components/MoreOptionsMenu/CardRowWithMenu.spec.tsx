import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CardRowWithMenu } from './CardRowWithMenu';

function renderRow(showMenuButton?: boolean, onSelect = vi.fn()) {
  render(
    <CardRowWithMenu
      label="Actions for Bath"
      items={[{ label: 'Configure', onSelect }]}
      showMenuButton={showMenuButton}
    >
      <span>Bath</span>
    </CardRowWithMenu>
  );

  return onSelect;
}

describe('CardRowWithMenu', () => {
  it('list rows: shows a persistent "..." button that opens the menu', async () => {
    const onSelect = renderRow(true);

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Bath' })
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Configure' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('list rows: right-click still opens the same menu', () => {
    renderRow(true);

    fireEvent.contextMenu(screen.getByText('Bath'));

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
  });

  it('board/gallery cards: no persistent button, but right-click opens the menu', () => {
    renderRow(false);

    expect(
      screen.queryByRole('button', { name: 'Actions for Bath' })
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Bath'));

    expect(
      screen.getByRole('menuitem', { name: 'Configure' })
    ).toBeInTheDocument();
  });
});
