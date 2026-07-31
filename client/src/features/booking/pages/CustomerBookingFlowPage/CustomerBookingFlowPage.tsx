import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../../../shared/auth/providers/AuthProvider/useAuth';
import { listCustomerPets } from '../../../customers/api/customer.api';
import type { CustomerProfile, Pet } from '../../../customers/customer.types';
import { PetForm } from '../../../customers/components/forms/PetForm/PetForm';
import { CustomerPicker } from '../../components/CustomerPicker/CustomerPicker';
import { listBranches } from '../../../maintenance/api/maintenance.api';
import type {
  BranchSummary,
  Package,
  Promo,
  Service,
} from '../../../maintenance/maintenance.types';
import { BookingStepper } from '../../components/BookingStepper/BookingStepper';
import { SlotPicker } from '../../components/SlotPicker/SlotPicker';
import { StaffPickerList } from '../../components/StaffPickerList/StaffPickerList';
import { PayMongoFeeNotice } from '../../components/PayMongoFeeNotice/PayMongoFeeNotice';
import { createBooking, getBookingCatalog } from '../../api/booking.api';
import {
  PAYMENT_METHODS,
  SERVICE_CATEGORIES,
  type Booking,
  type HotelBookingPreferenceFeeding,
  type HotelBookingPreferenceMedication,
  type HotelBookingPreferenceWalking,
  type PaymentMethod,
  type ServiceCategory,
  type StaffPreferenceInput,
} from '../../booking.types';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import { CatalogComboBox } from '../../../catalog/components/CatalogComboBox/CatalogComboBox';
import {
  listFoodCatalog,
  listMedicationCatalog,
} from '../../../hotel/api/hotel.api';
import type {
  FoodCatalogItem,
  MedicationCatalogItem,
} from '../../../hotel/hotel.types';
import styles from './CustomerBookingFlowPage.module.css';

const ONLINE_METHODS = new Set<PaymentMethod>(['GCash', 'Maya']);
const HOTEL_DOWNPAYMENT_RATE = 0.5;

const PET_TYPE_LABEL: Record<Pet['pet_type'], string> = {
  Dog: 'Dog',
  Cat: 'Cat',
};

const WEIGHT_CLASS_LABEL: Record<Pet['weight_class'], string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'XL',
};

const COAT_TYPE_LABEL: Record<Pet['coat_type'], string> = {
  SC: 'Short coat',
  LC: 'Long coat',
};

/**
 * Hotel service/package names are freetext (e.g. "Hotel Stay - Medium Cage")
 * with no dedicated size column (maintenance.types.ts's Service has none) -
 * this mirrors the S/M/L/XL vocabulary those names are seeded with so the
 * Service step can flag which cage size actually matches the selected pet,
 * instead of leaving a small pet able to pick a Large/XL cage (or vice
 * versa) with no guidance at all.
 */
function deriveHotelCageSize(serviceName: string): Pet['weight_class'] | null {
  const lower = serviceName.toLowerCase();
  if (lower.includes('xl')) return 'XL';
  if (lower.includes('large')) return 'L';
  if (lower.includes('medium')) return 'M';
  if (lower.includes('small')) return 'S';
  return null;
}

interface SupplierChoiceProps {
  /** Unique per feeding/medication row so each row's two radios form their
   * own group instead of fighting over a single page-wide selection. */
  radioGroup: string;
  broughtByCustomer: boolean;
  /** Purely client-side for medications (a units-to-purchase count, distinct
   * from dose) - never sent in the submitted payload, so it only drives this
   * on-screen estimate. */
  quantity?: string;
  catalogItem: { price: number } | undefined;
  onChange: (broughtByCustomer: boolean) => void;
}

/**
 * Staff-view-only supplier choice for a catalog-matched feeding/medication
 * row - the user's ask was specifically for a radio button (HotelCheckInPage
 * uses a single checkbox for the same boolean; a two-option radio group reads
 * more clearly here). Shows a price x quantity estimate only when the staff
 * will purchase it - HotelCheckInPage itself doesn't compute this today, so
 * this is a new estimate, not a copy of existing behavior.
 */
function SupplierChoice({
  radioGroup,
  broughtByCustomer,
  quantity,
  catalogItem,
  onChange,
}: SupplierChoiceProps) {
  const parsedQuantity = Number(quantity);
  const estimate =
    catalogItem &&
    quantity &&
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0
      ? catalogItem.price * parsedQuantity
      : catalogItem?.price;

  return (
    <div className={styles.supplierChoice}>
      <label className={styles.radioOption}>
        <input
          type="radio"
          name={radioGroup}
          checked={broughtByCustomer}
          onChange={() => onChange(true)}
        />
        Owner will bring it
      </label>
      <label className={styles.radioOption}>
        <input
          type="radio"
          name={radioGroup}
          checked={!broughtByCustomer}
          onChange={() => onChange(false)}
        />
        Staff will purchase it
        {!broughtByCustomer && catalogItem ? (
          <span className={styles.priceEstimate}>
            PHP {estimate!.toFixed(2)}
          </span>
        ) : null}
      </label>
    </div>
  );
}

interface StepDef {
  key:
    | 'customer'
    | 'pet'
    | 'branch'
    | 'service'
    | 'slot'
    | 'staff'
    | 'addons'
    | 'hotelDetails'
    | 'payment';
  label: string;
}

const MEAL_TIMES: HotelBookingPreferenceFeeding['meal_time'][] = [
  'Morning',
  'Afternoon',
  'Evening',
];

