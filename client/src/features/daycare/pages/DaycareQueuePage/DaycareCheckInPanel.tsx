import { useState } from 'react';
import type { Booking } from '../../../booking/booking.types';
import { DaycareBookingPicker } from '../../components/DaycareBookingPicker/DaycareBookingPicker';
import { checkInDaycareSession } from '../../api/daycare.api';
import { getCageSuggestion } from '../../../hotel/api/hotel.api';
import { CageStatusGrid } from '../../../hotel/components/CageStatusGrid/CageStatusGrid';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import { formatTimeValue } from '../../../hotel/components/TimeInput/formatTimeValue';
import type {
  Cage,
  FeedingInstructionPayload,
  MealTime,
  MedicationInstructionPayload,
  PartOfDay,
  PlayingInstructionPayload,
  WalkingInstructionPayload,
} from '../../../hotel/hotel.types';
import styles from './DaycareCheckInPanel.module.css';

const MEAL_TIMES: MealTime[] = ['Morning', 'Noon', 'Afternoon', 'Evening'];
const PARTS_OF_DAY: PartOfDay[] = ['Morning', 'Afternoon', 'Evening'];

interface DaycareCheckInPanelProps {
  accessToken: string;
  role: string;
  branchId: string;
  /** Fires once a pet has been checked in, so the parent DaycareQueuePage
   * can switch to the Check Out tab with this session preselected. */
  onCheckedIn: (sessionId: string) => void;
}

interface FeedingUiState {
  mealTime: MealTime;
  foodType: string;
  quantity: string;
  specialInstructions: string;
}

interface CareBlockUiState {
  timeBlock: PartOfDay;
  durationMinutes: number;
  notes: string;
}

interface MedicationUiState {
  name: string;
  dose: string;
  scheduledTimes: string[];
  administrationNotes: string;
}

/**
 * Issue #69: check-in against an existing confirmed Daycare booking looked
 * up for today.
 *
 * Custom change (Daycare/Hotel parity): "make daycare the same as hotel...
 * it will also have cage config, as well as the feeding, medication, walk
 * and playtime (exactly like hotel)". Once a pet is identified, this panel
 * suggests/assigns a cage and captures the same structured feeding/walking/
 * playing/medication instructions Hotel's check-in does - server-side, both
 * write to the same `stays` + care_*_instructions tables and generate the
 * same Care Log entries (see server/src/features/hotel/services/
 * careInstructions.service.ts's exported helpers, reused directly by
 * daycareCheckIn.service.ts). The UI here is intentionally simpler than
 * HotelCheckInPanel's - plain text inputs instead of the catalog-autocomplete
 * CatalogComboBox, no M07 current-prescription pre-fill, and no time-range/
 * duration toggle for walk/play blocks (just a part-of-day select + a
 * minutes field) - the captured data shape is identical either way.
 *
 * Parity follow-up: pre-fills these fields from `booking.hotel_preferences`
 * (CustomerBookingFlowPage's Care Instructions step, extended to Daycare)
 * exactly like HotelCheckInPanel does - see handleSelectBooking.
 *
 * Custom change (walk-in mode removed): this panel previously also offered
 * a "Walk-in" mode - creating a brand-new Daycare session directly against a
 * pet profile, with no booking at all (customer search + pet pick/register
 * inline). Removed: Groomer/Pet Assistant (this page's own viewer roles,
 * narrower than Receptionist's) are meant to physically check in a pet that
 * already has a booking, mirroring Hotel Queue's Check-In tab exactly (which
 * has no walk-in mode either). A genuine walk-in customer is still fully
 * served today - Receptionist creates a same-day booking on their behalf
 * through the normal booking flow (staff can book for a walk-in client),
 * which then simply shows up here to be checked in like any other booking.
 * The server's walk-in check-in path (checkInDaycareSession's pet_id +
 * branch_id branch, no booking_id) is left intact, unused by this UI - see
 * the request that removed this mode if that capability needs a home again.
 */
