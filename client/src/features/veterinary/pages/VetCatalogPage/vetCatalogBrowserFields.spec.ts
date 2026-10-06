import { describe, expect, it } from 'vitest';
import {
  CONSULTATION_FORM_TEMPLATE_COMPARATORS,
  deriveConsultationFormTemplateSortKey,
  deriveMedicationSortKey,
  derivePrescriptionTemplateSortKey,
  matchesConsultationFormTemplateQuery,
  matchesMedicationQuery,
  matchesPrescriptionTemplateQuery,
  MEDICATION_COMPARATORS,
  MEDICATION_GROUP_AXIS,
  PRESCRIPTION_TEMPLATE_COMPARATORS,
} from './vetCatalogBrowserFields';
import type {
  ConsultationFormTemplate,
  VetMedicationCatalogItem,
  VetPrescriptionTemplate,
} from '../../veterinary.types';

function buildMedication(
  overrides: Partial<VetMedicationCatalogItem> = {}
): VetMedicationCatalogItem {
  return {
    id: 'med-1',
    veterinarian_id: 'vet-1',
    name: 'Amoxicillin',
    default_price: null,
    default_medicine_type: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildTemplate(
  overrides: Partial<ConsultationFormTemplate> = {}
): ConsultationFormTemplate {
  return {
    id: 'tmpl-1',
    veterinarian_id: 'vet-1',
    name: 'Dental Check',
    fields: [{ id: 'f1', label: 'Tartar level', type: 'text' }],
    is_default: false,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function buildPrescriptionTemplate(
  overrides: Partial<VetPrescriptionTemplate> = {}
): VetPrescriptionTemplate {
  return {
    id: 'rx-1',
    veterinarian_id: 'vet-1',
    name: 'Standard Post-Surgery Recovery',
    items: [
      {
        medication_catalog_id: 'med-1',
        name: 'Amoxicillin',
        medicine_type: 'Oral',
        dose: '1 tablet',
        frequency: 'Twice daily',
      },
    ],
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('matchesMedicationQuery', () => {
  it('matches on name', () => {
    const item = buildMedication({ name: 'Amoxicillin' });
    expect(matchesMedicationQuery(item, 'amox')).toBe(true);
    expect(matchesMedicationQuery(item, 'meloxicam')).toBe(false);
  });

  it('also matches on default medicine type', () => {
    const item = buildMedication({ default_medicine_type: 'Oral' });
    expect(matchesMedicationQuery(item, 'oral')).toBe(true);
  });
});

describe('deriveMedicationSortKey + MEDICATION_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveMedicationSortKey(null)).toBe('name-asc');
  });

  it('sorts by name', () => {
    const items = [
      buildMedication({ id: '1', name: 'Meloxicam' }),
      buildMedication({ id: '2', name: 'Amoxicillin' }),
    ];
    expect(
      [...items].sort(MEDICATION_COMPARATORS['name-asc']).map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('MEDICATION_GROUP_AXIS', () => {
  it('groups a suggested medicine type under its own column', () => {
    const item = buildMedication({ default_medicine_type: 'Oral' });
    expect(MEDICATION_GROUP_AXIS.columnFor(item)).toBe('Oral');
  });

  it('buckets an unrecognized or missing medicine type under "Other"', () => {
    expect(
      MEDICATION_GROUP_AXIS.columnFor(
        buildMedication({ default_medicine_type: 'Homeopathic' })
      )
    ).toBe('Other');
    expect(
      MEDICATION_GROUP_AXIS.columnFor(
        buildMedication({ default_medicine_type: null })
      )
    ).toBe('Other');
  });
});

describe('matchesConsultationFormTemplateQuery', () => {
  it('matches on template name or a field label', () => {
    const item = buildTemplate({
      name: 'Dental Check',
      fields: [{ id: 'f1', label: 'Tartar level', type: 'text' }],
    });
    expect(matchesConsultationFormTemplateQuery(item, 'dental')).toBe(true);
    expect(matchesConsultationFormTemplateQuery(item, 'tartar')).toBe(true);
    expect(matchesConsultationFormTemplateQuery(item, 'vaccination')).toBe(
      false
    );
  });
});

describe('deriveConsultationFormTemplateSortKey + CONSULTATION_FORM_TEMPLATE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(deriveConsultationFormTemplateSortKey(null)).toBe('name-asc');
  });

  it('sorts by name', () => {
    const items = [
      buildTemplate({ id: '1', name: 'Wellness Exam' }),
      buildTemplate({ id: '2', name: 'Dental Check' }),
    ];
    expect(
      [...items]
        .sort(CONSULTATION_FORM_TEMPLATE_COMPARATORS['name-asc'])
        .map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});

describe('matchesPrescriptionTemplateQuery', () => {
  it('matches on template name or a medication line name', () => {
    const item = buildPrescriptionTemplate({
      name: 'Standard Post-Surgery Recovery',
      items: [
        {
          medication_catalog_id: 'med-1',
          name: 'Amoxicillin',
          medicine_type: 'Oral',
          dose: '1 tablet',
          frequency: 'Twice daily',
        },
      ],
    });
    expect(matchesPrescriptionTemplateQuery(item, 'post-surgery')).toBe(true);
    expect(matchesPrescriptionTemplateQuery(item, 'amoxicillin')).toBe(true);
    expect(matchesPrescriptionTemplateQuery(item, 'meloxicam')).toBe(false);
  });
});

describe('derivePrescriptionTemplateSortKey + PRESCRIPTION_TEMPLATE_COMPARATORS', () => {
  it('defaults to name-asc', () => {
    expect(derivePrescriptionTemplateSortKey(null)).toBe('name-asc');
  });

  it('sorts by name', () => {
    const items = [
      buildPrescriptionTemplate({ id: '1', name: 'Wellness Recovery' }),
      buildPrescriptionTemplate({ id: '2', name: 'Dental Recovery' }),
    ];
    expect(
      [...items]
        .sort(PRESCRIPTION_TEMPLATE_COMPARATORS['name-asc'])
        .map((i) => i.id)
    ).toEqual(['2', '1']);
  });
});
