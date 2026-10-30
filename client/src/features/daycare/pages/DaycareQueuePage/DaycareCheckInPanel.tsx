import { useEffect, useState } from 'react';
import type { Booking } from '../../../booking/booking.types';
import { checkInDaycareSession } from '../../api/daycare.api';
import { getCageSuggestion } from '../../../hotel/api/hotel.api';
import { CageStatusGrid } from '../../../hotel/components/CageStatusGrid/CageStatusGrid';
import { ConfirmDialog } from '../../../../shared/components/ConfirmDialog/ConfirmDialog';
import {
  describeCageSizeMismatch,
  getCageSizeFit,
  isCageSizeMismatch,
} from '../../../../shared/utils/cageSizeFit';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import { formatTimeValue } from '../../../hotel/components/TimeInput/formatTimeValue';
import type {
  Cage,
  FeedingInstructionPayload,
  FoodQuantityUnit,
  MedicationDoseUnit,
  MedicationInstructionPayload,
  PlayingInstructionPayload,
  WalkingInstructionPayload,
} from '../../../hotel/hotel.types';
import {
  createFoodItem,
  createMedicationItem,
  listPickableFoodItems,
  listPickableMedicationItems,
} from '../../../staffItems/api/staffItems.api';
import { StaffItemPicker } from '../../../staffItems/components/StaffItemPicker/StaffItemPicker';
import type {
  PickableStaffFoodItem,
  PickableStaffMedicationItem,
} from '../../../staffItems/staffItems.types';
import styles from './DaycareCheckInPanel.module.css';

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
  // Custom change (Daycare-only clock-time scheduling): a literal "HH:MM"
  // instead of Hotel's Morning/Noon/Afternoon/Evening meal_time - a few-hour
  // Daycare visit needs an actual drop-off/feeding time, not a day period.
  scheduledTime: string;
  foodType: string;
  quantity: string;
  quantityUnit?: FoodQuantityUnit;
  photoUrl?: string;
  specialInstructions: string;
  /** Set when this row was populated from a staff library item (see
   * addFeedingRowFromItem) - the "save to my private library" checkbox
   * only renders when this is null. */
  fromLibraryItemId: string | null;
  saveToLibrary: boolean;
}

interface CareBlockUiState {
  // Custom change (Daycare-only clock-time scheduling): same as
  // FeedingUiState.scheduledTime above, replacing Hotel's time_block.
  scheduledTime: string;
  durationMinutes: number;
  notes: string;
}

interface MedicationUiState {
  name: string;
  dose: string;
  doseUnit?: MedicationDoseUnit;
  photoUrl?: string;
  scheduledTimes: string[];
  administrationNotes: string;
  fromLibraryItemId: string | null;
  saveToLibrary: boolean;
}

/** Pre-fills from whatever was entered at booking time
 * (CustomerBookingFlowPage's Care Instructions step) - still just a starting
 * point, freely editable below before it becomes the authoritative record.
 * Mirrors HotelCheckInPanel's own initialFeeding/initialWalking/etc, minus
 * the CatalogComboBox/prescription-prefill parts this simpler panel never
 * had (see the file-level comment below). */
function initialFeeding(booking: Booking): FeedingUiState[] {
  return (booking.hotel_preferences?.feeding ?? []).map((item) => ({
    scheduledTime: item.scheduled_time ?? '08:00',
    foodType: item.food_type,
    quantity: item.quantity,
    // Custom change (care instruction units + photos): no unit-picker/photo
    // upload UI on this panel - carried through unedited so check-in doesn't
    // silently drop what the customer specified.
    quantityUnit: item.quantity_unit,
    photoUrl: item.photo_url,
    specialInstructions: item.special_instructions ?? '',
    fromLibraryItemId: null,
    saveToLibrary: false,
  }));
}

function initialCareBlocks(
  items: { scheduled_time?: string; duration_minutes: number; notes?: string }[]
): CareBlockUiState[] {
  return items.map((item) => ({
    scheduledTime: item.scheduled_time ?? '08:00',
    durationMinutes: item.duration_minutes,
    notes: item.notes ?? '',
  }));
}

