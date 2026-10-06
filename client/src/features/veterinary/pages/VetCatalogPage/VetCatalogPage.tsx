import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import {
  Columns3,
  Image as GalleryIcon,
  List as ListIcon,
  Table as TableIcon,
} from 'lucide-react';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import { DataList } from '../../../../shared/components/DataList/DataList';
import {
  DataTable,
  type DataTableColumn,
} from '../../../../shared/components/DataTable/DataTable';
import { DataBoard } from '../../../../shared/components/DataBoard/DataBoard';
import {
  ViewSwitcher,
  type ViewSwitcherOption,
} from '../../../../shared/components/ViewSwitcher/ViewSwitcher';
import { useGroupBy } from '../../../../shared/hooks/useGroupBy/useGroupBy';
import { FilterSortBar } from '../../../../shared/components/FilterSortBar/FilterSortBar';
import type { SortTile } from '../../../../shared/components/FilterSortBar/filterField.types';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { CardContextMenu } from '../../../../shared/components/MoreOptionsMenu/CardContextMenu';
import {
  MoreOptionsMenu,
  type MoreOptionsMenuItem,
} from '../../../../shared/components/MoreOptionsMenu/MoreOptionsMenu';
import { IconPicker } from '../../../../shared/components/IconPicker/IconPicker';
import { getServiceIcon } from '../../../../shared/components/IconPicker/serviceIcons';
import { ImageUploader } from '../../../../shared/components/ImageUploader/ImageUploader';
import {
  createConsultationFormTemplate,
  createMedicationCatalogItem,
  createPrescriptionTemplate,
  deleteConsultationFormTemplate,
  deleteMedicationCatalogItem,
  deletePrescriptionTemplate,
  listConsultationFormTemplates,
  listMedicationCatalog,
  listPrescriptionTemplates,
  updateConsultationFormTemplate,
  updateMedicationCatalogItem,
  updatePrescriptionTemplate,
  uploadMedicationImage,
} from '../../api/veterinary.api';
import {
  FREQUENCY_OPTIONS,
  MEDICINE_TYPE_OPTIONS,
  type ConsultationFormField,
  type ConsultationFormTemplate,
  type VetMedicationCatalogItem,
  type VetPrescriptionTemplate,
  type VetPrescriptionTemplateItem,
} from '../../veterinary.types';
import {
  CONSULTATION_FORM_TEMPLATE_COMPARATORS,
  CONSULTATION_FORM_TEMPLATE_SORT_FIELDS,
  deriveConsultationFormTemplateSortKey,
  deriveMedicationSortKey,
  derivePrescriptionTemplateSortKey,
  matchesConsultationFormTemplateQuery,
  matchesMedicationQuery,
  matchesPrescriptionTemplateQuery,
  MEDICATION_COMPARATORS,
  MEDICATION_GROUP_AXIS,
  MEDICATION_SORT_FIELDS,
  PRESCRIPTION_TEMPLATE_COMPARATORS,
  PRESCRIPTION_TEMPLATE_SORT_FIELDS,
} from './vetCatalogBrowserFields';
import { VetServiceCatalogTab } from './VetServiceCatalogTab';
import styles from './VetCatalogPage.module.css';
import { LoadingState } from '../../../../shared/components/LoadingState/LoadingState';

/** Personal catalog - unlike the rest of this feature (any Veterinarian may
 * view/edit any consultation), only the owning Veterinarian can see or edit
 * their own catalog (server-enforced, see vetCatalog.service.ts /
 * consultationFormTemplate.service.ts / vetPrescriptionTemplate.service.ts). */
const ALLOWED_VIEWER_ROLES = new Set(['Veterinarian']);

/** Custom change: "My Catalog" broken into Medications (product
 * definitions) / Prescriptions (reusable multi-medication templates) /
 * Forms (renamed from "Consultation Forms"). */
type CatalogTab = 'medications' | 'prescriptions' | 'forms' | 'services';

// Shared across all three tabs - Table/List/Board, same convention as every
// other staff queue/catalog page.
type CatalogView = 'table' | 'list' | 'board';
const CATALOG_VIEW_OPTIONS: ViewSwitcherOption<CatalogView>[] = [
  { value: 'table', label: 'Table', icon: TableIcon },
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'board', label: 'Board', icon: Columns3 },
];

// Medications-only: Board stays the same compact card every other tab uses
// (small icon inline, no image) - Gallery is the one extra view where an
// uploaded image fills the card as a background (custom change: "only make
// the image as background for GALLERY view, not board").
type MedicationView = CatalogView | 'gallery';
const MEDICATION_VIEW_OPTIONS: ViewSwitcherOption<MedicationView>[] = [
  ...CATALOG_VIEW_OPTIONS,
  { value: 'gallery', label: 'Gallery', icon: GalleryIcon },
];

interface MedicationFormState {
  name: string;
  price: string;
  medicineType: string;
  icon: string | null;
  imageUrl: string | null;
}

