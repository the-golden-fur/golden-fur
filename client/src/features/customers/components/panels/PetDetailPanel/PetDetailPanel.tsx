import { useState } from 'react';
import { updatePet, uploadPetPhoto } from '../../../api/customer.api';
import { formatRelativeTime } from '../../../../../shared/utils/formatRelativeTime';
import { PetHealthConditionBadge } from '../../badges/PetHealthConditionBadge/PetHealthConditionBadge';
import { BreedSelect } from '../../forms/BreedSelect/BreedSelect';
import { MedicalNoteList } from '../../lists/MedicalNoteList/MedicalNoteList';
import { VaccinationRecordList } from '../../lists/VaccinationRecordList/VaccinationRecordList';
import type {
  Pet,
  PetCoatType,
  PetGender,
  PetType,
  PetWeightClass,
} from '../../../customer.types';
import styles from './PetDetailPanel.module.css';

const PET_TYPE_OPTIONS: PetType[] = ['Dog', 'Cat'];
const GENDER_OPTIONS: PetGender[] = ['Male', 'Female'];
const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPE_OPTIONS: PetCoatType[] = ['SC', 'LC'];

interface PetDetailPanelProps {
  pet: Pet;
  accessToken: string;
  /** True for the owning customer, or staff with CUSTOMER_MANAGER_ROLES
   * (Receptionist/Admin/Supervisor/Superadmin) - mirrors the server's own
   * PATCH /pets/:id authorization (pet.controller.ts). */
  canEdit: boolean;
  /** Client interview finding: only a staff-authorized editor may view the
   * weight_class/coat_type edit inputs or submit changes to them - the
   * server rejects those fields outright from the pet's own owner (see
   * pet.validator.ts). Read-only display of the current values is shown to
   * everyone. Defaults false so the customer portal's PetProfilePage (which
   * never passes this prop) can't accidentally elevate. */
  isStaff?: boolean;
  onUpdated: (pet: Pet) => void;
}

/**
 * Shared view+edit body for a pet's profile, reused by the customer portal
 * (`PetProfilePage`, always canEdit - a customer can only ever load their
 * own pet here) and the staff route (`StaffPetProfilePage`, canEdit gated to
 * CUSTOMER_MANAGER_ROLES). Previously read-only; editing was backed by
 * `PATCH /pets/:id` / `POST /pets/:id/photo` from day one, just never
 * exposed in the UI.
 */
