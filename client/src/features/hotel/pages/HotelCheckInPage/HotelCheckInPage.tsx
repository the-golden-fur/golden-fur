import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { getStaffProfile } from '../../../staff/api/staff.api';
import type { Booking } from '../../../booking/booking.types';
import {
  checkInHotelStay,
  getCageSuggestion,
  getCurrentPrescriptionForPet,
  listFoodCatalog,
  listMedicationCatalog,
} from '../../api/hotel.api';
import { CageStatusGrid } from '../../components/CageStatusGrid/CageStatusGrid';
import { HotelBookingPicker } from '../../components/HotelBookingPicker/HotelBookingPicker';
import {
  CatalogComboBox,
  type CatalogComboBoxValue,
} from '../../components/CatalogComboBox/CatalogComboBox';
import { TimeInput } from '../../components/TimeInput/TimeInput';
import { formatTimeValue } from '../../components/TimeInput/formatTimeValue';
import type {
  Cage,
  FeedingInstructionPayload,
  FoodCatalogItem,
  MealTime,
  MedicationCatalogItem,
  MedicationInstructionPayload,
  WalkingInstructionPayload,
} from '../../hotel.types';
import styles from './HotelCheckInPage.module.css';

const ALLOWED_VIEWER_ROLES = new Set([
  'Receptionist',
  'Admin',
  'Supervisor',
  'Superadmin',
]);

const MEAL_TIMES: MealTime[] = ['Morning', 'Afternoon', 'Evening'];
const EMPTY_COMBO: CatalogComboBoxValue = { catalogId: null, text: '' };