const EMPTY_MEDICATION_FORM: MedicationFormState = {
  name: '',
  price: '',
  medicineType: '',
  icon: null,
  imageUrl: null,
};

/** #117: one row of a consultation-form template being built/edited.
 * `optionsText` is the raw comma-separated input for a 'select' field -
 * parsed into ConsultationFormField['options'] only on submit. */
interface TemplateFieldFormState {
  id: string;
  label: string;
  type: ConsultationFormField['type'];
  optionsText: string;
  required: boolean;
}

interface TemplateFormState {
  name: string;
  fields: TemplateFieldFormState[];
  isDefault: boolean;
  icon: string | null;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: '',
  fields: [],
  isDefault: false,
  icon: null,
};

const FIELD_TYPE_OPTIONS: Array<{
  value: ConsultationFormField['type'];
  label: string;
}> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'prescription', label: 'Prescription' },
];

/** Custom change: one line of a prescription template being built/edited -
 * a chosen medication (by catalog id) plus the dose/frequency/duration to
 * apply it with. */
interface PrescriptionItemFormState {
  key: string;
  medicationCatalogId: string;
  dose: string;
  frequency: string;
  duration: string;
}

interface PrescriptionFormState {
  name: string;
  items: PrescriptionItemFormState[];
}

const EMPTY_PRESCRIPTION_FORM: PrescriptionFormState = { name: '', items: [] };

