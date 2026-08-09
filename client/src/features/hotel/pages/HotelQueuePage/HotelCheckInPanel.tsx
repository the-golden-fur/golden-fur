import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Booking } from '../../../booking/booking.types';
import {
  checkInHotelStay,
  getCageSuggestion,
  getCurrentPrescriptionForPet,
} from '../../api/hotel.api';
import { CageStatusGrid } from '../../components/CageStatusGrid/CageStatusGrid';
import {
  CatalogComboBox,
  type CatalogComboBoxValue,
} from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import { listCustomerCatalogForStaff } from '../../../catalog/api/catalog.api';
import type { ProductCatalogItem } from '../../../catalog/catalog.types';
import { TimeInput } from '../../components/TimeInput/TimeInput';
import { formatTimeValue } from '../../components/TimeInput/formatTimeValue';
import type {
  Cage,
  FeedingInstructionPayload,
  MealTime,
  MedicationInstructionPayload,
  PartOfDay,
  PlayingInstructionPayload,
  WalkingInstructionPayload,
} from '../../hotel.types';
import styles from './HotelCheckInPanel.module.css';

const MEAL_TIMES: MealTime[] = ['Morning', 'Noon', 'Afternoon', 'Evening'];
const EMPTY_COMBO: CatalogComboBoxValue = { catalogId: null, text: '' };

/** #22: care_walking_instructions/care_playing_instructions now store a
 * coarse Morning/Afternoon/Evening block, not a literal clock time - this
 * form still lets staff pick a precise start time for their own operational
 * scheduling, and buckets it into the stored part-of-day on submit. */