interface HotelFeedingRowState {
  food_type: string;
  quantity: string;
  special_instructions: string;
  /** Set only when food_type matched a catalog item - staff view only, since
   * the catalog dropdown (CatalogComboBox) is only shown there (the hotel
   * catalog endpoints are staff-only). */
  food_catalog_id: string | null;
  /** true (default) = owner brings it; false = staff purchases it. */
  brought_by_customer: boolean;
}

const EMPTY_HOTEL_WALKING_ROW = {
  time_block: '07:00',
  duration_minutes: 15,
  notes: '',
};

const EMPTY_HOTEL_MEDICATION_ROW = {
  medication_name: '',
  dose: '',
  scheduled_time: '08:00',
  administration_notes: '',
  medication_catalog_id: null as string | null,
  brought_by_customer: true,
  // Client-only (never sent in hotel_preferences.medications - dose already
  // encodes amount per administration, and hotel.types.ts's
  // MedicationInstructionPayload has no quantity field to round-trip through
  // to check-in) - purely drives the price x quantity estimate below.
  quantity: '1',
};

/**
 * Issue #55: 8-step booking flow shell + step navigation, with #56 (Slot
 * Picker), #57 (Staff Picker), and #58 (add-ons/pricing/payment) plugged
 * into the steps this shell defines. The receptionist walk-in/phone-in
 * variant reuses this exact component with a customer-picker step prepended
 * (AC-5) - which variant is active is resolved from the route itself
 * (mounted at both /portal/book and /staff/bookings/new), not a separate
 * implementation.
 *
 * The Customer step is a search/sort/filter picker over existing customers
 * (CustomerPicker) - it does not create or update customer records itself.
 * Walk-in customer creation already has its own dedicated flow at
 * CustomerManagementPage (/staff/admin/customers), linked from within the
 * picker; duplicating create-or-update logic here would also risk silently
 * overwriting a matched customer's profile just from booking on their
 * behalf, which is not something this step should ever do.
 */