export function PetDetailPanel({
  pet,
  accessToken,
  canEdit,
  isStaff = false,
  onUpdated,
}: PetDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(pet.name);
  const [petType, setPetType] = useState<PetType>(pet.pet_type);
  const [breedId, setBreedId] = useState<string | null>(pet.breed_id);
  const [gender, setGender] = useState<PetGender | ''>(pet.gender ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(pet.date_of_birth ?? '');
  const [weightClass, setWeightClass] = useState<PetWeightClass | ''>(
    pet.weight_class ?? ''
  );
  const [coatType, setCoatType] = useState<PetCoatType | ''>(
    pet.coat_type ?? ''
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function startEditing() {
    setName(pet.name);
    setPetType(pet.pet_type);
    setBreedId(pet.breed_id);
    setGender(pet.gender ?? '');
    setDateOfBirth(pet.date_of_birth ?? '');
    setWeightClass(pet.weight_class ?? '');
    setCoatType(pet.coat_type ?? '');
    setPhotoFile(null);
    setError(null);
    setIsEditing(true);
  }

  async function handleSave() {
    if (!name.trim() || !breedId) {
      setError(!name.trim() ? 'Name is required.' : 'Please select a breed.');
      return;
    }

    setError(null);
    setIsSaving(true);

    const result = await updatePet(pet.id, accessToken, {
      name: name.trim(),
      pet_type: petType,
      breed_id: breedId,
      gender: gender || undefined,
      date_of_birth: dateOfBirth || undefined,
      ...(isStaff && weightClass ? { weight_class: weightClass } : {}),
      ...(isStaff && coatType ? { coat_type: coatType } : {}),
    });

    if (result.error || !result.data) {
      setIsSaving(false);
      setError(result.error ?? 'Could not save changes.');
      return;
    }

    let updatedPet = result.data;

    if (photoFile) {
      const photoResult = await uploadPetPhoto(pet.id, accessToken, photoFile);

      if (photoResult.data?.photo_url) {
        updatedPet = { ...updatedPet, photo_url: photoResult.data.photo_url };
      }
    }

    setIsSaving(false);
    setIsEditing(false);
    onUpdated(updatedPet);
  }

  return (
    <>
      {pet.photo_url ? (
        <img
          className={styles.photo}
          src={pet.photo_url}
          alt={`${pet.name}'s photo`}
        />
      ) : null}

      <PetHealthConditionBadge petId={pet.id} accessToken={accessToken} />

      <section className={styles.panel}>
        {isEditing ? (
          <div className={styles.editForm}>
            <label className={styles.field}>
              <span className={styles.label}>Name</span>
              <input
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Pet Type</span>
              <select
                className={styles.input}
                value={petType}
                onChange={(event) => {
                  setPetType(event.target.value as PetType);
                  setBreedId(null);
                }}
              >
                {PET_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Breed</span>
              <BreedSelect
                petType={petType}
                value={breedId}
                onChange={setBreedId}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Photo (optional)</span>
              <input
                className={styles.input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setPhotoFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Gender</span>
              <select
                className={styles.input}
                value={gender}
                onChange={(event) => setGender(event.target.value as PetGender)}
              >
                <option value="">Not specified</option>
                {GENDER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Date of birth</span>
              <input
                className={styles.input}
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
            </label>
            {isStaff ? (
              <>
                <label className={styles.field}>
                  <span className={styles.label}>Weight class</span>
                  <select
                    className={styles.input}
                    value={weightClass}
                    onChange={(event) =>
                      setWeightClass(event.target.value as PetWeightClass)
                    }
                  >
                    <option value="">Not yet assessed</option>
                    {WEIGHT_CLASS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Coat type</span>
                  <select
                    className={styles.input}
                    value={coatType}
                    onChange={(event) =>
                      setCoatType(event.target.value as PetCoatType)
                    }
                  >
                    <option value="">Not yet assessed</option>
                    {COAT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {error ? (
              <p className={styles.errorBanner} role="alert">
                {error}
              </p>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.button}
                disabled={isSaving}
                onClick={() => void handleSave()}
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                disabled={isSaving}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <dl className={styles.attributes}>
              <div className={styles.attribute}>
                <dt className={styles.attributeLabel}>Pet Type</dt>
                <dd className={styles.attributeValue}>{pet.pet_type}</dd>
              </div>
              {pet.gender ? (
                <div className={styles.attribute}>
                  <dt className={styles.attributeLabel}>Gender</dt>
                  <dd className={styles.attributeValue}>{pet.gender}</dd>
                </div>
              ) : null}
              {pet.date_of_birth ? (
                <div className={styles.attribute}>
                  <dt className={styles.attributeLabel}>Date of birth</dt>
                  <dd className={styles.attributeValue}>{pet.date_of_birth}</dd>
                </div>
              ) : null}
              <div className={styles.attribute}>
                <dt className={styles.attributeLabel}>Weight class</dt>
                <dd className={styles.attributeValue}>
                  {pet.weight_class ?? 'Not yet assessed'}
                </dd>
              </div>
              <div className={styles.attribute}>
                <dt className={styles.attributeLabel}>Coat type</dt>
                <dd className={styles.attributeValue}>
                  {pet.coat_type ?? 'Not yet assessed'}
                </dd>
              </div>
              {pet.assessed_at ? (
                <div className={styles.attribute}>
                  <dt className={styles.attributeLabel}>Last assessed</dt>
                  <dd className={styles.attributeValue}>
                    {formatRelativeTime(pet.assessed_at)}
                  </dd>
                </div>
              ) : null}
            </dl>
            {!pet.weight_class || !pet.coat_type ? (
              <p className={styles.copy}>
                This pet needs an Initial Assessment visit before most
                services can be booked.
                {isStaff
                  ? ' Use Edit above to record the weight class and coat type once the pet has been physically weighed and checked.'
                  : ''}
              </p>
            ) : null}

            {canEdit ? (
              <button
                type="button"
                className={styles.editButton}
                onClick={startEditing}
              >
                Edit
              </button>
            ) : null}
          </>
        )}

        <section
          className={styles.section}
          aria-labelledby="vaccination-records-title"
        >
          <h2 className={styles.sectionTitle} id="vaccination-records-title">
            Vaccination Records
          </h2>
          <VaccinationRecordList petId={pet.id} accessToken={accessToken} />
        </section>

        <section
          className={styles.section}
          aria-labelledby="medical-notes-title"
        >
          <h2 className={styles.sectionTitle} id="medical-notes-title">
            Medical Notes
          </h2>
          <MedicalNoteList petId={pet.id} accessToken={accessToken} />
        </section>

        <section
          className={styles.section}
          aria-labelledby="service-history-title"
        >
          <h2 className={styles.sectionTitle} id="service-history-title">
            Service History
          </h2>
          <p className={styles.copy}>No service history yet.</p>
        </section>
      </section>
    </>
  );
}
