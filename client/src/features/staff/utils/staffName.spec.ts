import { describe, expect, it } from 'vitest';
import { staffDisplayName, staffLegalName } from './staffName';

describe('staffName', () => {
  it('shows the nickname when there is one, otherwise "First Last"', () => {
    const maria = {
      first_name: 'Maria',
      middle_name: 'Clara',
      last_name: 'Dela Cruz',
    };
    expect(staffDisplayName({ ...maria, nickname: 'Clara' })).toBe('Clara');
    expect(staffDisplayName({ ...maria, nickname: '  ' })).toBe(
      'Maria Dela Cruz'
    );
    expect(staffDisplayName({ first_name: 'Maria' })).toBe('');
  });

  it('builds the legal name with the middle name, or null when none is recorded', () => {
    expect(
      staffLegalName({
        first_name: 'Maria',
        middle_name: 'Clara',
        last_name: 'Dela Cruz',
      })
    ).toBe('Maria Clara Dela Cruz');
    expect(staffLegalName({ first_name: 'Ana', last_name: 'Reyes' })).toBe(
      'Ana Reyes'
    );
    expect(staffLegalName({})).toBeNull();
  });
});
