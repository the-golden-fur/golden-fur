import { useEffect, useState } from 'react';
import type { Booking } from '../../../booking/booking.types';
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
  /** Daycare Queue redesign: the booking picker now lives on the queue list
   * itself (a real row-click navigation to DaycareCheckInFormPage), so this
   * panel always has an already-selected booking to work with rather than
   * owning its own picker/selection state - mirrors HotelCheckInPanel. */
  booking: Booking;
  /** Fires once the pet has been checked in - DaycareCheckInFormPage
   * navigates back to the queue on this. */
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

/** Pre-fills from whatever was entered at booking time
 * (CustomerBookingFlowPage's Care Instructions step) - still just a starting
 * point, freely editable below before it becomes the authoritative record.
 * Mirrors HotelCheckInPanel's own initialFeeding/initialWalking/etc, minus
 * the CatalogComboBox/prescription-prefill parts this simpler panel never
 * had (see the file-level comment below). */
function initialFeeding(booking: Booking): FeedingUiState[] {
  return (booking.hotel_preferences?.feeding ?? []).map((item) => ({
    mealTime: item.meal_time,
    foodType: item.food_type,
    quantity: item.quantity,
    specialInstructions: item.special_instructions ?? '',
  }));
}

function initialCareBlocks(
  items: { time_block: PartOfDay; duration_minutes: number; notes?: string }[]
): CareBlockUiState[] {
  return items.map((item) => ({
    timeBlock: item.time_block,
    durationMinutes: item.duration_minutes,
    notes: item.notes ?? '',
  }));
}

function initialMedications(booking: Booking): MedicationUiState[] {
  return (booking.hotel_preferences?.medications ?? []).map((item) => ({
    name: item.medication_name,
    dose: item.dose,
    scheduledTimes: item.scheduled_times,
    administrationNotes: item.administration_notes ?? '',
  }));
}

/**
 * Issue #69: check-in against an existing confirmed Daycare booking.
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
 * Daycare Queue redesign: this used to own a DaycareBookingPicker and let
 * staff pick which booking to check in inline; it's now a routed page
 * (DaycareCheckInFormPage, /staff/daycare/queue/check-in/:bookingId) reached
 * by clicking a Pending row on the queue, mirroring HotelCheckInPanel's own
 * identical change - so this panel always receives its one `booking` as a
 * prop instead of resolving it itself.
 */
export function DaycareCheckInPanel({
  accessToken,
  role,
  booking,
  onCheckedIn,
}: DaycareCheckInPanelProps) {
  const [suggestedCages, setSuggestedCages] = useState<Cage[]>([]);
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);
  const [selectedCageId, setSelectedCageId] = useState<string | null>(null);

  const [feeding, setFeeding] = useState<FeedingUiState[]>(() =>
    initialFeeding(booking)
  );
  const [walking, setWalking] = useState<CareBlockUiState[]>(() =>
    initialCareBlocks(booking.hotel_preferences?.walking ?? [])
  );
  const [playing, setPlaying] = useState<CareBlockUiState[]>(() =>
    initialCareBlocks(booking.hotel_preferences?.playing ?? [])
  );
  const [medications, setMedications] = useState<MedicationUiState[]>(() =>
    initialMedications(booking)
  );
  const [notifyOptIn, setNotifyOptIn] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Runs once for this page's one booking - the parent DaycareCheckInFormPage
  // keys this panel by booking.id, so a different booking is a fresh mount,
  // not a re-render of this one (mirrors HotelCheckInPanel's identical
  // cage-suggestion effect).
  useEffect(() => {
    void getCageSuggestion(booking.pet_id, accessToken).then((result) => {
      if (result.data) {
        setSuggestedSize(result.data.suggestedSize);
        setSuggestedCages(result.data.availableCages);
        setSelectedCageId(result.data.availableCages[0]?.id ?? null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

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
      booking_id: booking.id,
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
      // AC-3: a terminal state for the screen, not a retry loop.
      if (message.toLowerCase().includes('unavailable after')) {
        setBlockedMessage(message);
      } else {
        setSubmitError(message);
      }
      return;
    }

    onCheckedIn(result.data.id);
  }

  const canSubmit = Boolean(selectedCageId);

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