export function CustomerBookingFlowPage() {
  const { user, accessToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isReceptionistMode = location.pathname.startsWith('/staff');

  const [walkInCustomer, setWalkInCustomer] = useState<CustomerProfile | null>(
    null
  );

  const effectiveCustomerId = isReceptionistMode
    ? (walkInCustomer?.id ?? null)
    : (user?.id ?? null);

  const [pets, setPets] = useState<Pet[]>([]);
  const [isPetsLoading, setIsPetsLoading] = useState(true);
  const [showAddPet, setShowAddPet] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState('');

  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const [category, setCategory] = useState<ServiceCategory | ''>('');
  const [selectionMode, setSelectionMode] = useState<'service' | 'package'>(
    'service'
  );
  const [allServices, setAllServices] = useState<Service[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');

  const [addonServiceIds, setAddonServiceIds] = useState<string[]>([]);

  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [staffPreference, setStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker (customer-accessible) once the
  // Staff step actually mounts - not from GET /bookings/policy, which is
  // staff-only (#52). Tentatively assume the step exists until proven
  // otherwise, per StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Hotel-only: freetext feeding/walking/medication preferences captured at
  // booking time so the receptionist's check-in form isn't starting blank
  // (see booking.types.ts's HotelBookingPreferences doc comment).
  const [hotelFeeding, setHotelFeeding] = useState<
    Record<
      HotelBookingPreferenceFeeding['meal_time'],
      HotelFeedingRowState | null
    >
  >({ Morning: null, Afternoon: null, Evening: null });
  const [hotelWalking, setHotelWalking] = useState<
    Array<typeof EMPTY_HOTEL_WALKING_ROW>
  >([]);
  const [hotelMedications, setHotelMedications] = useState<
    Array<typeof EMPTY_HOTEL_MEDICATION_ROW>
  >([]);

  // Staff view only - GET /hotel/food-catalog and /hotel/medication-catalog
  // are staff-gated (requireRole(frontDeskAndAssistants)), so the customer
  // portal never fetches these and keeps its plain freetext fields.
  const [foodCatalog, setFoodCatalog] = useState<FoodCatalogItem[]>([]);
  const [medicationCatalog, setMedicationCatalog] = useState<
    MedicationCatalogItem[]
  >([]);

  useEffect(() => {
    if (!isReceptionistMode || !accessToken) return;

    let isMounted = true;

    void listFoodCatalog(accessToken).then((result) => {
      if (isMounted && result.data) setFoodCatalog(result.data);
    });
    void listMedicationCatalog(accessToken).then((result) => {
      if (isMounted && result.data) setMedicationCatalog(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [isReceptionistMode, accessToken]);

  const [rawCurrentStepIndex, setCurrentStepIndex] = useState(0);
  const [rawMaxReachedIndex, setMaxReachedIndex] = useState(0);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(
    null
  );

  // ---- Data loads ----

  useEffect(() => {
    void listBranches().then((result) => {
      if (result.data) setBranches(result.data);
    });
  }, []);

  useEffect(() => {
    if (!accessToken || !effectiveCustomerId) return;

    let isMounted = true;

    void listCustomerPets(effectiveCustomerId, accessToken).then((result) => {
      if (!isMounted) return;
      setIsPetsLoading(false);
      setPets(result.data ?? []);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, effectiveCustomerId]);

  useEffect(() => {
    if (!accessToken || !selectedBranchId) return;

    let isMounted = true;

    void getBookingCatalog(accessToken, { branchId: selectedBranchId }).then(
      (result) => {
        if (!isMounted || !result.data) return;
        setAllServices(result.data.services);
        setPackages(result.data.packages);
        setPromos(result.data.promos);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [accessToken, selectedBranchId]);

  // ---- Derived data ----

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const availableCategories = useMemo(
    () =>
      SERVICE_CATEGORIES.filter(
        (candidate) =>
          candidate !== 'Veterinary' || (selectedBranch?.is_vet_branch ?? true)
      ),
    [selectedBranch]
  );

  const servicesForCategory = useMemo(
    () => allServices.filter((service) => service.category === category),
    [allServices, category]
  );

  const selectedService = useMemo(
    () =>
      allServices.find((service) => service.id === selectedServiceId) ?? null,
    [allServices, selectedServiceId]
  );

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedPackageId) ?? null,
    [packages, selectedPackageId]
  );

  const serviceNameById = useMemo(
    () => new Map(allServices.map((service) => [service.id, service.name])),
    [allServices]
  );

  const addonCandidates = useMemo(
    () =>
      allServices.filter(
        (service) =>
          service.category === 'Grooming' &&
          service.is_active &&
          service.id !== selectedServiceId
      ),
    [allServices, selectedServiceId]
  );

  const slotDurationMinutes =
    selectionMode === 'service'
      ? (selectedService?.duration_minutes ?? 60)
      : 60;

  const basePrice =
    selectionMode === 'service'
      ? (selectedService?.base_price ?? 0)
      : (selectedPackage?.bundled_price ?? 0);

  const addonsTotal = useMemo(
    () =>
      addonServiceIds.reduce(
        (sum, id) =>
          sum +
          (allServices.find((service) => service.id === id)?.base_price ?? 0),
        0
      ),
    [addonServiceIds, allServices]
  );

  const subtotal = basePrice + addonsTotal;

  const applicablePromo = useMemo(() => {
    if (!selectedBranch) return null;

    const branchKey = selectedBranch.name.trim().toLowerCase();
    const now = new Date();

    const candidates = promos.filter((promo) => {
      if (!promo.is_active) return false;
      if (promo.branch_scope !== 'both' && promo.branch_scope !== branchKey) {
        return false;
      }
      if (promo.start_date && new Date(promo.start_date) > now) return false;
      if (promo.end_date && new Date(promo.end_date) < now) return false;
      if (promo.scope_type === 'all_services') return true;

      return (promo.promo_scope ?? []).some(
        (scope) =>
          (selectionMode === 'service' &&
            scope.service_id === selectedServiceId) ||
          (selectionMode === 'package' &&
            scope.package_id === selectedPackageId)
      );
    });

    if (candidates.length === 0) return null;

    // Epic B (#84): is_exclusive is gone - promo combinability is now a
    // per-branch cap (promo_cap_configuration), enforced at checkout once
    // M08 ships (Sprint 5). Until then this pre-M08 pricing preview keeps
    // its existing single-promo display by taking the first applicable
    // candidate, rather than guessing at cap math this epic doesn't own.
    return candidates[0];
  }, [
    promos,
    selectedBranch,
    selectionMode,
    selectedServiceId,
    selectedPackageId,
  ]);

  const promoDiscount = applicablePromo
    ? applicablePromo.discount_type === 'Percentage'
      ? subtotal * (applicablePromo.value / 100)
      : Math.min(applicablePromo.value, subtotal)
    : 0;

  // Hotel-supplied feeding/medication items (staff will purchase them) are
  // billed at checkout, not part of the upfront downpayment (mirrors
  // HotelCheckInPage's own separate "estimated additional charges" line,
  // computed there from the same brought_by_customer flag) - shown here so
  // Review & Pay doesn't silently omit money the customer will owe.
  const suppliesEstimateTotal = useMemo(() => {
    if (category !== 'Hotel') return 0;

    let total = 0;

    for (const mealTime of MEAL_TIMES) {
      const row = hotelFeeding[mealTime];
      if (!row?.food_catalog_id || row.brought_by_customer) continue;

      const item = foodCatalog.find(
        (entry) => entry.id === row.food_catalog_id
      );
      const quantity = Number(row.quantity);
      total +=
        (item?.price ?? 0) *
        (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    }

    for (const row of hotelMedications) {
      if (!row.medication_catalog_id || row.brought_by_customer) continue;

      const item = medicationCatalog.find(
        (entry) => entry.id === row.medication_catalog_id
      );
      const quantity = Number(row.quantity);
      total +=
        (item?.price ?? 0) *
        (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    }

    return total;
  }, [
    category,
    hotelFeeding,
    hotelMedications,
    foodCatalog,
    medicationCatalog,
  ]);

  const requiresPayment = category !== 'Veterinary';
  const downpaymentAmount =
    category === 'Hotel'
      ? Math.round(subtotal * HOTEL_DOWNPAYMENT_RATE * 100) / 100
      : null;

  // ---- Steps ----

  // Grooming/Veterinary bookings get a staff choice folded into the Date &
  // Time step itself (merged step - see 'slot' case in isStepValid/render
  // below) rather than a separate stepper entry, so a step disappearing
  // when the branch+service-type combo has Staff Picker disabled (M09
  // policy) or is a category with no staff concept (Hotel/Daycare) never
  // leaves an orphaned nav entry to clean up.
  const steps: StepDef[] = useMemo(() => {
    const list: StepDef[] = [];

    if (isReceptionistMode) {
      list.push({ key: 'customer', label: 'Customer' });
    }

    list.push({ key: 'pet', label: 'Pet' });
    list.push({ key: 'branch', label: 'Branch' });
    list.push({ key: 'service', label: 'Service' });
    list.push({ key: 'slot', label: 'Date & Time' });

    if (
      (category === 'Grooming' || category === 'Veterinary') &&
      !staffPickerUnavailable
    ) {
      list.push({ key: 'staff', label: 'Staff' });
    }

    if (category === 'Grooming') {
      list.push({ key: 'addons', label: 'Add-ons' });
    }

    if (category === 'Hotel') {
      list.push({ key: 'hotelDetails', label: 'Care Instructions' });
    }

    list.push({ key: 'payment', label: 'Review & Pay' });

    return list;
  }, [isReceptionistMode, category, staffPickerUnavailable]);

  // Clamped at the point of use (not via an effect+setState pair) - if the
  // steps list shrinks because a category change removes the Staff Picker
  // step, the raw indices simply get read back down to range on this same
  // render, with no extra render pass needed.
  const currentStepIndex = Math.min(rawCurrentStepIndex, steps.length - 1);
  const maxReachedIndex = Math.min(rawMaxReachedIndex, steps.length - 1);

  const currentStep = steps[currentStepIndex] ?? steps[0];

  function isStepValid(key: StepDef['key']): boolean {
    switch (key) {
      case 'customer':
        return walkInCustomer !== null;
      case 'pet':
        return selectedPetId !== '';
      case 'branch':
        return selectedBranchId !== '';
      case 'service':
        return (
          category !== '' &&
          (selectionMode === 'service'
            ? selectedServiceId !== ''
            : selectedPackageId !== '')
        );
      case 'slot':
        return selectedSlot !== null;
      case 'staff':
        return staffPreference !== null;
      case 'addons':
        return true;
      case 'hotelDetails':
        return true;
      case 'payment':
        return !requiresPayment || paymentMethod !== '';
      default:
        return true;
    }
  }

  const isCurrentStepValid = isStepValid(currentStep.key);

  function advanceTo(nextIndex: number) {
    const clamped = Math.min(nextIndex, steps.length - 1);
    setCurrentStepIndex(clamped);
    setMaxReachedIndex((prev) => Math.max(prev, clamped));
  }

  function goNext() {
    if (!isCurrentStepValid) return;
    advanceTo(currentStepIndex + 1);
  }

  function goBack() {
    setCurrentStepIndex((index) => Math.max(0, index - 1));
  }

  function handleStepperSelect(index: number) {
    if (index <= maxReachedIndex) {
      setCurrentStepIndex(index);
    }
  }

  // ---- Selection handlers (reset dependent state on change, AC-2) ----

  function handleCustomerSelect(customer: CustomerProfile) {
    setWalkInCustomer(customer);
    advanceTo(currentStepIndex + 1);
  }

  function handlePetSelect(petId: string) {
    setSelectedPetId(petId);
  }

  function resetHotelPreferences() {
    setHotelFeeding({ Morning: null, Afternoon: null, Evening: null });
    setHotelWalking([]);
    setHotelMedications([]);
  }

  function handleBranchSelect(branchId: string) {
    setSelectedBranchId(branchId);
    setCategory('');
    setSelectionMode('service');
    setSelectedServiceId('');
    setSelectedPackageId('');
    setAddonServiceIds([]);
    setSelectedSlot(null);
    setStaffPreference(null);
    setStaffPickerUnavailable(false);
    resetHotelPreferences();
  }

  function handleCategorySelect(nextCategory: ServiceCategory) {
    setCategory(nextCategory);
    setSelectionMode('service');
    setSelectedServiceId('');
    setSelectedPackageId('');
    setAddonServiceIds([]);
    setSelectedSlot(null);
    setStaffPreference(null);
    setStaffPickerUnavailable(false);
    resetHotelPreferences();
  }

  function handleServiceSelect(serviceId: string) {
    setSelectedServiceId(serviceId);
    setSelectedPackageId('');
    setSelectedSlot(null);
    setStaffPreference(null);
  }

  function handlePackageSelect(packageId: string) {
    setSelectedPackageId(packageId);
    setSelectedServiceId('');
    setSelectedSlot(null);
    setStaffPreference(null);
  }

  function handleSlotSelect(slot: { start: string; end: string }) {
    setSelectedSlot(slot);
    advanceTo(currentStepIndex + 1);
  }

  function handleStaffSelect(preference: StaffPreferenceInput) {
    setStaffPreference(preference);
    advanceTo(currentStepIndex + 1);
  }

  function toggleAddon(serviceId: string) {
    setAddonServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    );
  }

  function toggleHotelMealTime(
    mealTime: HotelBookingPreferenceFeeding['meal_time']
  ) {
    setHotelFeeding((prev) => ({
      ...prev,
      [mealTime]: prev[mealTime]
        ? null
        : {
            food_type: '',
            quantity: '1',
            special_instructions: '',
            food_catalog_id: null,
            brought_by_customer: true,
          },
    }));
  }

  function updateHotelFeeding(
    mealTime: HotelBookingPreferenceFeeding['meal_time'],
    updates: Partial<HotelFeedingRowState>
  ) {
    setHotelFeeding((prev) => {
      const current = prev[mealTime];
      if (!current) return prev;
      return { ...prev, [mealTime]: { ...current, ...updates } };
    });
  }

  function addHotelWalkBlock() {
    setHotelWalking((prev) => [...prev, { ...EMPTY_HOTEL_WALKING_ROW }]);
  }

  function updateHotelWalkBlock(
    index: number,
    updates: Partial<typeof EMPTY_HOTEL_WALKING_ROW>
  ) {
    setHotelWalking((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  }

  function removeHotelWalkBlock(index: number) {
    setHotelWalking((prev) => prev.filter((_, i) => i !== index));
  }

  function addHotelMedication() {
    setHotelMedications((prev) => [...prev, { ...EMPTY_HOTEL_MEDICATION_ROW }]);
  }

  function updateHotelMedication(
    index: number,
    updates: Partial<typeof EMPTY_HOTEL_MEDICATION_ROW>
  ) {
    setHotelMedications((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  }

  function removeHotelMedication(index: number) {
    setHotelMedications((prev) => prev.filter((_, i) => i !== index));
  }

  /** Undefined (never sent) unless the customer/receptionist actually
   * entered something - an empty-everything payload adds nothing the
   * check-in form's own blank state doesn't already give. */
  const hotelPreferencesPayload = useMemo(() => {
    if (category !== 'Hotel') return undefined;

    const feeding: HotelBookingPreferenceFeeding[] = MEAL_TIMES.filter(
      (mealTime) => hotelFeeding[mealTime] !== null
    ).map((mealTime) => {
      const row = hotelFeeding[mealTime]!;
      return {
        meal_time: mealTime,
        food_type: row.food_type,
        quantity: row.quantity,
        ...(row.special_instructions.trim()
          ? { special_instructions: row.special_instructions.trim() }
          : {}),
        ...(row.food_catalog_id
          ? {
              food_catalog_id: row.food_catalog_id,
              brought_by_customer: row.brought_by_customer,
            }
          : {}),
      };
    });

    // Kept as raw "HH:MM" (not formatTimeValue()'d to "7:00 AM") so
    // HotelCheckInPage can drop these straight into its own "HH:MM" TimeInput
    // state at check-in without a lossy round-trip re-parse.
    const walking: HotelBookingPreferenceWalking[] = hotelWalking.map(
      (row) => ({
        time_block: row.time_block,
        duration_minutes: row.duration_minutes,
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      })
    );

    const medications: HotelBookingPreferenceMedication[] =
      hotelMedications.map((row) => ({
        medication_name: row.medication_name,
        dose: row.dose,
        scheduled_times: row.scheduled_time ? [row.scheduled_time] : [],
        ...(row.administration_notes.trim()
          ? { administration_notes: row.administration_notes.trim() }
          : {}),
        ...(row.medication_catalog_id
          ? {
              medication_catalog_id: row.medication_catalog_id,
              brought_by_customer: row.brought_by_customer,
            }
          : {}),
      }));

    if (
      feeding.length === 0 &&
      walking.length === 0 &&
      medications.length === 0
    ) {
      return undefined;
    }

    return { feeding, walking, medications };
  }, [category, hotelFeeding, hotelWalking, hotelMedications]);

  async function handleSubmit() {
    if (
      !accessToken ||
      !selectedPetId ||
      !selectedBranchId ||
      !category ||
      !selectedSlot
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const paymentConfirmed = requiresPayment
      ? ONLINE_METHODS.has(paymentMethod as PaymentMethod)
      : false;

    const result = await createBooking(accessToken, {
      ...(isReceptionistMode && walkInCustomer
        ? { customer_id: walkInCustomer.id }
        : {}),
      pet_id: selectedPetId,
      branch_id: selectedBranchId,
      service_category: category,
      ...(selectionMode === 'service'
        ? { service_id: selectedServiceId }
        : { package_id: selectedPackageId }),
      scheduled_start: selectedSlot.start,
      scheduled_end: selectedSlot.end,
      ...(category === 'Grooming' && addonServiceIds.length > 0
        ? { addon_service_ids: addonServiceIds }
        : {}),
      ...(staffPreference ? { staff_preference: staffPreference } : {}),
      ...(requiresPayment && paymentMethod
        ? { payment_method: paymentMethod, payment_confirmed: paymentConfirmed }
        : {}),
      ...(specialInstructions.trim()
        ? { special_instructions: specialInstructions.trim() }
        : {}),
      ...(hotelPreferencesPayload
        ? { hotel_preferences: hotelPreferencesPayload }
        : {}),
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setSubmitError(result.error ?? 'Could not create the booking.');
      return;
    }

    setConfirmedBooking(result.data);
  }

  // ---- Guards ----

  if (!accessToken || (!isReceptionistMode && !user?.id)) {
    return (
      <main className={styles.page}>
        <p className={styles.errorBanner} role="alert">
          Unable to load the booking flow.
        </p>
      </main>
    );
  }

  if (confirmedBooking) {
    return (
      <main className={styles.page}>
        <h1 className={styles.title}>Booking confirmed</h1>
        <p className={styles.copy}>
          Status: {confirmedBooking.status}. Your appointment is booked for{' '}
          {new Date(confirmedBooking.scheduled_start).toLocaleString(
            undefined,
            {
              dateStyle: 'medium',
              timeStyle: 'short',
            }
          )}
          .{' '}
          {requiresPayment
            ? confirmedBooking.payment_confirmed
              ? 'Your payment has been received.'
              : 'Payment is due at the counter.'
            : "You're all set!"}
        </p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() =>
            navigate(
              isReceptionistMode ? '/staff/bookings/queue' : '/portal/bookings'
            )
          }
        >
          {isReceptionistMode ? 'Back to queue' : 'View my bookings'}
        </button>
      </main>
    );
  }

  // ---- Step content ----

  function renderStepContent() {
    switch (currentStep.key) {
      case 'customer':
        return (
          <CustomerPicker
            accessToken={accessToken!}
            onSelect={handleCustomerSelect}
            selectedCustomerId={walkInCustomer?.id ?? null}
          />
        );

      case 'pet':
        if (isPetsLoading) {
          return <p className={styles.copy}>Loading pets...</p>;
        }
        return (
          <div className={styles.optionGrid}>
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                className={`${styles.optionCard} ${
                  selectedPetId === pet.id ? styles.selected : ''
                }`}
                onClick={() => handlePetSelect(pet.id)}
              >
                <span className={styles.optionTitle}>{pet.name}</span>
                <span className={styles.optionMeta}>
                  {PET_TYPE_LABEL[pet.pet_type]} &middot;{' '}
                  {WEIGHT_CLASS_LABEL[pet.weight_class]} ({pet.weight_class})
                  &middot; {COAT_TYPE_LABEL[pet.coat_type]}
                </span>
              </button>
            ))}
            {pets.length === 0 && !showAddPet ? (
              <p className={styles.copy}>No pets on file yet.</p>
            ) : null}
            {showAddPet && effectiveCustomerId ? (
              <PetForm
                customerId={effectiveCustomerId}
                accessToken={accessToken!}
                onCreated={(pet) => {
                  setPets((current) => [...current, pet]);
                  setSelectedPetId(pet.id);
                  setShowAddPet(false);
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowAddPet(true)}
              >
                + Add a pet
              </button>
            )}
          </div>
        );

      case 'branch':
        return (
          <div className={styles.optionGrid}>
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className={`${styles.optionCard} ${
                  selectedBranchId === branch.id ? styles.selected : ''
                }`}
                onClick={() => handleBranchSelect(branch.id)}
              >
                <span className={styles.optionTitle}>{branch.name}</span>
              </button>
            ))}
          </div>
        );

      case 'service':
        return (
          <div className={styles.serviceStep}>
            <div className={styles.tabRow}>
              {availableCategories.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  className={`${styles.tab} ${
                    category === candidate ? styles.tabActive : ''
                  }`}
                  onClick={() => handleCategorySelect(candidate)}
                >
                  {candidate}
                </button>
              ))}
            </div>

            {category ? (
              <div className={styles.tabRow}>
                <button
                  type="button"
                  className={`${styles.tab} ${
                    selectionMode === 'service' ? styles.tabActive : ''
                  }`}
                  onClick={() => setSelectionMode('service')}
                >
                  Individual service
                </button>
                {packages.length > 0 ? (
                  <button
                    type="button"
                    className={`${styles.tab} ${
                      selectionMode === 'package' ? styles.tabActive : ''
                    }`}
                    onClick={() => setSelectionMode('package')}
                  >
                    Package
                  </button>
                ) : null}
              </div>
            ) : null}

            {category === 'Hotel' && selectedPet ? (
              <p className={styles.copy}>
                {selectedPet.name} is{' '}
                {WEIGHT_CLASS_LABEL[selectedPet.weight_class]} (
                {selectedPet.weight_class}) - the matching cage size is marked
                Recommended below.
              </p>
            ) : null}

            {category && selectionMode === 'service' ? (
              <div className={styles.optionGrid}>
                {servicesForCategory.length === 0 ? (
                  <p className={styles.copy}>
                    No {category} services available at this branch.
                  </p>
                ) : null}
                {servicesForCategory.map((service) => {
                  const isRecommendedCage =
                    category === 'Hotel' &&
                    selectedPet !== null &&
                    deriveHotelCageSize(service.name) ===
                      selectedPet.weight_class;

                  return (
                    <button
                      key={service.id}
                      type="button"
                      className={`${styles.optionCard} ${
                        selectedServiceId === service.id ? styles.selected : ''
                      }`}
                      onClick={() => handleServiceSelect(service.id)}
                    >
                      <span className={styles.optionTitleRow}>
                        <span className={styles.optionTitle}>
                          {service.name}
                        </span>
                        {isRecommendedCage ? (
                          <span className={styles.recommendedBadge}>
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.optionMeta}>
                        PHP {service.base_price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {category && selectionMode === 'package' ? (
              <div className={styles.optionGrid}>
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    className={`${styles.optionCard} ${
                      selectedPackageId === pkg.id ? styles.selected : ''
                    }`}
                    onClick={() => handlePackageSelect(pkg.id)}
                  >
                    <span className={styles.optionTitle}>{pkg.name}</span>
                    <span className={styles.optionMeta}>
                      PHP {pkg.bundled_price.toFixed(2)}
                    </span>
                    <ul className={styles.readOnlyList}>
                      {(pkg.package_services ?? []).map((entry) => (
                        <li key={entry.service_id}>
                          {serviceNameById.get(entry.service_id) ?? 'Service'}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );

      case 'slot':
        return (
          <SlotPicker
            accessToken={accessToken!}
            branchId={selectedBranchId}
            serviceCategory={category as ServiceCategory}
            slotDurationMinutes={slotDurationMinutes}
            petWeightClass={
              category === 'Hotel'
                ? pets.find((pet) => pet.id === selectedPetId)?.weight_class
                : undefined
            }
            viewerMode={isReceptionistMode ? 'staff' : 'customer'}
            selectedSlot={selectedSlot}
            onSelect={handleSlotSelect}
          />
        );

      case 'staff':
        if (!selectedSlot) return null;
        return (
          <StaffPickerList
            accessToken={accessToken!}
            branchId={selectedBranchId}
            serviceCategory={category as 'Grooming' | 'Veterinary'}
            scheduledStart={selectedSlot.start}
            scheduledEnd={selectedSlot.end}
            selected={staffPreference}
            onSelect={handleStaffSelect}
            onUnavailable={() => setStaffPickerUnavailable(true)}
          />
        );

      case 'addons':
        return (
          <div className={styles.optionGrid}>
            {addonCandidates.length === 0 ? (
              <p className={styles.copy}>No add-ons available.</p>
            ) : null}
            {addonCandidates.map((service) => (
              <label key={service.id} className={styles.addonRow}>
                <input
                  type="checkbox"
                  checked={addonServiceIds.includes(service.id)}
                  onChange={() => toggleAddon(service.id)}
                />
                <span>{service.name}</span>
                <span className={styles.optionMeta}>
                  +PHP {service.base_price.toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        );

      case 'hotelDetails':
        return (
          <div className={styles.hotelDetailsStep}>
            <p className={styles.copy}>
              Optional - let us know your pet's usual feeding, walking, and
              medication routine. Our receptionist will confirm and finalize
              these details when your pet checks in.
            </p>

            <section className={styles.hotelDetailsSection}>
              <span className={styles.sectionTitle}>Feeding</span>
              {MEAL_TIMES.map((mealTime) => {
                const row = hotelFeeding[mealTime];

                return (
                  <div key={mealTime} className={styles.instructionRow}>
                    <label className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        checked={row !== null}
                        onChange={() => toggleHotelMealTime(mealTime)}
                      />
                      {mealTime}
                    </label>
                    {row ? (
                      <div className={styles.instructionBlock}>
                        <div className={styles.inlineFields}>
                          {isReceptionistMode ? (
                            <CatalogComboBox
                              placeholder="Food type"
                              items={foodCatalog}
                              value={{
                                catalogId: row.food_catalog_id,
                                text: row.food_type,
                              }}
                              onChange={(next) =>
                                updateHotelFeeding(mealTime, {
                                  food_type: next.text,
                                  food_catalog_id: next.catalogId,
                                  // Fresh catalog match defaults to owner-
                                  // brought, matching HotelCheckInPage.
                                  ...(next.catalogId
                                    ? { brought_by_customer: true }
                                    : {}),
                                })
                              }
                            />
                          ) : (
                            <input
                              className={styles.input}
                              placeholder="Food type"
                              value={row.food_type}
                              onChange={(event) =>
                                updateHotelFeeding(mealTime, {
                                  food_type: event.target.value,
                                })
                              }
                            />
                          )}
                          <input
                            className={styles.input}
                            type="number"
                            min={1}
                            placeholder="Quantity"
                            value={row.quantity}
                            onChange={(event) =>
                              updateHotelFeeding(mealTime, {
                                quantity: event.target.value,
                              })
                            }
                          />
                          <input
                            className={styles.input}
                            placeholder="Special instructions (optional)"
                            value={row.special_instructions}
                            onChange={(event) =>
                              updateHotelFeeding(mealTime, {
                                special_instructions: event.target.value,
                              })
                            }
                          />
                        </div>

                        {isReceptionistMode && row.food_catalog_id ? (
                          <SupplierChoice
                            radioGroup={`feeding-${mealTime}`}
                            broughtByCustomer={row.brought_by_customer}
                            quantity={row.quantity}
                            catalogItem={foodCatalog.find(
                              (item) => item.id === row.food_catalog_id
                            )}
                            onChange={(broughtByCustomer) =>
                              updateHotelFeeding(mealTime, {
                                brought_by_customer: broughtByCustomer,
                              })
                            }
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <section className={styles.hotelDetailsSection}>
              <span className={styles.sectionTitle}>Walking</span>
              {hotelWalking.map((row, index) => (
                <div key={index} className={styles.instructionBlock}>
                  <div className={styles.inlineFields}>
                    <TimeInput
                      aria-label="Walk time"
                      value={row.time_block}
                      onChange={(value) =>
                        updateHotelWalkBlock(index, { time_block: value })
                      }
                    />
                    <input
                      className={styles.input}
                      type="number"
                      min={1}
                      placeholder="Duration (min)"
                      value={row.duration_minutes}
                      onChange={(event) =>
                        updateHotelWalkBlock(index, {
                          duration_minutes: Number(event.target.value),
                        })
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Notes (optional)"
                      value={row.notes}
                      onChange={(event) =>
                        updateHotelWalkBlock(index, {
                          notes: event.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeHotelWalkBlock(index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={addHotelWalkBlock}
              >
                Add walk time
              </button>
            </section>

            <section className={styles.hotelDetailsSection}>
              <span className={styles.sectionTitle}>Medications</span>
              {hotelMedications.map((row, index) => (
                <div key={index} className={styles.instructionBlock}>
                  <div className={styles.inlineFields}>
                    {isReceptionistMode ? (
                      <CatalogComboBox
                        placeholder="Medication name"
                        items={medicationCatalog}
                        value={{
                          catalogId: row.medication_catalog_id,
                          text: row.medication_name,
                        }}
                        onChange={(next) =>
                          updateHotelMedication(index, {
                            medication_name: next.text,
                            medication_catalog_id: next.catalogId,
                            ...(next.catalogId
                              ? { brought_by_customer: true }
                              : {}),
                          })
                        }
                      />
                    ) : (
                      <input
                        className={styles.input}
                        placeholder="Medication name"
                        value={row.medication_name}
                        onChange={(event) =>
                          updateHotelMedication(index, {
                            medication_name: event.target.value,
                          })
                        }
                      />
                    )}
                    <input
                      className={styles.input}
                      placeholder="Dose"
                      value={row.dose}
                      onChange={(event) =>
                        updateHotelMedication(index, {
                          dose: event.target.value,
                        })
                      }
                    />
                    {isReceptionistMode ? (
                      <input
                        className={styles.input}
                        type="number"
                        min={1}
                        placeholder="Quantity"
                        value={row.quantity}
                        onChange={(event) =>
                          updateHotelMedication(index, {
                            quantity: event.target.value,
                          })
                        }
                      />
                    ) : null}
                    <TimeInput
                      aria-label="Medication time"
                      value={row.scheduled_time}
                      onChange={(value) =>
                        updateHotelMedication(index, { scheduled_time: value })
                      }
                    />
                    <input
                      className={styles.input}
                      placeholder="Notes (optional)"
                      value={row.administration_notes}
                      onChange={(event) =>
                        updateHotelMedication(index, {
                          administration_notes: event.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeHotelMedication(index)}
                    >
                      Remove
                    </button>
                  </div>

                  {isReceptionistMode && row.medication_catalog_id ? (
                    <SupplierChoice
                      radioGroup={`medication-${index}`}
                      broughtByCustomer={row.brought_by_customer}
                      quantity={row.quantity}
                      catalogItem={medicationCatalog.find(
                        (item) => item.id === row.medication_catalog_id
                      )}
                      onChange={(broughtByCustomer) =>
                        updateHotelMedication(index, {
                          brought_by_customer: broughtByCustomer,
                        })
                      }
                    />
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={addHotelMedication}
              >
                Add medication
              </button>
            </section>
          </div>
        );

      case 'payment':
        return (
          <div className={styles.paymentStep}>
            <section className={styles.pricingSummary}>
              <div className={styles.pricingRow}>
                <span>Base price</span>
                <span>PHP {basePrice.toFixed(2)}</span>
              </div>
              {category === 'Grooming' ? (
                <p className={styles.copy}>
                  Grooming price may be adjusted for your pet's size and coat at
                  confirmation.
                </p>
              ) : null}
              {addonsTotal > 0 ? (
                <div className={styles.pricingRow}>
                  <span>Add-ons</span>
                  <span>PHP {addonsTotal.toFixed(2)}</span>
                </div>
              ) : null}
              {applicablePromo ? (
                <p className={styles.copy}>
                  Promo available: {applicablePromo.name} (-PHP{' '}
                  {promoDiscount.toFixed(2)}, applied at checkout)
                </p>
              ) : null}
              <div className={styles.pricingRowTotal}>
                <span>Estimated total</span>
                <span>PHP {subtotal.toFixed(2)}</span>
              </div>
              {downpaymentAmount !== null ? (
                <p className={styles.copy}>
                  50% downpayment required now: PHP{' '}
                  {downpaymentAmount.toFixed(2)}
                </p>
              ) : null}
              {suppliesEstimateTotal > 0 ? (
                <p className={styles.copy}>
                  Estimated additional charges (hotel-supplied food/ medication,
                  billed at checkout): PHP {suppliesEstimateTotal.toFixed(2)}
                </p>
              ) : null}
            </section>

            {requiresPayment ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Payment method</span>
                <select
                  className={styles.input}
                  value={paymentMethod}
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as PaymentMethod)
                  }
                >
                  <option value="">Select a payment method...</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className={styles.copy}>
                No upfront payment is required for Veterinary bookings.
              </p>
            )}

            <PayMongoFeeNotice paymentMethod={paymentMethod} />

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Special instructions (optional)
              </span>
              <textarea
                className={styles.input}
                value={specialInstructions}
                onChange={(event) => setSpecialInstructions(event.target.value)}
              />
            </label>

            {submitError ? (
              <p className={styles.errorBanner} role="alert">
                {submitError}
              </p>
            ) : null}

            <button
              type="button"
              className={styles.primaryButton}
              disabled={!isCurrentStepValid || isSubmitting}
              onClick={() => void handleSubmit()}
            >
              {isSubmitting ? 'Confirming...' : 'Confirm booking'}
            </button>
          </div>
        );

      default:
        return null;
    }
  }

  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Book a service</h1>

      <BookingStepper
        steps={steps.map((step) => step.label)}
        currentStepIndex={currentStepIndex}
        furthestCompletedIndex={maxReachedIndex}
        onStepSelect={handleStepperSelect}
      />

      <div className={styles.stepContent}>{renderStepContent()}</div>

      {currentStep.key !== 'customer' &&
      currentStep.key !== 'slot' &&
      currentStep.key !== 'staff' &&
      currentStep.key !== 'payment' ? (
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={currentStepIndex === 0}
            onClick={goBack}
          >
            Back
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!isCurrentStepValid || isLastStep}
            onClick={goNext}
          >
            Next
          </button>
        </div>
      ) : (
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={currentStepIndex === 0}
            onClick={goBack}
          >
            Back
          </button>
        </div>
      )}
    </main>
  );
}
