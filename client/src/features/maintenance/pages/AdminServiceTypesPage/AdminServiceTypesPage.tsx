import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listStaff } from '../../../staff/api/staff.api';
import {
  createServiceType,
  listServiceTypes,
  updateServiceType,
} from '../../api/maintenance.api';
import { StatusBadge } from '../../../../shared/components/StatusBadge/StatusBadge';
import { ToggleSwitch } from '../../../../shared/components/ToggleSwitch/ToggleSwitch';
import type { ServiceType } from '../../maintenance.types';
import styles from './AdminServiceTypesPage.module.css';

/** Same list as MAINTENANCE_WRITE_ROLES server-side. */
const ALLOWED_VIEWER_ROLES = new Set(['Admin', 'Superadmin']);

interface CreateFormState {
  key: string;
  name: string;
  staffPickerEnabled: boolean;
  cagePickerEnabled: boolean;
}

const EMPTY_CREATE_FORM: CreateFormState = {
  key: '',
  name: '',
  staffPickerEnabled: false,
  cagePickerEnabled: false,
};

/**
 * Custom change: Service Types admin CRUD. Grooming/Hotel/Daycare/
 * Veterinary are still hardcoded ServiceCategory values everywhere they
 * drive real behavior (availability, capacity, pricing, vet eligibility) -
 * this page only controls each type's customer-facing display name,
 * whether it's offered at all (Active), and whether the Staff Picker/Cage
 * Picker steps are offered for it. A row added here with a brand new `key`
 * shows up as selectable but has no matching category-specific behavior
 * until that's separately built in code.
 */
