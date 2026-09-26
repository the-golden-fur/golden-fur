import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RarityTier, SpinWheelReward } from '../../rewards.types';
import { RewardPoolBuilderModal } from './RewardPoolBuilderModal';

function buildReward(
  id: string,
  label: string,
  weight: number,
  rarity_tier: RarityTier,
  is_active = true
): SpinWheelReward {
  return {
    id,
    label,
    discount_type: 'Percentage',
    value: 10,
    rarity_tier,
    weight,
    is_active,
    archived_at: null,
    created_by: null,
    updated_by: null,
    created_at: '',
    updated_at: '',
  };
}

const REWARDS = [
  buildReward('a', 'Five Off', 30, 'Common'),
  buildReward('b', 'Ten Off', 10, 'Rare'),
  buildReward('c', 'Big Prize', 10, 'Legendary'),
  buildReward('d', 'Retired', 50, 'Epic', false),
];

function renderBuilder(onSave = vi.fn()) {
  render(
    createElement(RewardPoolBuilderModal, {
      isOpen: true,
      pool: null,
      rewards: REWARDS,
      isSaving: false,
      error: null,
      onClose: vi.fn(),
      onSave,
    })
  );
  return { onSave };
}

function chanceRow(label: string) {
  const table = screen.getByRole('table');
  return within(table).getByText(label).closest('tr') as HTMLElement;
}

describe('RewardPoolBuilderModal (session 114)', () => {
  it("recalculates each selected reward's % chance live as rewards are ticked", async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('checkbox', { name: /Five Off/ }));
    expect(within(chanceRow('Five Off')).getByText('100%')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Ten Off/ }));
    expect(within(chanceRow('Five Off')).getByText('75%')).toBeInTheDocument();
    expect(within(chanceRow('Ten Off')).getByText('25%')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Big Prize/ }));
    expect(within(chanceRow('Five Off')).getByText('60%')).toBeInTheDocument();
    expect(within(chanceRow('Big Prize')).getByText('20%')).toBeInTheDocument();
    expect(
      screen.getByText('Legendary', { selector: 'strong' })
    ).toBeInTheDocument();
  });

  it('an inactive reward can sit in the pool but gets no chance', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('checkbox', { name: /Five Off/ }));
    await user.click(screen.getByRole('checkbox', { name: /Retired/ }));

    expect(
      within(chanceRow('Retired')).getByText('Inactive')
    ).toBeInTheDocument();
    expect(within(chanceRow('Five Off')).getByText('100%')).toBeInTheDocument();
  });

  it('warns when the pool has no active rewards', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByRole('checkbox', { name: /Retired/ }));

    expect(screen.getByText(/has no active rewards/)).toBeInTheDocument();
  });

  it('saves the name, description, and selected reward ids', async () => {
    const user = userEvent.setup();
    const { onSave } = renderBuilder();

    await user.type(screen.getByLabelText('Pool name'), 'Rare Rewards');
    await user.click(screen.getByRole('checkbox', { name: /Ten Off/ }));
    await user.click(screen.getByRole('checkbox', { name: /Big Prize/ }));
    await user.click(screen.getByRole('button', { name: 'Create pool' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Rare Rewards',
      description: null,
      reward_ids: ['b', 'c'],
    });
  });
});
