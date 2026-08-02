import { useState, type FormEvent } from 'react';
import { createPet, uploadPetPhoto } from '../../../api/customer.api';
import type {
  Pet,
  PetCoatType,
  PetCreatePayloadStaff,
  PetGender,
  PetType,
  PetWeightClass,
} from '../../../customer.types';
import { BreedSelect } from '../BreedSelect/BreedSelect';
import styles from './PetForm.module.css';

const PET_TYPE_OPTIONS: PetType[] = ['Dog', 'Cat'];
const GENDER_OPTIONS: PetGender[] = ['Male', 'Female'];
const WEIGHT_CLASS_OPTIONS: PetWeightClass[] = ['S', 'M', 'L', 'XL'];
const COAT_TYPE_OPTIONS: PetCoatType[] = ['SC', 'LC'];

interface PetFormProps {
  /**
   * Target customer to create the pet under; the logged-in customer's own
   * id for self-service use, or any customer id for Issue #35's walk-in
   * intake flow, which reuses this component unmodified.
   */
  customerId: string;
  accessToken: string;
  onCreated: (pet: Pet) => void;
  /**
   * Client interview finding: a customer cannot set weight_class/coat_type
   * (they'd otherwise be able to manipulate Grooming price/Hotel cage size)
   * - the server rejects those fields outright from a non-staff caller (see
   * pet.validator.ts). Only a staff-authorized caller (walk-in intake,
   * Daycare check-in, Receptionist booking-on-behalf) sees those inputs
   * here, and only they may record the physical weigh-in/coat check. A pet
   * created without them stays "Unassessed" until staff sets them later.
   */
  isStaff?: boolean;
}

export function PetForm({
  customerId,
  accessToken,
  onCreated,
  isStaff = false,
}: PetFormProps) {
  const [name, setName] = useState('');
  const [petType, setPetType] = useState<PetType | ''>('');
  const [breedId, setBreedId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [gender, setGender] = useState<PetGender | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [weightClass, setWeightClass] = useState<PetWeightClass | ''>('');
  const [coatType, setCoatType] = useState<PetCoatType | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // AC-4: validates name/pet_type as required, and (Issue #77 AC-4) breed
    // as required client-side even though breed_id is nullable at the schema
    // level. weight_class/coat_type are optional even for a staff-authorized
    // caller - a pet can be registered before it's physically weighed.
    if (!name.trim() || !petType) {
      setError('Name and pet type are required.');
      return;
    }

    if (!breedId) {
      setError('Please select a breed.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const payload: PetCreatePayloadStaff = {
      name: name.trim(),
      pet_type: petType,
      breed_id: breedId,
      ...(gender ? { gender } : {}),
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      ...(isStaff && weightClass ? { weight_class: weightClass } : {}),
      ...(isStaff && coatType ? { coat_type: coatType } : {}),
    };

    const result = await createPet(customerId, accessToken, payload);

    if (result.error || !result.data) {
      setIsSubmitting(false);
      setError(result.error ?? 'Could not add pet.');
      return;
    }

    let pet = result.data;

    if (photoFile) {
      const photoResult = await uploadPetPhoto(pet.id, accessToken, photoFile);

      if (photoResult.data?.photo_url) {
        pet = { ...pet, photo_url: photoResult.data.photo_url };
      }
      // A photo-upload failure doesn't roll back pet creation - the pet
      // profile page still lets a photo be added later.
    }

    setIsSubmitting(false);
    setName('');
    setPetType('');
    setBreedId(null);
    setPhotoFile(null);
    setGender('');
    setDateOfBirth('');
    setWeightClass('');
    setCoatType('');
    onCreated(pet);
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void handleSubmit(event)}
    >
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
          <option value="">Select a pet type</option>
          {PET_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Breed</span>
        {petType ? (
          <BreedSelect
            petType={petType}
            value={breedId}
            onChange={setBreedId}
          />
        ) : (
          <input
            className={styles.input}
            disabled
            placeholder="Select a pet type first"
          />
        )}
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Photo (optional)</span>
        <input
          className={styles.input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Gender (optional)</span>
        <select
          className={styles.input}
          value={gender}
          onChange={(event) => setGender(event.target.value as PetGender)}
        >
          <option value="">Select a gender</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Date of birth (optional)</span>
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
            <span className={styles.label}>
              Weight class (optional - leave blank if not yet weighed)
            </span>
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
            <span className={styles.label}>
              Coat type (optional - leave blank if not yet assessed)
            </span>
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
      ) : (
        <p className={styles.copy}>
          Weight class and coat type will be recorded by staff once the pet
          is brought onsite for its initial assessment.
        </p>
      )}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.button} type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add pet'}
      </button>
    </form>
  );
}