export function AdminServiceTypesPage() {
  const { user, accessToken } = useAuth();

  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateFormState>(EMPTY_CREATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.id) {
      return;
    }

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsRoleLoading(false);
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  const isAllowedViewer =
    viewerRole !== null && ALLOWED_VIEWER_ROLES.has(viewerRole);

  useEffect(() => {
    if (!accessToken || !isAllowedViewer) {
      return;
    }

    let isMounted = true;

    void listServiceTypes(accessToken).then((result) => {
      if (!isMounted) {
        return;
      }

      setIsLoading(false);

      if (result.error || !result.data) {
        setLoadError(result.error ?? 'Could not load service types.');
        return;
      }

      setServiceTypes(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, isAllowedViewer]);

  const replaceServiceType = (updated: ServiceType) => {
    setServiceTypes((prev) =>
      prev.map((type) => (type.id === updated.id ? updated : type))
    );
  };

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !createForm.key.trim() || !createForm.name.trim()) {
      setFormError('Key and name are required.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const result = await createServiceType(accessToken, {
      key: createForm.key.trim(),
      name: createForm.name.trim(),
      staff_picker_enabled: createForm.staffPickerEnabled,
      cage_picker_enabled: createForm.cagePickerEnabled,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setFormError(result.error ?? 'Could not add service type.');
      return;
    }

    setServiceTypes((prev) => [...prev, result.data as ServiceType]);
    setCreateForm(EMPTY_CREATE_FORM);
    setMessage('Service type added.');
  }

  function startEditing(serviceType: ServiceType) {
    setEditingId(serviceType.id);
    setEditingName(serviceType.name);
    setRowError(null);
  }

  async function handleRename(serviceTypeId: string) {
    if (!accessToken || !editingName.trim()) {
      setRowError('Name is required.');
      return;
    }

    setRowError(null);

    const result = await updateServiceType(serviceTypeId, accessToken, {
      name: editingName.trim(),
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not rename service type.');
      return;
    }

    replaceServiceType(result.data);
    setEditingId(null);
    setMessage('Service type renamed.');
  }

  async function handleToggle(
    serviceType: ServiceType,
    field: 'is_active' | 'staff_picker_enabled' | 'cage_picker_enabled',
    value: boolean
  ) {
    if (!accessToken) {
      return;
    }

    setRowError(null);

    const result = await updateServiceType(serviceType.id, accessToken, {
      [field]: value,
    });

    if (result.error || !result.data) {
      setRowError(result.error ?? 'Could not update service type.');
      return;
    }

    replaceServiceType(result.data);
  }

  if (isRoleLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (!isAllowedViewer) {
    return <Navigate to="/staff/settings" replace />;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Service Types</h1>
        <p className={styles.copy}>
          The service lines customers choose between at booking time (Grooming,
          Hotel, Daycare, Veterinary). Rename a type's customer-facing label,
          deactivate it, or turn on the Staff Picker/Cage Picker step for it.
          Adding a brand new type only makes it selectable here - real booking
          behavior for it (availability, pricing, etc.) still needs to be built
          separately.
        </p>

        {message ? <p className={styles.successBanner}>{message}</p> : null}

        <section className={styles.panel} aria-labelledby="add-type-title">
          <h2 className={styles.sectionTitle} id="add-type-title">
            Add service type
          </h2>
          <form
            className={styles.form}
            onSubmit={(event) => void handleCreate(event)}
          >
            <label className={styles.field}>
              <span className={styles.label}>Key</span>
              <input
                className={styles.input}
                value={createForm.key}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    key: event.target.value,
                  }))
                }
                placeholder="e.g. Boarding"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={createForm.staffPickerEnabled}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    staffPickerEnabled: event.target.checked,
                  }))
                }
              />
              <span>Staff picker enabled</span>
            </label>

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                checked={createForm.cagePickerEnabled}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    cagePickerEnabled: event.target.checked,
                  }))
                }
              />
              <span>Cage picker enabled</span>
            </label>

            {formError ? (
              <p className={styles.errorBanner} role="alert">
                {formError}
              </p>
            ) : null}

            <button
              className={styles.button}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add service type'}
            </button>
          </form>
        </section>

        {isLoading ? (
          <p className={styles.copy}>Loading service types...</p>
        ) : loadError ? (
          <p className={styles.errorBanner} role="alert">
            {loadError}
          </p>
        ) : (
          <ul className={styles.list}>
            {serviceTypes.map((serviceType) => (
              <li className={styles.listItem} key={serviceType.id}>
                <div className={styles.rowMain}>
                  {editingId === serviceType.id ? (
                    <>
                      <input
                        className={styles.input}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.smallButton}
                        onClick={() => void handleRename(serviceType.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={styles.typeName}>
                        {serviceType.name}
                      </span>
                      <span className={styles.typeKey}>{serviceType.key}</span>
                      <StatusBadge isActive={serviceType.is_active} />
                      <button
                        type="button"
                        className={styles.smallButtonSecondary}
                        onClick={() => startEditing(serviceType)}
                      >
                        Rename
                      </button>
                    </>
                  )}
                </div>

                <div className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>Active</span>
                  <ToggleSwitch
                    checked={serviceType.is_active}
                    onChange={(checked) =>
                      void handleToggle(serviceType, 'is_active', checked)
                    }
                    label={`${serviceType.is_active ? 'Deactivate' : 'Activate'} ${serviceType.name}`}
                    hideLabel
                  />
                  <span className={styles.toggleLabel}>Staff picker</span>
                  <ToggleSwitch
                    checked={serviceType.staff_picker_enabled}
                    onChange={(checked) =>
                      void handleToggle(
                        serviceType,
                        'staff_picker_enabled',
                        checked
                      )
                    }
                    label={`Staff picker for ${serviceType.name}`}
                    hideLabel
                  />
                  <span className={styles.toggleLabel}>Cage picker</span>
                  <ToggleSwitch
                    checked={serviceType.cage_picker_enabled}
                    onChange={(checked) =>
                      void handleToggle(
                        serviceType,
                        'cage_picker_enabled',
                        checked
                      )
                    }
                    label={`Cage picker for ${serviceType.name}`}
                    hideLabel
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {rowError ? (
          <p className={styles.errorBanner} role="alert">
            {rowError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
