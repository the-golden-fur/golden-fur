import { describe, expect, it } from 'vitest';
import {
  STAFF_DASHBOARD_CONFIG,
  toSidebarSections,
} from './staffDashboard.config';

function supervisorTitles(role: 'Superadmin' | 'Admin') {
  const sections = toSidebarSections(STAFF_DASHBOARD_CONFIG.admin, role);
  return (
    sections
      .find((section) => section.label === 'Supervisor')
      ?.items.map((item) => item.title) ?? []
  );
}

describe('toSidebarSections', () => {
  it('shows Branch Comparison under Supervisor for a Superadmin', () => {
    expect(supervisorTitles('Superadmin')).toContain('Branch Comparison');
  });

  it('hides the Superadmin-only Branch Comparison tile from an Admin', () => {
    const titles = supervisorTitles('Admin');
    expect(titles).not.toContain('Branch Comparison');
    expect(titles).toContain('Branch Reports');
  });
});