function partOfDayFromTime(time: string): PartOfDay {
  const [hour] = time.split(':').map(Number);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

const PART_OF_DAY_DEFAULT_TIME: Record<PartOfDay, string> = {
  Morning: '07:00',
  Afternoon: '13:00',
  Evening: '18:00',
};

interface HotelCheckInPanelProps {
  accessToken: string;
  role: string;
  /** Custom change: routed check-in page - the booking picker now lives on
   * HotelQueuePage's Check In tab (a real navigation, not local state), so
   * this panel always has an already-selected booking to work with rather
   * than owning its own picker/selection state. */
  booking: Booking;
  /** Fires once a pet has been checked in, so the parent HotelQueuePage can
   * switch to the Check Out tab with this stay preselected. */
  onCheckedIn: (stayId: string) => void;
}

interface FeedingUiState {
  mealTime: MealTime;
  foodType: CatalogComboBoxValue;
  quantity: string;
  specialInstructions: string;
}

type WalkMode = 'range' | 'duration';

interface WalkBlockUi {
  mode: WalkMode;
  startTime: string; // "HH:MM", 24h
  endTime: string; // "HH:MM", 24h - range mode only
  durationMinutes: number; // duration mode only
  notes: string;
}

interface MedicationUiState {
  name: CatalogComboBoxValue;
  dose: string;
  scheduledTimes: string[]; // "HH:MM", 24h, one per chip
  administrationNotes: string;
}

/** Minutes between two "HH:MM" 24h times, wrapping past midnight if end <
 * start (an overnight walk block is unusual but not invalid). */
function minutesBetween(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTotal = startH * 60 + startM;
  const endTotal = endH * 60 + endM;
  return endTotal >= startTotal
    ? endTotal - startTotal
    : endTotal + 1440 - startTotal;
}

/**
 * Issue #79 revision: check-in form capturing structured feeding/walking/
 * medication instructions and cage size suggestion. Cage assignment and
 * Care Instructions load read-only (the auto-suggested cage plus whatever
 * the booking already captured) - the single `isEditing` toggle (an "Edit"/
 * "Done editing" button at the end of the form) unlocks both together, so a
 * receptionist correcting a customer's mistake doesn't first have to know
 * they need to click something.
 *
 * Food type and medication name use CatalogComboBox - a hybrid dropdown
 * (admin-managed product_catalog) or freetext fallback that is never
 * written back to the catalog. Staff no longer buy food/medication on a
 * customer's behalf (#22) - there is no "hotel supplies this" billing path
 * anymore.
 *
 * Walking/playtime accept either a time range (start + end) or a start +
 * duration, toggled per block; medication scheduled times are a list of
 * time chips. All three use TimeInput - a native <input type="time"> plus
 * a quick-pick preset dropdown - for the staff's own operational
 * scheduling, then bucket the chosen time into the stored Morning/
 * Afternoon/Evening block on submit (#22 - care_walking_instructions/
 * care_playing_instructions no longer store a literal clock time).
 *
 * Custom change: this used to render inline (pop up at the bottom of the
 * Check In tab) once a booking was picked from HotelBookingPicker - it's
 * now a real routed page (HotelCheckInFormPage, /staff/hotel/queue/check-
 * in/:bookingId) so editing a check-in has its own URL/back button instead
 * of scrolling to a form appended below the picker. The picker itself still
 * lives on HotelQueuePage's Check In tab; selecting a booking there
 * navigates here instead of setting local state.
 */
export function HotelCheckInPanel({
  accessToken,
  role,
  booking,
  onCheckedIn,
}: HotelCheckInPanelProps) {
  const [suggestedCages, setSuggestedCages] = useState<Cage[]>([]);
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);
  const [selectedCageId, setSelectedCageId] = useState<string | null>(null);

  const [foodCatalog, setFoodCatalog] = useState<ProductCatalogItem[]>([]);
  const [medicationCatalog, setMedicationCatalog] = useState<
    ProductCatalogItem[]
  >([]);

  const [feeding, setFeeding] = useState<FeedingUiState[]>([]);
  const [walking, setWalking] = useState<WalkBlockUi[]>([]);
  const [playing, setPlaying] = useState<WalkBlockUi[]>([]);
  const [medications, setMedications] = useState<MedicationUiState[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkedInStayId, setCheckedInStayId] = useState<string | null>(null);

  // Cage assignment and Care Instructions load read-only (the auto-suggested
  // cage plus whatever the booking already captured) - a single "Edit"
  // toggle unlocks both together, so the receptionist can correct a mistake
  // without every check-in requiring a click first.
  const [isEditing, setIsEditing] = useState(false);

  // A customer's own saved food/medication types (#22) - the booking being
  // checked in already identifies the customer, so this is keyed off it.
  // Never the old global staff Product Catalog.
  useEffect(() => {
    const customerId = booking.customer_id;
    let isMounted = true;

    void listCustomerCatalogForStaff(customerId, accessToken, 'food').then(
      (result) => {
        if (isMounted && result.data)
          setFoodCatalog(result.data.filter((item) => item.is_active));
      }
    );

    void listCustomerCatalogForStaff(
      customerId,
      accessToken,
      'medication'
    ).then((result) => {
      if (isMounted && result.data) {
        setMedicationCatalog(result.data.filter((item) => item.is_active));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, booking.customer_id]);

  // Runs once for this page's one booking (mirrors the old picker
  // onSelect's setup, now triggered by mount/booking-id-change instead of a
  // click) - pre-fills from whatever the customer/receptionist entered at
  // booking time.
  useEffect(() => {
    // Pre-fills from whatever the customer/receptionist entered at booking
    // time (CustomerBookingFlowPage's "Care Instructions" step), so this
    // form doesn't start blank - still just a starting point, freely
    // editable below before it becomes the authoritative record.
    const preferences = booking.hotel_preferences;

    if (preferences) {
      if (preferences.feeding.length > 0) {
        setFeeding(
          preferences.feeding.map((item) => ({
            mealTime: item.meal_time,
            // Carries the booking flow's catalog match through when present
            // (its Care Instructions step now uses the same catalog),
            // instead of always discarding it as freetext.
            foodType: {
              catalogId: item.food_catalog_id ?? null,
              text: item.food_type,
            },
            quantity: item.quantity,
            specialInstructions: item.special_instructions ?? '',
          }))
        );
      }

      if (preferences.walking.length > 0) {
        setWalking(
          preferences.walking.map((item) => ({
            mode: 'duration',
            startTime: PART_OF_DAY_DEFAULT_TIME[item.time_block],
            endTime: '',
            durationMinutes: item.duration_minutes,
            notes: item.notes ?? '',
          }))
        );
      }

      if (preferences.playing.length > 0) {
        setPlaying(
          preferences.playing.map((item) => ({
            mode: 'duration',
            startTime: PART_OF_DAY_DEFAULT_TIME[item.time_block],
            endTime: '',
            durationMinutes: item.duration_minutes,
            notes: item.notes ?? '',
          }))
        );
      }

      if (preferences.medications.length > 0) {
        setMedications(
          preferences.medications.map((item) => ({
            name: {
              catalogId: item.medication_catalog_id ?? null,
              text: item.medication_name,
            },
            dose: item.dose,
            scheduledTimes: item.scheduled_times,
            administrationNotes: item.administration_notes ?? '',
          }))
        );
      }
    }

    void getCageSuggestion(booking.pet_id, accessToken).then((result) => {
      if (result.data) {
        setSuggestedSize(result.data.suggestedSize);
        setSuggestedCages(result.data.availableCages);
        setSelectedCageId(result.data.availableCages[0]?.id ?? null);
      }
    });

    void getCurrentPrescriptionForPet(booking.pet_id, accessToken).then(
      (result) => {
        if (result.data && result.data.medications.length > 0) {
          const prescriptionMedications = result.data.medications.map(
            (medication) => ({
              // Pre-filled from M07, not the hotel's medication catalog -
              // stays freetext (no catalogId), matching the "one-time copy,
              // never billable" pre-fill behavior.
              name: { catalogId: null, text: medication.name },
              dose: medication.dose,
              scheduledTimes: [],
              administrationNotes: medication.notes ?? '',
            })
          );

          // Prepended, not replaced - a booking-time preference entered
          // above (synchronously) must survive this later-resolving fetch.
          setMedications((prev) => [...prescriptionMedications, ...prev]);
        }
      }
    );
    // Intentionally runs once per booking.id (mount/route change), not on
    // every accessToken re-render - mirrors the old handler's "runs once
    // per selection" semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  function addFeeding() {
    setFeeding((prev) => [
      ...prev,
      {
        mealTime: 'Morning',
        foodType: EMPTY_COMBO,
        quantity: '',
        specialInstructions: '',
      },
    ]);
  }

  function updateFeeding(index: number, updates: Partial<FeedingUiState>) {
    setFeeding((prev) =>
      prev.map((state, i) => (i === index ? { ...state, ...updates } : state))
    );
  }

  function removeFeeding(index: number) {
    setFeeding((prev) => prev.filter((_, i) => i !== index));
  }

  function addWalkBlock() {
    setWalking((prev) => [
      ...prev,
      {
        mode: 'range',
        startTime: '07:00',
        endTime: '07:15',
        durationMinutes: 15,
        notes: '',
      },
    ]);
  }

  function updateWalkBlock(index: number, updates: Partial<WalkBlockUi>) {
    setWalking((prev) =>
      prev.map((block, i) => (i === index ? { ...block, ...updates } : block))
    );
  }

  function removeWalkBlock(index: number) {
    setWalking((prev) => prev.filter((_, i) => i !== index));
  }

  function addPlayBlock() {
    setPlaying((prev) => [
      ...prev,
      {
        mode: 'range',
        startTime: '07:00',
        endTime: '07:15',
        durationMinutes: 15,
        notes: '',
      },
    ]);
  }

  function updatePlayBlock(index: number, updates: Partial<WalkBlockUi>) {
    setPlaying((prev) =>
      prev.map((block, i) => (i === index ? { ...block, ...updates } : block))
    );
  }

  function removePlayBlock(index: number) {
    setPlaying((prev) => prev.filter((_, i) => i !== index));
  }

  function addMedication() {
    setMedications((prev) => [
      ...prev,
      {
        name: EMPTY_COMBO,
        dose: '',
        scheduledTimes: [],
        administrationNotes: '',
      },
    ]);
  }

  function updateMedication(
    index: number,
    updates: Partial<MedicationUiState>
  ) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === index ? { ...medication, ...updates } : medication
      )
    );
  }

  function removeMedication(index: number) {
    setMedications((prev) => prev.filter((_, i) => i !== index));
  }

  function addMedicationTime(index: number) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === index
          ? {
              ...medication,
              scheduledTimes: [...medication.scheduledTimes, '08:00'],
            }
          : medication
      )
    );
  }

  function removeMedicationTime(medicationIndex: number, timeIndex: number) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === medicationIndex
          ? {
              ...medication,
              scheduledTimes: medication.scheduledTimes.filter(
                (_, j) => j !== timeIndex
              ),
            }
          : medication
      )
    );
  }

  function updateMedicationTime(
    medicationIndex: number,
    timeIndex: number,
    value: string
  ) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === medicationIndex
          ? {
              ...medication,
              scheduledTimes: medication.scheduledTimes.map((time, j) =>
                j === timeIndex ? value : time
              ),
            }
          : medication
      )
    );
  }

  /**
   * #79 revision: catches incomplete rows before they ever reach the
   * server, so a checked meal time with no food type/quantity (etc.)
   * surfaces a specific, actionable message instead of the API's generic
   * "Invalid payload" 400.
   */
  function validateForm(): string | null {
    for (const [index, state] of feeding.entries()) {
      if (!state.foodType.text.trim()) {
        return `Feeding time #${index + 1} is missing a food type.`;
      }
      if (!state.quantity.trim()) {
        return `Feeding time #${index + 1} is missing a quantity.`;
      }
    }

    for (const [index, block] of walking.entries()) {
      if (!block.startTime) {
        return `Walk time #${index + 1} is missing a start time.`;
      }
      if (block.mode === 'range') {
        if (!block.endTime) {
          return `Walk time #${index + 1} is missing an end time.`;
        }
        if (minutesBetween(block.startTime, block.endTime) <= 0) {
          return `Walk time #${index + 1}'s end time must be after its start time.`;
        }
      } else if (!block.durationMinutes || block.durationMinutes < 1) {
        return `Walk time #${index + 1} needs a duration of at least 1 minute.`;
      }
    }

    for (const [index, block] of playing.entries()) {
      if (!block.startTime) {
        return `Playtime #${index + 1} is missing a start time.`;
      }
      if (block.mode === 'range') {
        if (!block.endTime) {
          return `Playtime #${index + 1} is missing an end time.`;
        }
        if (minutesBetween(block.startTime, block.endTime) <= 0) {
          return `Playtime #${index + 1}'s end time must be after its start time.`;
        }
      } else if (!block.durationMinutes || block.durationMinutes < 1) {
        return `Playtime #${index + 1} needs a duration of at least 1 minute.`;
      }
    }

    for (const [index, medication] of medications.entries()) {
      if (!medication.name.text.trim()) {
        return `Medication #${index + 1} is missing a name.`;
      }
      if (!medication.dose.trim()) {
        return `Medication #${index + 1} is missing a dose.`;
      }
    }

    return null;
  }

  async function submitCheckIn() {
    if (!selectedCageId) return;

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    const feedingPayload: FeedingInstructionPayload[] = feeding.map(
      (state) => ({
        meal_time: state.mealTime,
        food_type: state.foodType.text,
        quantity: state.quantity,
        special_instructions: state.specialInstructions || undefined,
        food_catalog_id: state.foodType.catalogId ?? undefined,
      })
    );

    const walkingPayload: WalkingInstructionPayload[] = walking.map(
      (block) => ({
        time_block: partOfDayFromTime(block.startTime),
        duration_minutes:
          block.mode === 'range'
            ? minutesBetween(block.startTime, block.endTime)
            : block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const playingPayload: PlayingInstructionPayload[] = playing.map(
      (block) => ({
        time_block: partOfDayFromTime(block.startTime),
        duration_minutes:
          block.mode === 'range'
            ? minutesBetween(block.startTime, block.endTime)
            : block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const medicationsPayload: MedicationInstructionPayload[] = medications.map(
      (medication) => ({
        medication_name: medication.name.text,
        dose: medication.dose,
        scheduled_times: medication.scheduledTimes.map(formatTimeValue),
        administration_notes: medication.administrationNotes || undefined,
        medication_catalog_id: medication.name.catalogId ?? undefined,
      })
    );

    const result = await checkInHotelStay(accessToken, {
      booking_id: booking.id,
      cage_id: selectedCageId,
      feeding: feedingPayload,
      walking: walkingPayload,
      playing: playingPayload,
      medications: medicationsPayload,
      // Staff no longer set this per stay - whether a care-log-completed
      // notification actually reaches the customer is now driven entirely
      // by their own notification_preferences (see careLogCompletion.service.ts).
      notify_opt_in: false,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setSubmitError(result.error ?? 'Could not check in this pet.');
      return;
    }

    setCheckedInStayId(result.data.stay.id);
  }

  if (checkedInStayId) {
    return (
      <>
        <p className={styles.successBanner} role="status">
          Pet checked in successfully.
        </p>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onCheckedIn(checkedInStayId)}
          >
            Go to checkout
          </button>
          <Link className={styles.secondaryButton} to="/staff/hotel/queue">
            Check in another pet
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {submitError ? (
        <p className={styles.errorBanner} role="alert">
          {submitError}
        </p>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Cage assignment</h2>
        <p className={styles.copy}>
          Suggested size: {suggestedSize ?? '...'} - the recommended cage is
          highlighted below, or pick any other Available cage.
        </p>
        <CageStatusGrid
          accessToken={accessToken}
          viewerRole={role}
          onSelectCage={
            isEditing ? (cage) => setSelectedCageId(cage.id) : undefined
          }
          selectedCageId={selectedCageId}
          suggestedCageIds={suggestedCages.map((cage) => cage.id)}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Feeding instructions</h2>
        {!isEditing ? (
          <p className={styles.copy}>
            Read-only - captured from the customer's booking. Click Edit below
            to correct a mistake.
          </p>
        ) : null}
        {feeding.map((state, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.inlineFields}>
              <select
                className={styles.input}
                aria-label="Meal time"
                value={state.mealTime}
                disabled={!isEditing}
                onChange={(event) =>
                  updateFeeding(index, {
                    mealTime: event.target.value as MealTime,
                  })
                }
              >
                {MEAL_TIMES.map((mealTime) => (
                  <option key={mealTime} value={mealTime}>
                    {mealTime}
                  </option>
                ))}
              </select>
              <CatalogComboBox
                items={foodCatalog}
                hidePrice
                value={state.foodType}
                placeholder="Food type - search or type a custom value..."
                disabled={!isEditing}
                onChange={(next) => updateFeeding(index, { foodType: next })}
              />
              <input
                className={styles.input}
                placeholder="Quantity"
                value={state.quantity}
                disabled={!isEditing}
                onChange={(event) =>
                  updateFeeding(index, {
                    quantity: event.target.value,
                  })
                }
              />
              <input
                className={styles.input}
                placeholder="Special instructions (optional)"
                value={state.specialInstructions}
                disabled={!isEditing}
                onChange={(event) =>
                  updateFeeding(index, {
                    specialInstructions: event.target.value,
                  })
                }
              />
              {isEditing ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => removeFeeding(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {feeding.length === 0 ? (
          <p className={styles.copy}>No feeding times were requested.</p>
        ) : null}
        {isEditing ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addFeeding}
          >
            Add feeding time
          </button>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Walking instructions</h2>
        {walking.map((block, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.tabRow}>
              <button
                type="button"
                className={
                  block.mode === 'range' ? styles.tabActive : styles.tab
                }
                disabled={!isEditing}
                onClick={() => updateWalkBlock(index, { mode: 'range' })}
              >
                Time range
              </button>
              <button
                type="button"
                className={
                  block.mode === 'duration' ? styles.tabActive : styles.tab
                }
                disabled={!isEditing}
                onClick={() => updateWalkBlock(index, { mode: 'duration' })}
              >
                Start + duration
              </button>
            </div>
            <div className={styles.walkFieldsGrid}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldGroupLabel}>Start</span>
                <TimeInput
                  aria-label="Walk start time"
                  value={block.startTime}
                  disabled={!isEditing}
                  onChange={(value) =>
                    updateWalkBlock(index, { startTime: value })
                  }
                />
              </label>
              {block.mode === 'range' ? (
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldGroupLabel}>End</span>
                  <TimeInput
                    aria-label="Walk end time"
                    value={block.endTime}
                    disabled={!isEditing}
                    onChange={(value) =>
                      updateWalkBlock(index, { endTime: value })
                    }
                  />
                </label>
              ) : (
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldGroupLabel}>Duration (min)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={block.durationMinutes}
                    disabled={!isEditing}
                    onChange={(event) =>
                      updateWalkBlock(index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label className={styles.fieldGroupWide}>
                <span className={styles.fieldGroupLabel}>Notes (optional)</span>
                <input
                  className={styles.input}
                  value={block.notes}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updateWalkBlock(index, { notes: event.target.value })
                  }
                />
              </label>
            </div>
            {isEditing ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => removeWalkBlock(index)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {walking.length === 0 ? (
          <p className={styles.copy}>No walk times were requested.</p>
        ) : null}
        {isEditing ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addWalkBlock}
          >
            Add walk time
          </button>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Playtime</h2>
        {playing.map((block, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.tabRow}>
              <button
                type="button"
                className={
                  block.mode === 'range' ? styles.tabActive : styles.tab
                }
                disabled={!isEditing}
                onClick={() => updatePlayBlock(index, { mode: 'range' })}
              >
                Time range
              </button>
              <button
                type="button"
                className={
                  block.mode === 'duration' ? styles.tabActive : styles.tab
                }
                disabled={!isEditing}
                onClick={() => updatePlayBlock(index, { mode: 'duration' })}
              >
                Start + duration
              </button>
            </div>
            <div className={styles.walkFieldsGrid}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldGroupLabel}>Start</span>
                <TimeInput
                  aria-label="Playtime start"
                  value={block.startTime}
                  disabled={!isEditing}
                  onChange={(value) =>
                    updatePlayBlock(index, { startTime: value })
                  }
                />
              </label>
              {block.mode === 'range' ? (
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldGroupLabel}>End</span>
                  <TimeInput
                    aria-label="Playtime end"
                    value={block.endTime}
                    disabled={!isEditing}
                    onChange={(value) =>
                      updatePlayBlock(index, { endTime: value })
                    }
                  />
                </label>
              ) : (
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldGroupLabel}>Duration (min)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    value={block.durationMinutes}
                    disabled={!isEditing}
                    onChange={(event) =>
                      updatePlayBlock(index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
              <label className={styles.fieldGroupWide}>
                <span className={styles.fieldGroupLabel}>Notes (optional)</span>
                <input
                  className={styles.input}
                  value={block.notes}
                  disabled={!isEditing}
                  onChange={(event) =>
                    updatePlayBlock(index, { notes: event.target.value })
                  }
                />
              </label>
            </div>
            {isEditing ? (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => removePlayBlock(index)}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
        {playing.length === 0 ? (
          <p className={styles.copy}>No playtimes were requested.</p>
        ) : null}
        {isEditing ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addPlayBlock}
          >
            Add playtime
          </button>
        ) : null}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Medications</h2>
        {medications.map((medication, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.inlineFields}>
              <CatalogComboBox
                items={medicationCatalog}
                hidePrice
                value={medication.name}
                placeholder="Medication name - search or type a custom value..."
                disabled={!isEditing}
                onChange={(next) => updateMedication(index, { name: next })}
              />
              <input
                className={styles.input}
                placeholder="Dose"
                value={medication.dose}
                disabled={!isEditing}
                onChange={(event) =>
                  updateMedication(index, { dose: event.target.value })
                }
              />
              <input
                className={styles.input}
                placeholder="Notes (optional)"
                value={medication.administrationNotes}
                disabled={!isEditing}
                onChange={(event) =>
                  updateMedication(index, {
                    administrationNotes: event.target.value,
                  })
                }
              />
              {isEditing ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => removeMedication(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div className={styles.inlineFields}>
              <span className={styles.copy}>Scheduled times:</span>
              {medication.scheduledTimes.map((time, timeIndex) => (
                <div key={timeIndex} className={styles.timeChip}>
                  <TimeInput
                    aria-label={`Medication time ${timeIndex + 1}`}
                    value={time}
                    disabled={!isEditing}
                    onChange={(value) =>
                      updateMedicationTime(index, timeIndex, value)
                    }
                  />
                  {isEditing ? (
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeMedicationTime(index, timeIndex)}
                    >
                      &times;
                    </button>
                  ) : null}
                </div>
              ))}
              {isEditing ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => addMedicationTime(index)}
                >
                  Add time
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {medications.length === 0 ? (
          <p className={styles.copy}>No medications were requested.</p>
        ) : null}
        {isEditing ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addMedication}
          >
            Add medication
          </button>
        ) : null}
      </section>

      <button
        type="button"
        className={isEditing ? styles.secondaryButton : styles.primaryButton}
        onClick={() => setIsEditing((prev) => !prev)}
      >
        {isEditing ? 'Done editing' : 'Edit'}
      </button>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={!selectedCageId || isSubmitting}
        onClick={() => void submitCheckIn()}
      >
        {isSubmitting ? 'Checking in...' : 'Check in'}
      </button>
    </>
  );
}