interface FeedingUiState {
  foodType: CatalogComboBoxValue;
  quantity: string;
  specialInstructions: string;
  broughtByCustomer: boolean;
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
  broughtByCustomer: boolean;
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
 * medication instructions, the notification opt-in toggle, and cage size
 * suggestion. Cage assignment and Care Instructions load read-only (the
 * auto-suggested cage plus whatever the booking already captured) - the
 * single `isEditing` toggle (an "Edit"/"Done editing" button at the end of
 * the form) unlocks both together, so a receptionist correcting a customer's
 * mistake doesn't first have to know they need to click something.
 *
 * Food type and medication name use CatalogComboBox - a hybrid dropdown
 * (admin-managed food_catalog/medication_catalog, #79 revision) or freetext
 * fallback that is never written back to the catalog. A "Hotel supplies
 * this (bill customer)" checkbox only appears once a catalog item is
 * actually selected, since a freetext value has no known price to charge -
 * checking it bills the catalog item's price to the stay at checkout
 * (checkout.service.ts's supplied_items_charge).
 *
 * Walking accepts either a time range (start + end) or a start + duration,
 * toggled per block; medication scheduled times are a list of time chips.
 * Both use TimeInput - a native <input type="time"> plus a quick-pick
 * preset dropdown.
 */
export function HotelCheckInPage() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();

  const [roleStatus, setRoleStatus] = useState<'loading' | 'ok' | 'denied'>(
    'loading'
  );
  const [role, setRole] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const [suggestedCages, setSuggestedCages] = useState<Cage[]>([]);
  const [suggestedSize, setSuggestedSize] = useState<string | null>(null);
  const [selectedCageId, setSelectedCageId] = useState<string | null>(null);

  const [foodCatalog, setFoodCatalog] = useState<FoodCatalogItem[]>([]);
  const [medicationCatalog, setMedicationCatalog] = useState<
    MedicationCatalogItem[]
  >([]);

  const [feeding, setFeeding] = useState<
    Record<MealTime, FeedingUiState | null>
  >({
    Morning: null,
    Afternoon: null,
    Evening: null,
  });
  const [walking, setWalking] = useState<WalkBlockUi[]>([]);
  const [medications, setMedications] = useState<MedicationUiState[]>([]);
  const [notifyOptIn, setNotifyOptIn] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [checkedInStayId, setCheckedInStayId] = useState<string | null>(null);

  // Cage assignment and Care Instructions load read-only (the auto-suggested
  // cage plus whatever the booking already captured) - a single "Edit"
  // toggle unlocks both together, so the receptionist can correct a mistake
  // without every check-in requiring a click first.
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!accessToken || !user?.id) return;

    let isMounted = true;

    void getStaffProfile(user.id, accessToken).then((result) => {
      if (!isMounted) return;

      if (result.data) {
        setRoleStatus(
          ALLOWED_VIEWER_ROLES.has(result.data.role) ? 'ok' : 'denied'
        );
        setRole(result.data.role);
        setBranchId(result.data.branch_id);
      } else {
        setRoleStatus('denied');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    if (!accessToken) return;

    void listFoodCatalog(accessToken).then((result) => {
      if (result.data)
        setFoodCatalog(result.data.filter((item) => item.is_active));
    });

    void listMedicationCatalog(accessToken).then((result) => {
      if (result.data) {
        setMedicationCatalog(result.data.filter((item) => item.is_active));
      }
    });
  }, [accessToken]);

  function handleSelectBooking(booking: Booking) {
    if (!accessToken) return;

    setSelectedBooking(booking);
    setSelectedCageId(null);
    setFeeding({ Morning: null, Afternoon: null, Evening: null });
    setWalking([]);
    setMedications([]);
    setIsEditing(false);

    // Pre-fills from whatever the customer/receptionist entered at booking
    // time (CustomerBookingFlowPage's "Care Instructions" step), so this
    // form doesn't start blank - still just a starting point, freely
    // editable below before it becomes the authoritative record.
    const preferences = booking.hotel_preferences;

    if (preferences) {
      if (preferences.feeding.length > 0) {
        setFeeding((prev) => {
          const next = { ...prev };
          for (const item of preferences.feeding) {
            next[item.meal_time] = {
              // Carries the staff booking flow's catalog match through when
              // present (its Care Instructions step now uses the same
              // catalog), instead of always discarding it as freetext - the
              // customer portal never captures catalog_id, so this still
              // falls back to freetext exactly as before for those bookings.
              foodType: {
                catalogId: item.food_catalog_id ?? null,
                text: item.food_type,
              },
              quantity: item.quantity,
              specialInstructions: item.special_instructions ?? '',
              broughtByCustomer: item.brought_by_customer ?? true,
            };
          }
          return next;
        });
      }

      if (preferences.walking.length > 0) {
        setWalking(
          preferences.walking.map((item) => ({
            mode: 'duration',
            startTime: item.time_block,
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
            broughtByCustomer: item.brought_by_customer ?? true,
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
              broughtByCustomer: true,
            })
          );

          // Prepended, not replaced - a booking-time preference entered
          // above (synchronously) must survive this later-resolving fetch.
          setMedications((prev) => [...prescriptionMedications, ...prev]);
        }
      }
    );
  }

  function toggleMealTime(mealTime: MealTime) {
    setFeeding((prev) => ({
      ...prev,
      [mealTime]: prev[mealTime]
        ? null
        : {
            foodType: EMPTY_COMBO,
            quantity: '',
            specialInstructions: '',
            broughtByCustomer: true,
          },
    }));
  }

  function updateFeeding(mealTime: MealTime, updates: Partial<FeedingUiState>) {
    setFeeding((prev) => {
      const current = prev[mealTime];
      if (!current) return prev;
      return { ...prev, [mealTime]: { ...current, ...updates } };
    });
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

  function addMedication() {
    setMedications((prev) => [
      ...prev,
      {
        name: EMPTY_COMBO,
        dose: '',
        scheduledTimes: [],
        administrationNotes: '',
        broughtByCustomer: true,
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

  // #79 revision: additional-charges live total, so "hotel supplies this"
  // checkboxes have a visible aggregate instead of only a per-item note
  // easy to miss - fixes "price not being calculated" (it was calculated,
  // just never summed/surfaced anywhere).
  const additionalChargesTotal = useMemo(() => {
    let total = 0;

    for (const state of Object.values(feeding)) {
      if (!state?.foodType.catalogId || state.broughtByCustomer) continue;
      total +=
        foodCatalog.find((item) => item.id === state.foodType.catalogId)
          ?.price ?? 0;
    }

    for (const medication of medications) {
      if (!medication.name.catalogId || medication.broughtByCustomer) continue;
      total +=
        medicationCatalog.find((item) => item.id === medication.name.catalogId)
          ?.price ?? 0;
    }

    return total;
  }, [feeding, medications, foodCatalog, medicationCatalog]);

  /**
   * #79 revision: catches incomplete rows before they ever reach the
   * server, so a checked meal time with no food type/quantity (etc.)
   * surfaces a specific, actionable message instead of the API's generic
   * "Invalid payload" 400.
   */
  function validateForm(): string | null {
    for (const mealTime of MEAL_TIMES) {
      const state = feeding[mealTime];
      if (!state) continue;
      if (!state.foodType.text.trim()) {
        return `${mealTime} feeding is missing a food type.`;
      }
      if (!state.quantity.trim()) {
        return `${mealTime} feeding is missing a quantity.`;
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
    if (!accessToken || !selectedBooking || !selectedCageId) return;

    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    const feedingPayload: FeedingInstructionPayload[] = Object.entries(feeding)
      .filter((entry): entry is [MealTime, FeedingUiState] => entry[1] !== null)
      .map(([mealTime, state]) => ({
        meal_time: mealTime,
        food_type: state.foodType.text,
        quantity: state.quantity,
        special_instructions: state.specialInstructions || undefined,
        food_catalog_id: state.foodType.catalogId ?? undefined,
        brought_by_customer: state.foodType.catalogId
          ? state.broughtByCustomer
          : true,
      }));

    const walkingPayload: WalkingInstructionPayload[] = walking.map(
      (block) => ({
        time_block: formatTimeValue(block.startTime),
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
        brought_by_customer: medication.name.catalogId
          ? medication.broughtByCustomer
          : true,
      })
    );

    const result = await checkInHotelStay(accessToken, {
      booking_id: selectedBooking.id,
      cage_id: selectedCageId,
      feeding: feedingPayload,
      walking: walkingPayload,
      medications: medicationsPayload,
      notify_opt_in: notifyOptIn,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setSubmitError(result.error ?? 'Could not check in this pet.');
      return;
    }

    setCheckedInStayId(result.data.stay.id);
  }

  if (!user?.id || !accessToken) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.errorBanner} role="alert">
            Unable to load Hotel check-in.
          </p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <p className={styles.copy}>Loading...</p>
        </div>
      </main>
    );
  }

  if (roleStatus === 'denied') {
    return <Navigate to="/staff/settings" replace />;
  }

  if (checkedInStayId) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <h1 className={styles.title}>Hotel Check-in</h1>
          <p className={styles.successBanner} role="status">
            Pet checked in successfully.
          </p>
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() =>
                navigate(`/staff/hotel/checkout/${checkedInStayId}`)
              }
            >
              Go to checkout
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setCheckedInStayId(null);
                setSelectedBooking(null);
                setFeeding({ Morning: null, Afternoon: null, Evening: null });
                setWalking([]);
                setMedications([]);
                setNotifyOptIn(false);
              }}
            >
              Check in another pet
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <h1 className={styles.title}>Hotel Check-in</h1>

        {submitError ? (
          <p className={styles.errorBanner} role="alert">
            {submitError}
          </p>
        ) : null}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>1. Select a confirmed booking</h2>
          {branchId ? (
            <HotelBookingPicker
              accessToken={accessToken!}
              branchId={branchId}
              onSelect={handleSelectBooking}
              selectedBookingId={selectedBooking?.id ?? null}
            />
          ) : null}
        </section>

        {selectedBooking ? (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>2. Cage assignment</h2>
              <p className={styles.copy}>
                Suggested size: {suggestedSize ?? '...'} - the recommended cage
                is highlighted below, or pick any other Available cage.
              </p>
              {branchId && role ? (
                <CageStatusGrid
                  accessToken={accessToken}
                  viewerRole={role}
                  onSelectCage={
                    isEditing ? (cage) => setSelectedCageId(cage.id) : undefined
                  }
                  selectedCageId={selectedCageId}
                  suggestedCageIds={suggestedCages.map((cage) => cage.id)}
                />
              ) : null}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>3. Feeding instructions</h2>
              {!isEditing ? (
                <p className={styles.copy}>
                  Read-only - captured from the customer's booking. Click Edit
                  below to correct a mistake.
                </p>
              ) : null}
              {MEAL_TIMES.map((mealTime) => {
                const state = feeding[mealTime];

                return (
                  <div key={mealTime} className={styles.instructionRow}>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={state !== null}
                        disabled={!isEditing}
                        onChange={() => toggleMealTime(mealTime)}
                      />
                      {mealTime}
                    </label>
                    {state ? (
                      <div className={styles.instructionBlock}>
                        <div className={styles.inlineFields}>
                          <CatalogComboBox
                            items={foodCatalog}
                            value={state.foodType}
                            placeholder="Food type - search or type a custom value..."
                            disabled={!isEditing}
                            onChange={(next) =>
                              updateFeeding(mealTime, {
                                foodType: next,
                                // A fresh catalog match defaults to "customer
                                // brought it" until explicitly unchecked.
                                broughtByCustomer: next.catalogId
                                  ? true
                                  : state.broughtByCustomer,
                              })
                            }
                          />
                          <input
                            className={styles.input}
                            placeholder="Quantity"
                            value={state.quantity}
                            disabled={!isEditing}
                            onChange={(event) =>
                              updateFeeding(mealTime, {
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
                              updateFeeding(mealTime, {
                                specialInstructions: event.target.value,
                              })
                            }
                          />
                        </div>
                        {state.foodType.catalogId ? (
                          <label className={styles.checkboxRow}>
                            <input
                              type="checkbox"
                              checked={!state.broughtByCustomer}
                              disabled={!isEditing}
                              onChange={(event) =>
                                updateFeeding(mealTime, {
                                  broughtByCustomer: !event.target.checked,
                                })
                              }
                            />
                            Hotel supplies this (bill customer PHP{' '}
                            {foodCatalog
                              .find(
                                (item) => item.id === state.foodType.catalogId
                              )
                              ?.price.toFixed(2)}
                            )
                          </label>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>4. Walking instructions</h2>
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
                        block.mode === 'duration'
                          ? styles.tabActive
                          : styles.tab
                      }
                      disabled={!isEditing}
                      onClick={() =>
                        updateWalkBlock(index, { mode: 'duration' })
                      }
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
                        <span className={styles.fieldGroupLabel}>
                          Duration (min)
                        </span>
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
                      <span className={styles.fieldGroupLabel}>
                        Notes (optional)
                      </span>
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
              <h2 className={styles.sectionTitle}>5. Medications</h2>
              {medications.map((medication, index) => (
                <div key={index} className={styles.instructionBlock}>
                  <div className={styles.inlineFields}>
                    <CatalogComboBox
                      items={medicationCatalog}
                      value={medication.name}
                      placeholder="Medication name - search or type a custom value..."
                      disabled={!isEditing}
                      onChange={(next) =>
                        updateMedication(index, {
                          name: next,
                          broughtByCustomer: next.catalogId
                            ? true
                            : medication.broughtByCustomer,
                        })
                      }
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

                  {medication.name.catalogId ? (
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={!medication.broughtByCustomer}
                        disabled={!isEditing}
                        onChange={(event) =>
                          updateMedication(index, {
                            broughtByCustomer: !event.target.checked,
                          })
                        }
                      />
                      Hotel supplies this (bill customer PHP{' '}
                      {medicationCatalog
                        .find((item) => item.id === medication.name.catalogId)
                        ?.price.toFixed(2)}
                      )
                    </label>
                  ) : null}

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
                            onClick={() =>
                              removeMedicationTime(index, timeIndex)
                            }
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

            <section className={styles.section}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={notifyOptIn}
                  onChange={(event) => setNotifyOptIn(event.target.checked)}
                />
                Owner opted in to pet status notifications for this stay
              </label>
            </section>

            <p className={styles.chargesTotal}>
              Estimated additional charges (hotel-supplied items, billed at
              checkout):{' '}
              <strong>PHP {additionalChargesTotal.toFixed(2)}</strong>
            </p>

            <button
              type="button"
              className={styles.secondaryButton}
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
        ) : null}
      </div>
    </main>
  );
}
