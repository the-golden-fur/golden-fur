import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  PetCoatType,
  PetWeightClass,
} from '../../../customers/customer.types';
import { AssessmentModal } from './AssessmentModal';

const CUTOFFS = { m_min_kg: 9.5, l_min_kg: 22, xl_min_kg: 41 };

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [weightKg, setWeightKg] = useState<number | ''>('');
  const [weightClass, setWeightClass] = useState<PetWeightClass | ''>('');
  const [overridden, setOverridden] = useState(false);
  const [coatType, setCoatType] = useState<PetCoatType | ''>('');

  return createElement(AssessmentModal, {
    pet: null,
    weightKg,
    onWeightKgChange: setWeightKg,
    entryUnit: 'kg',
    onEntryUnitChange: vi.fn(),
    cutoffs: CUTOFFS,
    weightClass,
    onWeightClassChange: setWeightClass,
    weightClassOverridden: overridden,
    onWeightClassOverriddenChange: setOverridden,
    coatType,
    onCoatTypeChange: setCoatType,
    isSaving: false,
    error: null,
    onCancel: vi.fn(),
    onConfirm,
  });
}

describe('AssessmentModal', () => {
  it('derives a read-only weight class from the entered weight, override re-enables it', async () => {
    const user = userEvent.setup();
    render(createElement(Harness, { onConfirm: vi.fn() }));

    const classSelect = screen.getByLabelText('Weight class');
    expect(classSelect).not.toBeDisabled();

    await user.type(screen.getByLabelText(/Weight \(kg\)/), '25');

    expect(classSelect).toHaveValue('L');
    expect(classSelect).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', {
        name: /Override the derived weight class/,
      })
    );
    expect(classSelect).not.toBeDisabled();
  });

  it('keeps Save & Start disabled until a positive weight and a coat type are set', async () => {
    const user = userEvent.setup();
    render(createElement(Harness, { onConfirm: vi.fn() }));

    const save = screen.getByRole('button', { name: 'Save & Start' });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/Weight \(kg\)/), '25');
    expect(save).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Coat type'), 'SC');
    expect(save).toBeEnabled();
  });
});