export function DaycareCheckInPanel({
  accessToken,
  role,
  branchId,
  onCheckedIn,
}: DaycareCheckInPanelProps) {
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const [suggestedCages, setSuggestedCages] = useState<Cage[]>([]);
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);
  const [selectedCageId, setSelectedCageId] = useState<string | null>(null);

  const [feeding, setFeeding] = useState<FeedingUiState[]>([]);
  const [walking, setWalking] = useState<CareBlockUiState[]>([]);
  const [playing, setPlaying] = useState<CareBlockUiState[]>([]);
  const [medications, setMedications] = useState<MedicationUiState[]>([]);
  const [notifyOptIn, setNotifyOptIn] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkedInSessionId, setCheckedInSessionId] = useState<string | null>(
    null
  );

  const petId = selectedBooking?.pet_id;

  function resetCareFields() {
    setSuggestedCages([]);
    setSuggestedSize(null);
    setSelectedCageId(null);
    setFeeding([]);
    setWalking([]);
    setPlaying([]);
    setMedications([]);
    setNotifyOptIn(false);
  }

  function loadCageSuggestion(forPetId: string) {
    void getCageSuggestion(forPetId, accessToken).then((result) => {
      if (result.data) {
        setSuggestedSize(result.data.suggestedSize);
        setSuggestedCages(result.data.availableCages);
        setSelectedCageId(result.data.availableCages[0]?.id ?? null);
      }
    });
  }

  function handleSelectBooking(booking: Booking) {
    setSelectedBooking(booking);
    resetCareFields();
    loadCageSuggestion(booking.pet_id);

    // Pre-fills from whatever was entered at booking time
    // (CustomerBookingFlowPage's "Care Instructions" step, now shown for
    // Daycare too - Custom change: Daycare/Hotel parity follow-up), mirroring
    // HotelCheckInPanel's identical pre-fill. Still just a starting point,
    // freely editable below before it becomes the authoritative record.
    const preferences = booking.hotel_preferences;
    if (!preferences) return;

    if (preferences.feeding.length > 0) {
      setFeeding(
        preferences.feeding.map((item) => ({
          mealTime: item.meal_time,
          foodType: item.food_type,
          quantity: item.quantity,
          specialInstructions: item.special_instructions ?? '',
        }))
      );
    }

    if (preferences.walking.length > 0) {
      setWalking(
        preferences.walking.map((item) => ({
          timeBlock: item.time_block,
          durationMinutes: item.duration_minutes,
          notes: item.notes ?? '',
        }))
      );
    }

    if (preferences.playing.length > 0) {
      setPlaying(
        preferences.playing.map((item) => ({
          timeBlock: item.time_block,
          durationMinutes: item.duration_minutes,
          notes: item.notes ?? '',
        }))
      );
    }

    if (preferences.medications.length > 0) {
      setMedications(
        preferences.medications.map((item) => ({
          name: item.medication_name,
          dose: item.dose,
          scheduledTimes: item.scheduled_times,
          administrationNotes: item.administration_notes ?? '',
        }))
      );
    }
  }

  function addFeeding() {
    setFeeding((prev) => [
      ...prev,
      {
        mealTime: 'Morning',
        foodType: '',
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

  function addCareBlock(setter: typeof setWalking) {
    setter((prev) => [
      ...prev,
      { timeBlock: 'Morning', durationMinutes: 15, notes: '' },
    ]);
  }

  function updateCareBlock(
    setter: typeof setWalking,
    index: number,
    updates: Partial<CareBlockUiState>
  ) {
    setter((prev) =>
      prev.map((block, i) => (i === index ? { ...block, ...updates } : block))
    );
  }

  function removeCareBlock(setter: typeof setWalking, index: number) {
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  function addMedication() {
    setMedications((prev) => [
      ...prev,
      { name: '', dose: '', scheduledTimes: [], administrationNotes: '' },
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

  function validateForm(): string | null {
    for (const [index, state] of feeding.entries()) {
      if (!state.foodType.trim()) {
        return `Feeding time #${index + 1} is missing a food type.`;
      }
      if (!state.quantity.trim()) {
        return `Feeding time #${index + 1} is missing a quantity.`;
      }
    }

    for (const [index, medication] of medications.entries()) {
      if (!medication.name.trim()) {
        return `Medication #${index + 1} is missing a name.`;
      }
      if (!medication.dose.trim()) {
        return `Medication #${index + 1} is missing a dose.`;
      }
    }

    return null;
  }

  async function submitCheckIn() {
    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);
    setBlockedMessage(null);
    setIsSubmitting(true);

    const feedingPayload: FeedingInstructionPayload[] = feeding.map(
      (state) => ({
        meal_time: state.mealTime,
        food_type: state.foodType,
        quantity: state.quantity,
        special_instructions: state.specialInstructions || undefined,
      })
    );

    const walkingPayload: WalkingInstructionPayload[] = walking.map(
      (block) => ({
        time_block: block.timeBlock,
        duration_minutes: block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const playingPayload: PlayingInstructionPayload[] = playing.map(
      (block) => ({
        time_block: block.timeBlock,
        duration_minutes: block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const medicationsPayload: MedicationInstructionPayload[] = medications.map(
      (medication) => ({
        medication_name: medication.name,
        dose: medication.dose,
        scheduled_times: medication.scheduledTimes.map(formatTimeValue),
        administration_notes: medication.administrationNotes || undefined,
      })
    );

    const result = await checkInDaycareSession(accessToken, {
      booking_id: selectedBooking!.id,
      cage_id: selectedCageId ?? undefined,
      feeding: feedingPayload,
      walking: walkingPayload,
      playing: playingPayload,
      medications: medicationsPayload,
      notify_opt_in: notifyOptIn,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      const message = result.error ?? 'Could not check in this pet.';
      // AC-3: a terminal state for the screen, not a retry loop - the
      // message stays until the user picks a different booking.
      if (message.toLowerCase().includes('unavailable after')) {
        setBlockedMessage(message);
      } else {
        setSubmitError(message);
      }
      return;
    }

    setCheckedInSessionId(result.data.id);
  }

  if (checkedInSessionId) {
    return (
      <>
        <p className={styles.successBanner} role="status">
          Pet checked in successfully.
        </p>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onCheckedIn(checkedInSessionId)}
          >
            Go to checkout
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setCheckedInSessionId(null);
              setSelectedBooking(null);
              resetCareFields();
            }}
          >
            Check in another pet
          </button>
        </div>
      </>
    );
  }

  const canSubmit = Boolean(selectedBooking) && Boolean(selectedCageId);

  return (
    <>
      {blockedMessage ? (
        <p className={styles.errorBanner} role="alert">
          {blockedMessage}
        </p>
      ) : null}
      {submitError ? (
        <p className={styles.errorBanner} role="alert">
          {submitError}
        </p>
      ) : null}

      <div className={styles.section}>
        <DaycareBookingPicker
          accessToken={accessToken}
          branchId={branchId}
          onSelect={handleSelectBooking}
          selectedBookingId={selectedBooking?.id ?? null}
        />
      </div>

      {petId ? (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Cage assignment</h2>
            <p className={styles.copy}>
              Suggested size: {suggestedSize ?? '...'} - the recommended cage is
              highlighted below, or pick any other Available cage.
            </p>
            <CageStatusGrid
              accessToken={accessToken}
              viewerRole={role}
              onSelectCage={(cage) => setSelectedCageId(cage.id)}
              selectedCageId={selectedCageId}
              suggestedCageIds={suggestedCages.map((cage) => cage.id)}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Feeding instructions</h2>
            {feeding.map((state, index) => (
              <div key={index} className={styles.instructionBlock}>
                <div className={styles.inlineFields}>
                  <select
                    className={styles.input}
                    aria-label="Meal time"
                    value={state.mealTime}
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
                  <input
                    className={styles.input}
                    placeholder="Food type"
                    value={state.foodType}
                    onChange={(event) =>
                      updateFeeding(index, { foodType: event.target.value })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Quantity"
                    value={state.quantity}
                    onChange={(event) =>
                      updateFeeding(index, { quantity: event.target.value })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Special instructions (optional)"
                    value={state.specialInstructions}
                    onChange={(event) =>
                      updateFeeding(index, {
                        specialInstructions: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeFeeding(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {feeding.length === 0 ? (
              <p className={styles.copy}>No feeding times added.</p>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={addFeeding}
            >
              Add feeding time
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Walking instructions</h2>
            {walking.map((block, index) => (
              <div key={index} className={styles.instructionBlock}>
                <div className={styles.inlineFields}>
                  <select
                    className={styles.input}
                    aria-label="Walk time block"
                    value={block.timeBlock}
                    onChange={(event) =>
                      updateCareBlock(setWalking, index, {
                        timeBlock: event.target.value as PartOfDay,
                      })
                    }
                  >
                    {PARTS_OF_DAY.map((part) => (
                      <option key={part} value={part}>
                        {part}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    aria-label="Walk duration (min)"
                    value={block.durationMinutes}
                    onChange={(event) =>
                      updateCareBlock(setWalking, index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Notes (optional)"
                    value={block.notes}
                    onChange={(event) =>
                      updateCareBlock(setWalking, index, {
                        notes: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeCareBlock(setWalking, index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {walking.length === 0 ? (
              <p className={styles.copy}>No walk times added.</p>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => addCareBlock(setWalking)}
            >
              Add walk time
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Playtime</h2>
            {playing.map((block, index) => (
              <div key={index} className={styles.instructionBlock}>
                <div className={styles.inlineFields}>
                  <select
                    className={styles.input}
                    aria-label="Playtime block"
                    value={block.timeBlock}
                    onChange={(event) =>
                      updateCareBlock(setPlaying, index, {
                        timeBlock: event.target.value as PartOfDay,
                      })
                    }
                  >
                    {PARTS_OF_DAY.map((part) => (
                      <option key={part} value={part}>
                        {part}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.input}
                    type="number"
                    min={1}
                    aria-label="Playtime duration (min)"
                    value={block.durationMinutes}
                    onChange={(event) =>
                      updateCareBlock(setPlaying, index, {
                        durationMinutes: Number(event.target.value),
                      })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Notes (optional)"
                    value={block.notes}
                    onChange={(event) =>
                      updateCareBlock(setPlaying, index, {
                        notes: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeCareBlock(setPlaying, index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {playing.length === 0 ? (
              <p className={styles.copy}>No playtimes added.</p>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => addCareBlock(setPlaying)}
            >
              Add playtime
            </button>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Medications</h2>
            {medications.map((medication, index) => (
              <div key={index} className={styles.instructionBlock}>
                <div className={styles.inlineFields}>
                  <input
                    className={styles.input}
                    placeholder="Medication name"
                    value={medication.name}
                    onChange={(event) =>
                      updateMedication(index, { name: event.target.value })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Dose"
                    value={medication.dose}
                    onChange={(event) =>
                      updateMedication(index, { dose: event.target.value })
                    }
                  />
                  <input
                    className={styles.input}
                    placeholder="Notes (optional)"
                    value={medication.administrationNotes}
                    onChange={(event) =>
                      updateMedication(index, {
                        administrationNotes: event.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => removeMedication(index)}
                  >
                    Remove
                  </button>
                </div>

                <div className={styles.inlineFields}>
                  <span className={styles.copy}>Scheduled times:</span>
                  {medication.scheduledTimes.map((time, timeIndex) => (
                    <div key={timeIndex} className={styles.timeChip}>
                      <TimeInput
                        aria-label={`Medication time ${timeIndex + 1}`}
                        value={time}
                        onChange={(value) =>
                          updateMedicationTime(index, timeIndex, value)
                        }
                      />
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => removeMedicationTime(index, timeIndex)}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => addMedicationTime(index)}
                  >
                    Add time
                  </button>
                </div>
              </div>
            ))}
            {medications.length === 0 ? (
              <p className={styles.copy}>No medications added.</p>
            ) : null}
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={addMedication}
            >
              Add medication
            </button>
          </section>

          <section className={styles.section}>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={notifyOptIn}
                onChange={(event) => setNotifyOptIn(event.target.checked)}
              />
              Owner opted in to pet status notifications for this session
            </label>
          </section>
        </>
      ) : null}

      <button
        type="button"
        className={styles.primaryButton}
        disabled={!canSubmit || isSubmitting}
        onClick={() => void submitCheckIn()}
      >
        {isSubmitting ? 'Checking in...' : 'Check in'}
      </button>
    </>
  );
}
