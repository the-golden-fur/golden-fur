import { useState, type FormEvent } from 'react';
import { createPet } from '../../../api/customer.api';
import type {
  Pet,
  PetCoatType,
  PetGender,
  PetSpecies,
  PetWeightClass,
} from '../../../customer.types';
import styles from './PetForm.module.css';

const SPECIES_OPTIONS: PetSpecies[] = ['Dog', 'Cat'];
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
  const [species, setSpecies] = useState<PetSpecies | ''>('');
  const [breed, setBreed] = useState('');
  const [gender, setGender] = useState<PetGender | ''>('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [weightClass, setWeightClass] = useState<PetWeightClass | ''>('');
  const [coatType, setCoatType] = useState<PetCoatType | ''>('');
  const [healthConditions, setHealthConditions] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // AC-4: validates name/species/weight_class/coat_type as required
    // before allowing submission, matching #32's server-side validator.
    if (!name.trim() || !species || !weightClass || !coatType) {
      setError('Name, species, weight class, and coat type are required.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await createPet(customerId, accessToken, {
      name: name.trim(),
      species,
      weight_class: weightClass,
      coat_type: coatType,
      ...(breed.trim() ? { breed: breed.trim() } : {}),
      ...(gender ? { gender } : {}),
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      ...(healthConditions.trim()
        ? { health_conditions: healthConditions.trim() }
        : {}),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setError(result.error ?? 'Could not add pet.');
      return;
    }

    setName('');
    setSpecies('');
    setBreed('');
    setGender('');
    setDateOfBirth('');
    setWeightClass('');
    setCoatType('');
    setHealthConditions('');
    onCreated(result.data);
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
        <span className={styles.label}>Species</span>
        <select
          className={styles.input}
          value={species}
          onChange={(event) => setSpecies(event.target.value as PetSpecies)}
        >
          <option value="">Select a species</option>
          {SPECIES_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Breed (optional)</span>
        <input
          className={styles.input}
          value={breed}
          onChange={(event) => setBreed(event.target.value)}
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
      <label className={styles.field}>
        <span className={styles.label}>Health conditions (optional)</span>
        <input
          className={styles.input}
          value={healthConditions}
          onChange={(event) => setHealthConditions(event.target.value)}
        />
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
