import { describe, expect, it } from 'vitest';
import {
  createBugReportValidator,
  updateBugReportStatusValidator,
} from './bugReports.validator.ts';

describe('createBugReportValidator', () => {
  it('accepts a valid bug report', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: 'The pet photo upload fails',
        description: 'It spins forever and never finishes.',
      }).success
    ).toBe(true);
  });

  it('accepts a valid feature request', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'feature_request',
        title: 'Dark mode for the booking wizard',
        description: 'Would love this to match the rest of the app.',
      }).success
    ).toBe(true);
  });

  it('rejects an unknown category', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'complaint',
        title: 'Title',
        description: 'Description',
      }).success
    ).toBe(false);
  });

  it('rejects an empty title or description', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: '',
        description: 'Description',
      }).success
    ).toBe(false);
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: 'Title',
        description: '',
      }).success
    ).toBe(false);
  });

  it('rejects a title or description over the length limit', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: 'a'.repeat(201),
        description: 'Description',
      }).success
    ).toBe(false);
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: 'Title',
        description: 'a'.repeat(5001),
      }).success
    ).toBe(false);
  });

  it('rejects an unknown field', () => {
    expect(
      createBugReportValidator.safeParse({
        category: 'bug',
        title: 'Title',
        description: 'Description',
        status: 'resolved',
      }).success
    ).toBe(false);
  });
});

describe('updateBugReportStatusValidator', () => {
  it('accepts every valid status', () => {
    for (const status of ['pending', 'in_progress', 'resolved', 'dismissed']) {
      expect(updateBugReportStatusValidator.safeParse({ status }).success).toBe(
        true
      );
    }
  });

  it('rejects an unknown status', () => {
    expect(
      updateBugReportStatusValidator.safeParse({ status: 'closed' }).success
    ).toBe(false);
  });
});