export function VetCatalogPage() {
  const { user, accessToken } = useAuth();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );

  const [activeTab, setActiveTab] = useState<CatalogTab>('medications');

  const [medications, setMedications] = useState<VetMedicationCatalogItem[]>(
    []
  );
  const [prescriptionTemplates, setPrescriptionTemplates] = useState<
    VetPrescriptionTemplate[]
  >([]);
  const [templates, setTemplates] = useState<ConsultationFormTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [medicationSearch, setMedicationSearch] = useState('');
  const [medicationSortTile, setMedicationSortTile] = useState<SortTile | null>(
    { fieldId: 'name', direction: 'asc' }
  );
  const [medicationView, setMedicationView] = useState<MedicationView>('list');

  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const [prescriptionSortTile, setPrescriptionSortTile] =
    useState<SortTile | null>({ fieldId: 'name', direction: 'asc' });
  const [prescriptionView, setPrescriptionView] = useState<CatalogView>('list');

  const [templateSearch, setTemplateSearch] = useState('');
  const [templateSortTile, setTemplateSortTile] = useState<SortTile | null>({
    fieldId: 'name',
    direction: 'asc',
  });
  const [templateView, setTemplateView] = useState<CatalogView>('list');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formKind, setFormKind] = useState<CatalogTab | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [medicationForm, setMedicationForm] = useState<MedicationFormState>(
    EMPTY_MEDICATION_FORM
  );
  const [prescriptionForm, setPrescriptionForm] =
    useState<PrescriptionFormState>(EMPTY_PRESCRIPTION_FORM);
  const [templateForm, setTemplateForm] =
    useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      setRoleStatus(
        result.data && ALLOWED_VIEWER_ROLES.has(result.data.role)
          ? 'ok'
          : 'denied'
      );
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (roleStatus !== 'ok' || !accessToken) return;

    const token = accessToken;
    let isMounted = true;

    void Promise.all([
      listMedicationCatalog(token),
      listPrescriptionTemplates(token),
      listConsultationFormTemplates(token),
    ]).then(([medResult, prescriptionResult, templateResult]) => {
      if (!isMounted) return;

      setIsLoading(false);

      if (medResult.error || !medResult.data) {
        setLoadError(medResult.error ?? 'Could not load your catalog.');
        return;
      }
      if (prescriptionResult.error || !prescriptionResult.data) {
        setLoadError(
          prescriptionResult.error ?? 'Could not load your catalog.'
        );
        return;
      }
      if (templateResult.error || !templateResult.data) {
        setLoadError(templateResult.error ?? 'Could not load your catalog.');
        return;
      }

      setMedications(medResult.data);
      setPrescriptionTemplates(prescriptionResult.data);
      setTemplates(templateResult.data);
    });

    return () => {
      isMounted = false;
    };
  }, [roleStatus, accessToken]);

  const visibleMedications = useMemo(() => {
    const query = medicationSearch.trim().toLowerCase();
    const searched = query
      ? medications.filter((item) => matchesMedicationQuery(item, query))
      : medications;

    if (!medicationSortTile) return searched;
    return [...searched].sort(
      MEDICATION_COMPARATORS[deriveMedicationSortKey(medicationSortTile)]
    );
  }, [medications, medicationSearch, medicationSortTile]);

  const groupedMedications = useGroupBy(
    visibleMedications,
    medicationView === 'board' || medicationView === 'gallery'
      ? MEDICATION_GROUP_AXIS
      : null
  );

  const visiblePrescriptionTemplates = useMemo(() => {
    const query = prescriptionSearch.trim().toLowerCase();
    const searched = query
      ? prescriptionTemplates.filter((item) =>
          matchesPrescriptionTemplateQuery(item, query)
        )
      : prescriptionTemplates;

    if (!prescriptionSortTile) return searched;
    return [...searched].sort(
      PRESCRIPTION_TEMPLATE_COMPARATORS[
        derivePrescriptionTemplateSortKey(prescriptionSortTile)
      ]
    );
  }, [prescriptionTemplates, prescriptionSearch, prescriptionSortTile]);

  // No natural category to group prescriptions by (unlike medications' own
  // medicine type) - null keeps Board a single "All" column, same pattern
  // useGroupBy's own header note describes for a fixed/no-axis board.
  const groupedPrescriptionTemplates = useGroupBy(
    visiblePrescriptionTemplates,
    null
  );

  const visibleTemplates = useMemo(() => {
    const query = templateSearch.trim().toLowerCase();
    const searched = query
      ? templates.filter((item) =>
          matchesConsultationFormTemplateQuery(item, query)
        )
      : templates;

    if (!templateSortTile) return searched;
    return [...searched].sort(
      CONSULTATION_FORM_TEMPLATE_COMPARATORS[
        deriveConsultationFormTemplateSortKey(templateSortTile)
      ]
    );
  }, [templates, templateSearch, templateSortTile]);

  // No natural category to group forms by - same "single All column" board
  // as prescriptions above.
  const groupedTemplates = useGroupBy(visibleTemplates, null);

  function openCreateMedication() {
    setFormKind('medications');
    setEditingId(null);
    setMedicationForm(EMPTY_MEDICATION_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditMedication(item: VetMedicationCatalogItem) {
    setFormKind('medications');
    setEditingId(item.id);
    setMedicationForm({
      name: item.name,
      price: item.default_price?.toString() ?? '',
      medicineType: item.default_medicine_type ?? '',
      icon: item.icon,
      imageUrl: item.image_url,
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function openCreatePrescription() {
    setFormKind('prescriptions');
    setEditingId(null);
    setPrescriptionForm(EMPTY_PRESCRIPTION_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditPrescription(item: VetPrescriptionTemplate) {
    setFormKind('prescriptions');
    setEditingId(item.id);
    setPrescriptionForm({
      name: item.name,
      items: item.items.map((line) => ({
        key: crypto.randomUUID(),
        medicationCatalogId: line.medication_catalog_id ?? '',
        dose: line.dose,
        frequency: line.frequency,
        duration: line.duration ?? '',
      })),
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function openCreateTemplate() {
    setFormKind('forms');
    setEditingId(null);
    setTemplateForm(EMPTY_TEMPLATE_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditTemplate(item: ConsultationFormTemplate) {
    setFormKind('forms');
    setEditingId(item.id);
    setTemplateForm({
      name: item.name,
      fields: item.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        optionsText: (field.options ?? []).join(', '),
        required: field.required ?? false,
      })),
      isDefault: item.is_default,
      icon: item.icon,
    });
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setFormKind(null);
    setEditingId(null);
    setFormError(null);
  }

  function addTemplateField() {
    setTemplateForm((prev) => ({
      ...prev,
      fields: [
        ...prev.fields,
        {
          id: crypto.randomUUID(),
          label: '',
          type: 'text',
          optionsText: '',
          required: false,
        },
      ],
    }));
  }

  function updateTemplateField(
    index: number,
    patch: Partial<TemplateFieldFormState>
  ) {
    setTemplateForm((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) =>
        i === index ? { ...field, ...patch } : field
      ),
    }));
  }

  function removeTemplateField(index: number) {
    setTemplateForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  }

  function addPrescriptionItem() {
    setPrescriptionForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          key: crypto.randomUUID(),
          medicationCatalogId: '',
          dose: '',
          frequency: '',
          duration: '',
        },
      ],
    }));
  }

  function updatePrescriptionItem(
    index: number,
    patch: Partial<PrescriptionItemFormState>
  ) {
    setPrescriptionForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }));
  }

  function removePrescriptionItem(index: number) {
    setPrescriptionForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  }

  async function handleDeleteMedication(itemId: string) {
    if (!accessToken) return;

    const result = await deleteMedicationCatalogItem(itemId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setMedications((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Medication deleted.');
  }

  async function handleDeletePrescriptionTemplate(itemId: string) {
    if (!accessToken) return;

    const result = await deletePrescriptionTemplate(itemId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setPrescriptionTemplates((prev) =>
      prev.filter((item) => item.id !== itemId)
    );
    setMessage('Prescription deleted.');
  }

  async function handleDeleteTemplate(itemId: string) {
    if (!accessToken) return;

    const result = await deleteConsultationFormTemplate(itemId, accessToken);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    setTemplates((prev) => prev.filter((item) => item.id !== itemId));
    setMessage('Consultation form template deleted.');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) return;

    if (formKind === 'medications') {
      if (!medicationForm.name.trim()) {
        setFormError('Name is required.');
        return;
      }

      setIsSubmitting(true);
      setFormError(null);

      const result =
        editingId === null
          ? await createMedicationCatalogItem(accessToken, {
              name: medicationForm.name.trim(),
              default_price: medicationForm.price
                ? Number(medicationForm.price)
                : undefined,
              default_medicine_type:
                medicationForm.medicineType.trim() || undefined,
              icon: medicationForm.icon,
              image_url: medicationForm.imageUrl,
            })
          : await updateMedicationCatalogItem(editingId, accessToken, {
              name: medicationForm.name.trim(),
              default_price: medicationForm.price
                ? Number(medicationForm.price)
                : null,
              default_medicine_type: medicationForm.medicineType.trim() || null,
              icon: medicationForm.icon,
              image_url: medicationForm.imageUrl,
            });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not save medication.');
        return;
      }

      const saved = result.data;
      setMedications((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((item) => (item.id === editingId ? saved : item))
      );
      setMessage(
        editingId === null ? 'Medication added.' : 'Medication updated.'
      );
      closeForm();
      return;
    }

    if (formKind === 'prescriptions') {
      if (!prescriptionForm.name.trim()) {
        setFormError('Name is required.');
        return;
      }
      if (prescriptionForm.items.length === 0) {
        setFormError('Add at least one medication.');
        return;
      }
      for (const item of prescriptionForm.items) {
        if (!item.medicationCatalogId) {
          setFormError('Every line needs a medication.');
          return;
        }
        if (!item.dose.trim() || !item.frequency.trim()) {
          setFormError('Every line needs a dose and a frequency.');
          return;
        }
      }

      setIsSubmitting(true);
      setFormError(null);

      const items: VetPrescriptionTemplateItem[] = prescriptionForm.items.map(
        (item) => {
          const medication = medications.find(
            (entry) => entry.id === item.medicationCatalogId
          );
          return {
            medication_catalog_id: item.medicationCatalogId,
            name: medication?.name ?? '',
            medicine_type: medication?.default_medicine_type ?? null,
            dose: item.dose.trim(),
            frequency: item.frequency.trim(),
            duration: item.duration.trim() || undefined,
          };
        }
      );

      const result =
        editingId === null
          ? await createPrescriptionTemplate(accessToken, {
              name: prescriptionForm.name.trim(),
              items,
            })
          : await updatePrescriptionTemplate(editingId, accessToken, {
              name: prescriptionForm.name.trim(),
              items,
            });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(result.error ?? 'Could not save prescription.');
        return;
      }

      const saved = result.data;
      setPrescriptionTemplates((prev) =>
        editingId === null
          ? [...prev, saved]
          : prev.map((item) => (item.id === editingId ? saved : item))
      );
      setMessage(
        editingId === null ? 'Prescription added.' : 'Prescription updated.'
      );
      closeForm();
      return;
    }

    if (formKind === 'forms') {
      if (!templateForm.name.trim()) {
        setFormError('Name is required.');
        return;
      }
      if (templateForm.fields.length === 0) {
        setFormError('Add at least one field.');
        return;
      }
      for (const field of templateForm.fields) {
        if (!field.label.trim()) {
          setFormError('Every field needs a label.');
          return;
        }
        if (field.type === 'select' && !field.optionsText.trim()) {
          setFormError('A dropdown field needs at least one option.');
          return;
        }
      }

      setIsSubmitting(true);
      setFormError(null);

      const fields: ConsultationFormField[] = templateForm.fields.map(
        (field) => ({
          id: field.id,
          label: field.label.trim(),
          type: field.type,
          ...(field.type === 'select'
            ? {
                options: field.optionsText
                  .split(',')
                  .map((option) => option.trim())
                  .filter(Boolean),
              }
            : {}),
          ...(field.required ? { required: true } : {}),
        })
      );

      const result =
        editingId === null
          ? await createConsultationFormTemplate(accessToken, {
              name: templateForm.name.trim(),
              fields,
              is_default: templateForm.isDefault,
              icon: templateForm.icon,
            })
          : await updateConsultationFormTemplate(editingId, accessToken, {
              name: templateForm.name.trim(),
              fields,
              is_default: templateForm.isDefault,
              icon: templateForm.icon,
            });

      setIsSubmitting(false);

      if (result.error || !result.data) {
        setFormError(
          result.error ?? 'Could not save consultation form template.'
        );
        return;
      }

      const saved = result.data;
      setTemplates((prev) => {
        // Setting a new default locally clears any other row's is_default
        // too, matching what the server just did (consultationFormTemplate
        // .service.ts's clearOtherDefaults) - keeps the "Default" badge
        // correct without a full refetch.
        const next = editingId === null ? [...prev, saved] : prev;
        return next.map((item) => {
          if (item.id === saved.id) return saved;
          return saved.is_default ? { ...item, is_default: false } : item;
        });
      });
      setMessage(
        editingId === null
          ? 'Consultation form template added.'
          : 'Consultation form template updated.'
      );
      closeForm();
    }
  }

  function buildMedicationActionItems(
    item: VetMedicationCatalogItem
  ): MoreOptionsMenuItem[] {
    return [
      { label: 'Edit', onSelect: () => openEditMedication(item) },
      {
        label: 'Delete',
        onSelect: () => void handleDeleteMedication(item.id),
      },
    ];
  }

  function buildPrescriptionActionItems(
    item: VetPrescriptionTemplate
  ): MoreOptionsMenuItem[] {
    return [
      { label: 'Edit', onSelect: () => openEditPrescription(item) },
      {
        label: 'Delete',
        onSelect: () => void handleDeletePrescriptionTemplate(item.id),
      },
    ];
  }

  function buildTemplateActionItems(
    item: ConsultationFormTemplate
  ): MoreOptionsMenuItem[] {
    return [
      { label: 'Edit', onSelect: () => openEditTemplate(item) },
      { label: 'Delete', onSelect: () => void handleDeleteTemplate(item.id) },
    ];
  }

  const prescriptionColumns: DataTableColumn<VetPrescriptionTemplate>[] = [
    { id: 'name', header: 'Name', render: (item) => item.name },
    {
      id: 'medications',
      header: 'Medications',
      render: (item) => item.items.length,
      align: 'end',
    },
  ];

  function renderPrescriptionCardContent(item: VetPrescriptionTemplate) {
    return (
      <div className={styles.itemMain}>
        <span className={styles.itemName}>{item.name}</span>
        <span className={styles.badge}>
          {item.items.length}{' '}
          {item.items.length === 1 ? 'medication' : 'medications'}
        </span>
      </div>
    );
  }

  function renderPrescriptionListCard(item: VetPrescriptionTemplate) {
    return (
      <div className={styles.rowContent}>
        {renderPrescriptionCardContent(item)}
        <MoreOptionsMenu
          label={`Actions for ${item.name}`}
          items={buildPrescriptionActionItems(item)}
        />
      </div>
    );
  }

  function renderPrescriptionBoardCard(item: VetPrescriptionTemplate) {
    return (
      <CardContextMenu
        label={`Actions for ${item.name}`}
        items={buildPrescriptionActionItems(item)}
      >
        <div className={styles.rowContent}>
          {renderPrescriptionCardContent(item)}
        </div>
      </CardContextMenu>
    );
  }

  const templateColumns: DataTableColumn<ConsultationFormTemplate>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (item) => {
        const Icon = getServiceIcon(item.icon);
        return (
          <span className={styles.itemMain}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span>{item.name}</span>
          </span>
        );
      },
    },
    {
      id: 'default',
      header: 'Default',
      render: (item) => (item.is_default ? 'Default' : '—'),
    },
    {
      id: 'fields',
      header: 'Fields',
      render: (item) => item.fields.length,
      align: 'end',
    },
  ];

  function renderTemplateCardContent(item: ConsultationFormTemplate) {
    const Icon = getServiceIcon(item.icon);
    return (
      <div className={styles.itemMain}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span className={styles.itemName}>{item.name}</span>
        {item.is_default ? <span className={styles.badge}>Default</span> : null}
        <span className={styles.badge}>
          {item.fields.length} {item.fields.length === 1 ? 'field' : 'fields'}
        </span>
      </div>
    );
  }

  function renderTemplateListCard(item: ConsultationFormTemplate) {
    return (
      <div className={styles.rowContent}>
        {renderTemplateCardContent(item)}
        <MoreOptionsMenu
          label={`Actions for ${item.name}`}
          items={buildTemplateActionItems(item)}
        />
      </div>
    );
  }

  function renderTemplateBoardCard(item: ConsultationFormTemplate) {
    return (
      <CardContextMenu
        label={`Actions for ${item.name}`}
        items={buildTemplateActionItems(item)}
      >
        <div className={styles.rowContent}>
          {renderTemplateCardContent(item)}
        </div>
      </CardContextMenu>
    );
  }

  const medicationColumns: DataTableColumn<VetMedicationCatalogItem>[] = [
    {
      id: 'name',
      header: 'Name',
      render: (item) => {
        const Icon = getServiceIcon(item.icon);
        return (
          <span className={styles.itemMain}>
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            <span>{item.name}</span>
          </span>
        );
      },
    },
    {
      id: 'type',
      header: 'Type',
      render: (item) => item.default_medicine_type || '—',
    },
    {
      id: 'price',
      header: 'Price',
      render: (item) =>
        item.default_price != null ? `₱${item.default_price}` : '—',
      align: 'end',
    },
  ];

  function renderMedicationCardContent(item: VetMedicationCatalogItem) {
    const Icon = getServiceIcon(item.icon);
    return (
      <div className={styles.itemMain}>
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span className={styles.itemName}>{item.name}</span>
        {item.default_medicine_type ? (
          <span className={styles.badge}>{item.default_medicine_type}</span>
        ) : null}
        {item.default_price != null ? (
          <span className={styles.badge}>₱{item.default_price}</span>
        ) : null}
      </div>
    );
  }

  /** List view: visible "..." button, same as Table's row-actions column -
   * only Board (a crowded card grid) uses hold/right-click instead. */
  function renderMedicationListCard(item: VetMedicationCatalogItem) {
    return (
      <div className={styles.rowContent}>
        {renderMedicationCardContent(item)}
        <MoreOptionsMenu
          label={`Actions for ${item.name}`}
          items={buildMedicationActionItems(item)}
        />
      </div>
    );
  }

  /** Board card: same compact row every other Board/List uses (small icon
   * inline, no background image) - the image-as-background treatment is
   * Gallery-only (custom change: "only make the image as background for
   * GALLERY view, not board"). */
  function renderMedicationBoardCard(item: VetMedicationCatalogItem) {
    return (
      <CardContextMenu
        label={`Actions for ${item.name}`}
        items={buildMedicationActionItems(item)}
      >
        <div className={styles.rowContent}>
          {renderMedicationCardContent(item)}
        </div>
      </CardContextMenu>
    );
  }

  /** Gallery card: the uploaded image fills the whole card as its
   * background, name/badges sitting in a scrim overlay at the bottom so
   * they stay readable over any photo. A medication with no image (icon
   * only, or neither) renders the exact same compact row Table/List/Board
   * use instead of a big card - an icon alone doesn't earn the large
   * treatment, only an actual photo does. */
  function renderMedicationGalleryCard(item: VetMedicationCatalogItem) {
    if (!item.image_url) {
      return (
        <CardContextMenu
          label={`Actions for ${item.name}`}
          items={buildMedicationActionItems(item)}
        >
          <div className={styles.rowContent}>
            {renderMedicationCardContent(item)}
          </div>
        </CardContextMenu>
      );
    }

    return (
      <CardContextMenu
        label={`Actions for ${item.name}`}
        items={buildMedicationActionItems(item)}
      >
        <div
          className={styles.galleryCard}
          style={{ backgroundImage: `url(${item.image_url})` }}
        >
          <div className={styles.galleryCardOverlay}>
            <span className={styles.itemName}>{item.name}</span>
            {item.default_medicine_type ? (
              <span className={styles.badge}>{item.default_medicine_type}</span>
            ) : null}
            {item.default_price != null ? (
              <span className={styles.badge}>₱{item.default_price}</span>
            ) : null}
          </div>
        </div>
      </CardContextMenu>
    );
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load your catalog.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <LoadingState />
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>My Catalog</h1>
        <p className={styles.copy}>
          Save the medications you carry, build reusable prescriptions from
          them, and build reusable consultation form templates - then pick them
          from a dropdown on the consultation form instead of retyping them
          every visit. Medications and Services are lists shared by every
          veterinarian: a medication's price is what the pharmacy charges for
          it, and a service's price is suggested when you list what was done at
          a visit. Your prescriptions and forms stay your own.
        </p>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'medications'}
            className={
              activeTab === 'medications' ? styles.tabActive : styles.tab
            }
            onClick={() => setActiveTab('medications')}
          >
            Medications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'prescriptions'}
            className={
              activeTab === 'prescriptions' ? styles.tabActive : styles.tab
            }
            onClick={() => setActiveTab('prescriptions')}
          >
            Prescriptions
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'forms'}
            className={activeTab === 'forms' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('forms')}
          >
            Forms
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'services'}
            className={activeTab === 'services' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('services')}
          >
            Services
          </button>
        </div>

        {message ? (
          <p className={styles.successBanner} role="status">
            {message}
          </p>
        ) : null}

        {activeTab === 'services' ? (
          // Vet-priced visits: the shared service list loads and manages its
          // own data (VetServiceCatalogTab), independent of the three
          // catalogs this page fetches above.
          <VetServiceCatalogTab accessToken={accessToken} />
        ) : isLoading ? (
          <LoadingState label="Loading your catalog..." />
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : activeTab === 'medications' ? (
          <>
            <div className={styles.toolbar}>
              <FilterSortBar
                filterFields={[]}
                filterTiles={[]}
                onAddFilter={() => {}}
                onChangeFilter={() => {}}
                onRemoveFilter={() => {}}
                sortFields={MEDICATION_SORT_FIELDS}
                sortTile={medicationSortTile}
                onChangeSort={setMedicationSortTile}
                searchValue={medicationSearch}
                onSearchChange={setMedicationSearch}
                searchPlaceholder="Search medications..."
              >
                <ViewSwitcher
                  options={MEDICATION_VIEW_OPTIONS}
                  value={medicationView}
                  onChange={setMedicationView}
                  ariaLabel="Medications view"
                />
              </FilterSortBar>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateMedication}
              >
                Add medication
              </button>
            </div>

            {medicationView === 'table' ? (
              <DataTable
                columns={medicationColumns}
                rows={visibleMedications}
                getRowKey={(item) => item.id}
                renderRowActions={(item) => (
                  <MoreOptionsMenu
                    label={`Actions for ${item.name}`}
                    items={buildMedicationActionItems(item)}
                  />
                )}
                emptyMessage="No medications match these filters."
              />
            ) : medicationView === 'list' ? (
              <DataList
                items={visibleMedications}
                getRowKey={(item) => item.id}
                emptyMessage="No medications match these filters."
                renderItem={renderMedicationListCard}
              />
            ) : medicationView === 'board' ? (
              <DataBoard
                groups={groupedMedications}
                getRowKey={(item) => item.id}
                renderCard={renderMedicationBoardCard}
                emptyColumnMessage="No medications here."
              />
            ) : (
              <DataBoard
                groups={groupedMedications}
                getRowKey={(item) => item.id}
                renderCard={renderMedicationGalleryCard}
                emptyColumnMessage="No medications here."
              />
            )}
          </>
        ) : activeTab === 'prescriptions' ? (
          <>
            <div className={styles.toolbar}>
              <FilterSortBar
                filterFields={[]}
                filterTiles={[]}
                onAddFilter={() => {}}
                onChangeFilter={() => {}}
                onRemoveFilter={() => {}}
                sortFields={PRESCRIPTION_TEMPLATE_SORT_FIELDS}
                sortTile={prescriptionSortTile}
                onChangeSort={setPrescriptionSortTile}
                searchValue={prescriptionSearch}
                onSearchChange={setPrescriptionSearch}
                searchPlaceholder="Search prescriptions..."
              >
                <ViewSwitcher
                  options={CATALOG_VIEW_OPTIONS}
                  value={prescriptionView}
                  onChange={setPrescriptionView}
                  ariaLabel="Prescriptions view"
                />
              </FilterSortBar>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreatePrescription}
              >
                Add prescription
              </button>
            </div>

            {prescriptionView === 'table' ? (
              <DataTable
                columns={prescriptionColumns}
                rows={visiblePrescriptionTemplates}
                getRowKey={(item) => item.id}
                renderRowActions={(item) => (
                  <MoreOptionsMenu
                    label={`Actions for ${item.name}`}
                    items={buildPrescriptionActionItems(item)}
                  />
                )}
                emptyMessage="No prescriptions match these filters."
              />
            ) : prescriptionView === 'list' ? (
              <DataList
                items={visiblePrescriptionTemplates}
                getRowKey={(item) => item.id}
                emptyMessage="No prescriptions match these filters."
                renderItem={renderPrescriptionListCard}
              />
            ) : (
              <DataBoard
                groups={groupedPrescriptionTemplates}
                getRowKey={(item) => item.id}
                renderCard={renderPrescriptionBoardCard}
                emptyColumnMessage="No prescriptions here."
              />
            )}
          </>
        ) : (
          <>
            <div className={styles.toolbar}>
              <FilterSortBar
                filterFields={[]}
                filterTiles={[]}
                onAddFilter={() => {}}
                onChangeFilter={() => {}}
                onRemoveFilter={() => {}}
                sortFields={CONSULTATION_FORM_TEMPLATE_SORT_FIELDS}
                sortTile={templateSortTile}
                onChangeSort={setTemplateSortTile}
                searchValue={templateSearch}
                onSearchChange={setTemplateSearch}
                searchPlaceholder="Search forms..."
              >
                <ViewSwitcher
                  options={CATALOG_VIEW_OPTIONS}
                  value={templateView}
                  onChange={setTemplateView}
                  ariaLabel="Forms view"
                />
              </FilterSortBar>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={openCreateTemplate}
              >
                Add form template
              </button>
            </div>

            {templateView === 'table' ? (
              <DataTable
                columns={templateColumns}
                rows={visibleTemplates}
                getRowKey={(item) => item.id}
                renderRowActions={(item) => (
                  <MoreOptionsMenu
                    label={`Actions for ${item.name}`}
                    items={buildTemplateActionItems(item)}
                  />
                )}
                emptyMessage="No forms match these filters."
              />
            ) : templateView === 'list' ? (
              <DataList
                items={visibleTemplates}
                getRowKey={(item) => item.id}
                emptyMessage="No forms match these filters."
                renderItem={renderTemplateListCard}
              />
            ) : (
              <DataBoard
                groups={groupedTemplates}
                getRowKey={(item) => item.id}
                renderCard={renderTemplateBoardCard}
                emptyColumnMessage="No forms here."
              />
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isFormOpen}
        title={
          formKind === 'medications'
            ? editingId === null
              ? 'Add medication'
              : 'Edit medication'
            : formKind === 'prescriptions'
              ? editingId === null
                ? 'Add prescription'
                : 'Edit prescription'
              : editingId === null
                ? 'Add form template'
                : 'Edit form template'
        }
        onClose={closeForm}
        closeOnBackdropClick={false}
      >
        {isFormOpen && formKind === 'medications' ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={medicationForm.name}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <input
                className={styles.input}
                list="medicine-type-options"
                value={medicationForm.medicineType}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    medicineType: event.target.value,
                  }))
                }
              />
              <datalist id="medicine-type-options">
                {MEDICINE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Price (₱)</span>
              <input
                className={styles.input}
                type="number"
                value={medicationForm.price}
                onChange={(event) =>
                  setMedicationForm((prev) => ({
                    ...prev,
                    price: event.target.value,
                  }))
                }
              />
            </label>

            <IconPicker
              label="Icon"
              value={medicationForm.icon}
              onChange={(icon) =>
                setMedicationForm((prev) => ({ ...prev, icon }))
              }
            />

            <ImageUploader
              currentImageUrl={medicationForm.imageUrl}
              uploadFn={(file) =>
                accessToken
                  ? uploadMedicationImage(accessToken, file)
                  : Promise.resolve({ data: null, error: 'Not signed in.' })
              }
              onUploaded={(imageUrl) =>
                setMedicationForm((prev) => ({ ...prev, imageUrl }))
              }
              onRemove={() =>
                setMedicationForm((prev) => ({ ...prev, imageUrl: null }))
              }
              alt="Medication image"
            />

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save medication'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {isFormOpen && formKind === 'prescriptions' ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={prescriptionForm.name}
                onChange={(event) =>
                  setPrescriptionForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>

            <div className={styles.templateFieldsList}>
              <span className={styles.fieldLabel}>Medications</span>
              {prescriptionForm.items.map((item, index) => (
                <div key={item.key} className={styles.templateFieldRow}>
                  <select
                    className={styles.input}
                    value={item.medicationCatalogId}
                    onChange={(event) =>
                      updatePrescriptionItem(index, {
                        medicationCatalogId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose a medication...</option>
                    {medications.map((medication) => (
                      <option key={medication.id} value={medication.id}>
                        {medication.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    placeholder="Dose"
                    value={item.dose}
                    onChange={(event) =>
                      updatePrescriptionItem(index, {
                        dose: event.target.value,
                      })
                    }
                  />
                  <input
                    className={styles.input}
                    list="frequency-options"
                    placeholder="Frequency"
                    value={item.frequency}
                    onChange={(event) =>
                      updatePrescriptionItem(index, {
                        frequency: event.target.value,
                      })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Duration"
                    value={item.duration}
                    onChange={(event) =>
                      updatePrescriptionItem(index, {
                        duration: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removePrescriptionItem(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <datalist id="frequency-options">
                {FREQUENCY_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {medications.length === 0 ? (
                <p className={styles.copy}>
                  Add a medication on the Medications tab first.
                </p>
              ) : (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={addPrescriptionItem}
                >
                  Add medication
                </button>
              )}
            </div>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save prescription'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {isFormOpen && formKind === 'forms' ? (
          <form
            className={styles.form}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={templateForm.name}
                onChange={(event) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={templateForm.isDefault}
                onChange={(event) =>
                  setTemplateForm((prev) => ({
                    ...prev,
                    isDefault: event.target.checked,
                  }))
                }
              />
              Set as default - offered automatically the first time a new
              consultation is opened
            </label>

            <IconPicker
              label="Icon"
              value={templateForm.icon}
              onChange={(icon) =>
                setTemplateForm((prev) => ({ ...prev, icon }))
              }
            />

            <div className={styles.templateFieldsList}>
              <span className={styles.fieldLabel}>Fields</span>
              {templateForm.fields.map((field, index) => (
                <div key={field.id} className={styles.templateFieldRow}>
                  <input
                    className={styles.input}
                    placeholder="Field label"
                    value={field.label}
                    onChange={(event) =>
                      updateTemplateField(index, { label: event.target.value })
                    }
                  />
                  <select
                    className={styles.input}
                    value={field.type}
                    onChange={(event) =>
                      updateTemplateField(index, {
                        type: event.target
                          .value as ConsultationFormField['type'],
                      })
                    }
                  >
                    {FIELD_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {field.type === 'select' ? (
                    <input
                      className={styles.input}
                      placeholder="Options, comma separated"
                      value={field.optionsText}
                      onChange={(event) =>
                        updateTemplateField(index, {
                          optionsText: event.target.value,
                        })
                      }
                    />
                  ) : null}
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) =>
                        updateTemplateField(index, {
                          required: event.target.checked,
                        })
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeTemplateField(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={addTemplateField}
              >
                Add field
              </button>
            </div>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save form template'}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={closeForm}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </main>
  );
}
