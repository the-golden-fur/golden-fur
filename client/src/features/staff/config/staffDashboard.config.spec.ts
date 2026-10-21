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

  it('shows Goals under Supervisor for a Superadmin only', () => {
    expect(supervisorTitles('Superadmin')).toContain('Goals');
    expect(supervisorTitles('Admin')).not.toContain('Goals');
  });

  it('shows Trends to a Superadmin and an Admin under Supervisor, and to a Supervisor', () => {
    expect(supervisorTitles('Superadmin')).toContain('Trends');
    expect(supervisorTitles('Admin')).toContain('Trends');

    const supervisorItems = toSidebarSections(
      STAFF_DASHBOARD_CONFIG.supervisor,
      'Supervisor'
    ).flatMap((section) => section.items.map((item) => item.title));
    expect(supervisorItems).toContain('Trends');
  });

  it('shows Vaccination Review to every role that can verify vaccinations', () => {
    for (const slug of [
      'admin',
      'supervisor',
      'receptionist',
      'veterinarian',
      'front-desk',
    ] as const) {
      const titles = STAFF_DASHBOARD_CONFIG[slug].sections.flatMap((section) =>
        section.tiles.map((tile) => tile.title)
      );
      expect(titles).toContain('Vaccination Review');
    }

    for (const slug of ['groomer', 'cashier', 'pet-assistant'] as const) {
      const titles = STAFF_DASHBOARD_CONFIG[slug].sections.flatMap((section) =>
        section.tiles.map((tile) => tile.title)
      );
      expect(titles).not.toContain('Vaccination Review');
    }
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