function initialMedications(booking: Booking): MedicationUiState[] {
  return (booking.hotel_preferences?.medications ?? []).map((item) => ({
    name: item.medication_name,
    dose: item.dose,
    // Custom change (care instruction units + photos): pass-through only,
    // see the feeding pre-fill's dev note above.
    doseUnit: item.dose_unit,
    photoUrl: item.photo_url,
    scheduledTimes: item.scheduled_times,
    administrationNotes: item.administration_notes ?? '',
    fromLibraryItemId: null,
    saveToLibrary: false,
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
 * duration toggle for walk/play blocks (just a clock-time input + a minutes
 * field). Custom change (Daycare-only clock-time scheduling): feeding/
 * walking/playing all take a literal scheduled_time here instead of Hotel's
 * Morning/Noon/Afternoon/Evening enum - a few-hour Daycare visit needs an
 * actual time, not a day period - medication is unaffected either way,
 * since it already used literal clock times for both categories.
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
  // The whole cage, not just its id - its size/label are what the
  // wrong-size warning popup below compares against the pet's own size.
  const [selectedCage, setSelectedCage] = useState<Cage | null>(null);
  const selectedCageId = selectedCage?.id ?? null;
  const [isSizeWarningOpen, setIsSizeWarningOpen] = useState(false);

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

  const [pickableFoodItems, setPickableFoodItems] = useState<
    PickableStaffFoodItem[]
  >([]);
  const [pickableMedicationItems, setPickableMedicationItems] = useState<
    PickableStaffMedicationItem[]
  >([]);

  // Staff-owned food/medication item library (first time this panel gets
  // any catalog picker) - the caller's own items (any visibility) plus
  // everyone else's public ones, mirrors HotelCheckInPanel's identical
  // effect.
  useEffect(() => {
    let isMounted = true;

    void listPickableFoodItems(accessToken).then((result) => {
      if (isMounted && result.data) setPickableFoodItems(result.data);
    });
    void listPickableMedicationItems(accessToken).then((result) => {
      if (isMounted && result.data) setPickableMedicationItems(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  // Runs once for this page's one booking - the parent DaycareCheckInFormPage
  // keys this panel by booking.id, so a different booking is a fresh mount,
  // not a re-render of this one (mirrors HotelCheckInPanel's identical
  // cage-suggestion effect).
  useEffect(() => {
    void getCageSuggestion(booking.pet_id, accessToken).then((result) => {
      if (result.data) {
        setSuggestedSize(result.data.suggestedSize);
        setSuggestedCages(result.data.availableCages);
        setSelectedCage(result.data.availableCages[0] ?? null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id]);

  // Feeding defaults to the customer's own booking-time entry, but staff can
  // now edit/add/remove rows at check-in the same way Walking/Playtime
  // already could - their edits become the final list sent on submit.
  function addFeedingRow() {
    setFeeding((prev) => [
      ...prev,
      {
        scheduledTime: '08:00',
        foodType: '',
        quantity: '',
        specialInstructions: '',
        fromLibraryItemId: null,
        saveToLibrary: false,
      },
    ]);
  }

  /** Picked from the staff library (StaffItemPicker) - copies the item's
   * field values into a new row, same as typing them. */
  function addFeedingRowFromItem(item: PickableStaffFoodItem) {
    setFeeding((prev) => [
      ...prev,
      {
        scheduledTime: '08:00',
        foodType: item.name,
        quantity: item.quantity,
        quantityUnit: item.quantity_unit ?? undefined,
        photoUrl: item.photo_url ?? undefined,
        specialInstructions: item.special_instructions ?? '',
        fromLibraryItemId: item.id,
        saveToLibrary: false,
      },
    ]);
  }

  function updateFeeding(index: number, updates: Partial<FeedingUiState>) {
    setFeeding((prev) =>
      prev.map((state, i) => (i === index ? { ...state, ...updates } : state))
    );
  }

  function removeFeedingRow(index: number) {
    setFeeding((prev) => prev.filter((_, i) => i !== index));
  }

  function addCareBlock(setter: typeof setWalking) {
    setter((prev) => [
      ...prev,
      { scheduledTime: '08:00', durationMinutes: 15, notes: '' },
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

  // Medications defaults to the customer's own booking-time entry, but staff
  // can now edit/add/remove medications and scheduled times at check-in,
  // same as Feeding above.
  function addMedication() {
    setMedications((prev) => [
      ...prev,
      {
        name: '',
        dose: '',
        scheduledTimes: [],
        administrationNotes: '',
        fromLibraryItemId: null,
        saveToLibrary: false,
      },
    ]);
  }

  /** Picked from the staff library (StaffItemPicker) - mirrors
   * addFeedingRowFromItem above. */
  function addMedicationFromItem(item: PickableStaffMedicationItem) {
    setMedications((prev) => [
      ...prev,
      {
        name: item.name,
        dose: item.dose,
        doseUnit: item.dose_unit ?? undefined,
        photoUrl: item.photo_url ?? undefined,
        scheduledTimes: [],
        administrationNotes: item.administration_notes ?? '',
        fromLibraryItemId: item.id,
        saveToLibrary: false,
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

  function addMedicationTime(medicationIndex: number) {
    setMedications((prev) =>
      prev.map((medication, i) =>
        i === medicationIndex
          ? {
              ...medication,
              scheduledTimes: [...medication.scheduledTimes, '07:00'],
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
        scheduled_time: state.scheduledTime,
        food_type: state.foodType,
        quantity: state.quantity,
        quantity_unit: state.quantityUnit,
        photo_url: state.photoUrl,
        special_instructions: state.specialInstructions || undefined,
      })
    );

    const walkingPayload: WalkingInstructionPayload[] = walking.map(
      (block) => ({
        scheduled_time: block.scheduledTime,
        duration_minutes: block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const playingPayload: PlayingInstructionPayload[] = playing.map(
      (block) => ({
        scheduled_time: block.scheduledTime,
        duration_minutes: block.durationMinutes,
        notes: block.notes || undefined,
      })
    );

    const medicationsPayload: MedicationInstructionPayload[] = medications.map(
      (medication) => ({
        medication_name: medication.name,
        dose: medication.dose,
        dose_unit: medication.doseUnit,
        photo_url: medication.photoUrl,
        scheduled_times: medication.scheduledTimes.map(formatTimeValue),
        administration_notes: medication.administrationNotes || undefined,
      })
    );

    // Follow-up: "save to my private library" - fire-and-forget alongside
    // the real check-in, never blocking or failing it on a library-save
    // error.
    for (const state of feeding) {
      if (state.saveToLibrary) {
        void createFoodItem(
          {
            name: state.foodType,
            quantity: state.quantity,
            quantity_unit: state.quantityUnit,
            special_instructions: state.specialInstructions || undefined,
            is_public: false,
          },
          accessToken
        );
      }
    }
    for (const medication of medications) {
      if (medication.saveToLibrary) {
        void createMedicationItem(
          {
            name: medication.name,
            dose: medication.dose,
            dose_unit: medication.doseUnit,
            administration_notes: medication.administrationNotes || undefined,
            is_public: false,
          },
          accessToken
        );
      }
    }

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

  // Staff may knowingly use a different-size cage (e.g. the pet's own size
  // is full), so a mismatch asks for confirmation instead of blocking.
  const selectedCageFit = getCageSizeFit(suggestedSize, selectedCage?.size);

  function handleCheckInClick() {
    if (isCageSizeMismatch(selectedCageFit)) {
      setIsSizeWarningOpen(true);
      return;
    }

    void submitCheckIn();
  }

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
          onSelectCage={(cage) => setSelectedCage(cage)}
          selectedCageId={selectedCageId}
          suggestedCageIds={suggestedCages.map((cage) => cage.id)}
          petSize={suggestedSize}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Feeding instructions</h2>
        {feeding.map((state, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.inlineFields}>
              <TimeInput
                aria-label="Feeding time"
                value={state.scheduledTime}
                onChange={(value) =>
                  updateFeeding(index, { scheduledTime: value })
                }
              />
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
                onClick={() => removeFeedingRow(index)}
              >
                Remove
              </button>
            </div>
            {state.fromLibraryItemId === null ? (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={state.saveToLibrary}
                  onChange={(event) =>
                    updateFeeding(index, {
                      saveToLibrary: event.target.checked,
                    })
                  }
                />
                Save to my private library
              </label>
            ) : null}
          </div>
        ))}
        {feeding.length === 0 ? (
          <p className={styles.copy}>No feeding times added.</p>
        ) : null}
        <div className={styles.inlineFields}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addFeedingRow}
          >
            Add feeding time
          </button>
          <StaffItemPicker
            items={pickableFoodItems}
            onPick={addFeedingRowFromItem}
            placeholder="Add from my food library..."
            aria-label="Add feeding time from library"
          />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Walking instructions</h2>
        {walking.map((block, index) => (
          <div key={index} className={styles.instructionBlock}>
            <div className={styles.inlineFields}>
              <TimeInput
                aria-label="Walk time"
                value={block.scheduledTime}
                onChange={(value) =>
                  updateCareBlock(setWalking, index, { scheduledTime: value })
                }
              />
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
              <TimeInput
                aria-label="Playtime start"
                value={block.scheduledTime}
                onChange={(value) =>
                  updateCareBlock(setPlaying, index, { scheduledTime: value })
                }
              />
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
                    Remove
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
            {medication.fromLibraryItemId === null ? (
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={medication.saveToLibrary}
                  onChange={(event) =>
                    updateMedication(index, {
                      saveToLibrary: event.target.checked,
                    })
                  }
                />
                Save to my private library
              </label>
            ) : null}
          </div>
        ))}
        {medications.length === 0 ? (
          <p className={styles.copy}>No medications added.</p>
        ) : null}
        <div className={styles.inlineFields}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={addMedication}
          >
            Add medication
          </button>
          <StaffItemPicker
            items={pickableMedicationItems}
            onPick={addMedicationFromItem}
            placeholder="Add from my medication library..."
            aria-label="Add medication from library"
          />
        </div>
      </section>

      {booking.hotel_preferences?.things_brought ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Things brought</h2>
          <p className={styles.copy}>
            {booking.hotel_preferences.things_brought}
          </p>
        </section>
      ) : null}

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
        onClick={handleCheckInClick}
      >
        {isSubmitting ? 'Checking in...' : 'Check in'}
      </button>

      <ConfirmDialog
        isOpen={isSizeWarningOpen}
        title="Cage size doesn't match"
        body={
          selectedCage && suggestedSize && isCageSizeMismatch(selectedCageFit)
            ? describeCageSizeMismatch(
                selectedCageFit,
                suggestedSize,
                selectedCage.cage_label,
                selectedCage.size
              )
            : null
        }
        confirmLabel="Check in anyway"
        cancelLabel="Choose another cage"
        onConfirm={() => {
          setIsSizeWarningOpen(false);
          void submitCheckIn();
        }}
        onCancel={() => setIsSizeWarningOpen(false)}
      />
    </>
  );
}
