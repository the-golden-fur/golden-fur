import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { listMedicalNotes } from '../../../api/customer.api';
import { MedicalNoteList } from './MedicalNoteList';

vi.mock('../../../api/customer.api', () => ({
  listMedicalNotes: vi.fn(),
}));

describe('MedicalNoteList', () => {
  it('AC-5: renders each note with its category and text', async () => {
    vi.mocked(listMedicalNotes).mockResolvedValue({
      data: [
        {
          id: 'note-1',
          pet_id: 'pet-1',
          note_text: 'Mild seasonal allergy observed',
          category: 'Allergy',
          staff_id: 'staff-1',
          created_at: '2026-07-12T00:00:00.000Z',
        },
      ],
      error: null,
    });

    render(
      createElement(MedicalNoteList, { petId: 'pet-1', accessToken: 'token' })
    );

    expect(await screen.findByText('Allergy')).toBeInTheDocument();
    expect(
      screen.getByText('Mild seasonal allergy observed')
    ).toBeInTheDocument();
  });

  it('renders an empty state when there are no notes', async () => {
    vi.mocked(listMedicalNotes).mockResolvedValue({ data: [], error: null });

    render(
      createElement(MedicalNoteList, { petId: 'pet-1', accessToken: 'token' })
    );

    expect(
      await screen.findByText('No medical notes yet.')
    ).toBeInTheDocument();
  });
});
