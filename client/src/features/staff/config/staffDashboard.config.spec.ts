import { describe, expect, it } from 'vitest';
import {
  ROLE_TO_DASHBOARD_SLUG,
  STAFF_DASHBOARD_CONFIG,
  toSidebarSections,
} from './staffDashboard.config';

function tileTitles(slug: 'receptionist' | 'cashier' | 'front-desk') {
  return STAFF_DASHBOARD_CONFIG[slug].sections.flatMap((section) =>
    section.tiles.map((tile) => tile.title)
  );
}

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

describe('Front Desk dashboard', () => {
  it('maps to the front-desk slug', () => {
    expect(ROLE_TO_DASHBOARD_SLUG['Front Desk']).toBe('front-desk');
  });

  it('includes every Receptionist and Cashier tile, deduping Credit Review Queue', () => {
    const frontDeskTitles = tileTitles('front-desk');
    const expectedTitles = new Set([
      ...tileTitles('receptionist'),
      ...tileTitles('cashier'),
    ]);

    expect(new Set(frontDeskTitles)).toEqual(expectedTitles);
    expect(frontDeskTitles).toHaveLength(expectedTitles.size);
  });
});
