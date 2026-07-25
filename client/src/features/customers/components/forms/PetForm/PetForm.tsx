import { useState, type FormEvent } from 'react';
import { createPet, uploadPetPhoto } from '../../../api/customer.api';
import type {
  Pet,
  PetCoatType,
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
}

export function PetForm({ customerId, accessToken, onCreated }: PetFormProps) {
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

    // AC-4: validates name/pet_type/weight_class/coat_type as required, and
    // (Issue #77 AC-4) breed as required client-side even though breed_id is
    // nullable at the schema level.
    if (!name.trim() || !petType || !weightClass || !coatType) {
      setError('Name, pet type, weight class, and coat type are required.');
      return;
    }

    if (!breedId) {
      setError('Please select a breed.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await createPet(customerId, accessToken, {
      name: name.trim(),
      pet_type: petType,
      breed_id: breedId,
      weight_class: weightClass,
      coat_type: coatType,
      ...(gender ? { gender } : {}),
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
    });

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
      <label className={styles.field}>
        <span className={styles.label}>Weight class</span>
        <select
          className={styles.input}
          value={weightClass}
          onChange={(event) =>
            setWeightClass(event.target.value as PetWeightClass)
          }
        >
          <option value="">Select a weight class</option>
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
          onChange={(event) => setCoatType(event.target.value as PetCoatType)}
        >
          <option value="">Select a coat type</option>
          {COAT_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
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
