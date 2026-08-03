import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  BedDouble,
  ClipboardList,
  Scissors,
  Stethoscope,
  Sun,
  type LucideIcon,
} from 'lucide-react';
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
import { CagePicker } from '../../components/CagePicker/CagePicker';
import { PayMongoFeeNotice } from '../../components/PayMongoFeeNotice/PayMongoFeeNotice';
import {
  createBooking,
  getBookingCatalog,
  getNextAvailableSlot,
  type NextAvailableSlot,
} from '../../api/booking.api';
import {
  BOOKING_MARK_PAID_ROLES,
  PAYMENT_METHODS,
  SERVICE_CATEGORIES,
  type Booking,
  type HotelBookingPreferenceFeeding,
  type HotelBookingPreferenceMedication,
  type HotelBookingPreferencePlaying,
  type HotelBookingPreferenceWalking,
  type PaymentMethod,
  type ServiceCategory,
  type StaffPreferenceInput,
} from '../../booking.types';
import { listStaff } from '../../../staff/api/staff.api';
import { listDiscounts } from '../../../discounts/api/discounts.api';
import type { Discount } from '../../../discounts/discounts.types';
import { TimeInput } from '../../../hotel/components/TimeInput/TimeInput';
import {
  getDayOneMinTime,
  getLastDayMaxTime,
  isMealApplicableOnDayOne,
  isMealApplicableOnLastDay,
} from '../../../hotel/utils/careScheduleBounds';
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
/** Stable reference for selectedServiceIds/selectedPackageIds' no-category/
 * no-picks-yet case, so those useMemo values don't return a fresh empty
 * array (and invalidate every memo that depends on them) on every render. */
const EMPTY_ITEM_IDS: string[] = [];

const PET_TYPE_LABEL: Record<Pet['pet_type'], string> = {
  Dog: 'Dog',
  Cat: 'Cat',
};

const WEIGHT_CLASS_LABEL: Record<NonNullable<Pet['weight_class']>, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  XL: 'XL',
};

const COAT_TYPE_LABEL: Record<NonNullable<Pet['coat_type']>, string> = {
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
function deriveHotelCageSize(
  serviceName: string
): NonNullable<Pet['weight_class']> | null {
  const lower = serviceName.toLowerCase();
  if (lower.includes('xl')) return 'XL';
  if (lower.includes('large')) return 'L';
  if (lower.includes('medium')) return 'M';
  if (lower.includes('small')) return 'S';
  return null;
}

interface StepDef {
  key:
    | 'customer'
    | 'pet'
    | 'branch'
    | 'category'
    | 'availability'
    | 'items'
    | 'hotelDetails'
    | 'payment';
  label: string;
}

/** #22 follow-up: fixed stand-in duration for the availability step's
 * capacity/staff check, run before any specific service/package is chosen
 * (so the real item-derived duration isn't known yet). Hotel's 1440 isn't
 * an approximation - it's always a full night regardless of item, matching
 * availability.service.ts's existing day-level Hotel convention. */
const DEFAULT_DURATION_MINUTES: Record<ServiceCategory, number> = {
  Grooming: 60,
  Veterinary: 60,
  Daycare: 60,
  Hotel: 1440,
  Misc: 60,
};

const CATEGORY_ICONS: Record<ServiceCategory, LucideIcon> = {
  Grooming: Scissors,
  Hotel: BedDouble,
  Daycare: Sun,
  Veterinary: Stethoscope,
  Misc: ClipboardList,
};

const MEAL_TIMES: HotelBookingPreferenceFeeding['meal_time'][] = [
  'Morning',
  'Afternoon',
  'Evening',
];

const PARTS_OF_DAY: HotelBookingPreferenceWalking['time_block'][] = [
  'Morning',
  'Afternoon',
  'Evening',
];

/** #22: walk/play scheduling is minutes-based, not clock-time - these are
 * just the quick-select buttons; the underlying field accepts any positive
 * integer via the number input next to them. */
const DURATION_PRESETS_MINUTES = [10, 15, 20, 30];

const NIGHT_COUNT_PRESETS = [3, 5];

interface HotelFeedingRowState {
  food_type: string;
  quantity: string;
  special_instructions: string;
  /** Set only when food_type matched a catalog item - staff view only, since
   * the catalog dropdown (CatalogComboBox) is only shown there. */
  food_catalog_id: string | null;
}

const EMPTY_HOTEL_WALKING_ROW = {
  time_block: 'Morning' as HotelBookingPreferenceWalking['time_block'],
  duration_minutes: 15,
  notes: '',
};

const EMPTY_HOTEL_PLAYING_ROW = {
  time_block: 'Morning' as HotelBookingPreferenceWalking['time_block'],
  duration_minutes: 15,
  notes: '',
};

const EMPTY_HOTEL_MEDICATION_ROW = {
  medication_name: '',
  dose: '',
  scheduled_time: '08:00',
  administration_notes: '',
  medication_catalog_id: null as string | null,
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

  // Only resolved in the staff walk-in flow - a discount needs staff to have
  // verified a Senior Citizen/PWD ID onsite, so the picker below is gated on
  // this (same recipe ReceptionistBookingsQueuePage uses: the JWT's role is
  // just Postgres "authenticated", the app role only lives in
  // staff_profiles). Promos have no role gate, so the customer portal never
  // needs this lookup.
  const [viewerRole, setViewerRole] = useState<string | null>(null);

  useEffect(() => {
    if (!isReceptionistMode || !accessToken || !user?.id) return;

    let isMounted = true;

    void listStaff(accessToken).then((result) => {
      if (!isMounted) return;
      const self = result.data?.find((staff) => staff.id === user.id);
      setViewerRole(self?.role ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [isReceptionistMode, accessToken, user?.id]);

  const canApplyDiscounts =
    isReceptionistMode &&
    viewerRole !== null &&
    BOOKING_MARK_PAID_ROLES.includes(viewerRole);

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
  // Checkboxes over both the "Individual service" and "Package" sub-tabs -
  // selections in either accumulate into the same booking (multi-item
  // bookings revision, replacing the old single selectedServiceId/
  // selectedPackageId radio pair plus the separate Add-ons step). Kept per
  // CATEGORY (not one flat array) so browsing another category tab to
  // compare doesn't wipe out what you'd already picked in the one you were
  // on - only an actual branch/pet change clears everything, since the
  // catalog itself changes then.
  const [selectionsByCategory, setSelectionsByCategory] = useState<
    Partial<
      Record<ServiceCategory, { serviceIds: string[]; packageIds: string[] }>
    >
  >({});

  const selectedServiceIds = useMemo(
    () =>
      category
        ? (selectionsByCategory[category]?.serviceIds ?? EMPTY_ITEM_IDS)
        : EMPTY_ITEM_IDS,
    [category, selectionsByCategory]
  );
  const selectedPackageIds = useMemo(
    () =>
      category
        ? (selectionsByCategory[category]?.packageIds ?? EMPTY_ITEM_IDS)
        : EMPTY_ITEM_IDS,
    [category, selectionsByCategory]
  );

  // Only one category may ever hold picks at a time (a booking always
  // covers exactly one category) - every mutation replaces the whole map
  // with just targetCategory's own entry, so selecting/deselecting an item
  // in one category always drops whatever was left checked under any other
  // category, rather than leaving it stranded there until submit.
  function updateCategorySelection(
    targetCategory: ServiceCategory,
    updater: (current: { serviceIds: string[]; packageIds: string[] }) => {
      serviceIds: string[];
      packageIds: string[];
    }
  ) {
    setSelectionsByCategory((prev) => ({
      [targetCategory]: updater(
        prev[targetCategory] ?? { serviceIds: [], packageIds: [] }
      ),
    }));
  }

  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  /** Hotel-only: SlotPicker's own candidate `end` is always a single
   * ~24h/one-night preview (see availability.service.ts's getDaySlots) - the
   * actual submitted scheduled_end is computed from this instead so a stay
   * can span more than one night. */
  const [hotelNights, setHotelNights] = useState(1);
  const [staffPreference, setStaffPreference] =
    useState<StaffPreferenceInput | null>(null);
  // Resolved from GET /bookings/staff-picker (customer-accessible) once the
  // Staff step actually mounts - not from GET /bookings/policy, which is
  // staff-only (#52). Tentatively assume the step exists until proven
  // otherwise, per StaffPickerList's onUnavailable contract.
  const [staffPickerUnavailable, setStaffPickerUnavailable] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [selectedPromoId, setSelectedPromoId] = useState('');
  const [selectedDiscountId, setSelectedDiscountId] = useState('');
  // Staff attestation that they physically checked the customer's Senior
  // Citizen/PWD ID before selecting a mandated discount - mirrors
  // CashierCheckoutPage's own seniorCitizenEligible/pwdEligible checkboxes,
  // just collapsed to one confirmation since only one discount can be picked
  // here. Never sent to the server or persisted (same as the checkout-time
  // checkboxes) - the act of a qualifying staff role choosing a Cash booking
  // and checking this box IS the attestation.
  const [discountIdVerified, setDiscountIdVerified] = useState(false);
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
  const [hotelPlaying, setHotelPlaying] = useState<
    Array<typeof EMPTY_HOTEL_PLAYING_ROW>
  >([]);
  const [hotelMedications, setHotelMedications] = useState<
    Array<typeof EMPTY_HOTEL_MEDICATION_ROW>
  >([]);
  // #22: "same instructions every night" (default) vs per-night editing.
  // Full per-night date-tab editing UI is a follow-up - for now this flag
  // is always sent as true (every row applies to the whole stay, matching
  // pre-#22 behavior) while the server/schema already support per-row
  // stay_date for when that UI lands.
  const [hotelUniformInstructions] = useState(true);

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

  // Tracked by stable step KEY, not array index - the `steps` array below
  // can shrink out from under the user mid-flow (e.g. Staff Picker turns
  // out disabled for this branch+category only after StaffPickerList
  // mounts and fetches), and a plain numeric index would then silently
  // resolve to whatever step slid into that same slot instead of the step
  // the user actually meant to be on (previously caused Date & Time to
  // jump straight to Review & Pay instead of Staff whenever this happened).
  const [currentStepKey, setCurrentStepKey] = useState<StepDef['key']>(() =>
    isReceptionistMode ? 'customer' : 'pet'
  );
  const [reachedStepKeys, setReachedStepKeys] = useState<Set<StepDef['key']>>(
    () => new Set([isReceptionistMode ? 'customer' : 'pet'])
  );

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(
    null
  );

  // #22: "fully booked" warning, checked live as the customer browses dates
  // inside the availability step - only for a day that actually has real
  // candidate slots (time/staff/cage) that are ALL taken, never for a day
  // with no candidates at all (branch closed that weekday, or today's
  // hours have already passed) - see handleSlotAvailabilityChange. undefined
  // = not showing, null = nothing available in the lookahead window,
  // otherwise the earliest open day/slot found.
  const [fullyBookedNotice, setFullyBookedNotice] = useState<
    NextAvailableSlot | null | undefined
  >(undefined);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  // resetHotelPreferences/handleCategorySelect are declared ahead of the
  // auto-select-assessment effect below (rather than alongside the other
  // selection handlers further down) so that effect can reference them -
  // react-hooks/immutability requires every reference to a function
  // declaration to come after its declaration point, even though plain
  // function declarations are hoisted at runtime.
  function resetHotelPreferences() {
    setHotelFeeding({ Morning: null, Afternoon: null, Evening: null });
    setHotelWalking([]);
    setHotelPlaying([]);
    setHotelMedications([]);
  }

  function handleCategorySelect(nextCategory: ServiceCategory) {
    setCategory(nextCategory);
    setSelectionMode('service');
    // Item selections are NOT cleared here - selectionsByCategory keeps
    // each tab's own picks, so browsing to another category to compare
    // doesn't lose progress. hotelNights is left alone for the same reason
    // (it's meaningless outside Hotel, so there's nothing to conflict with
    // by leaving it set while browsing elsewhere). Date/time and staff
    // still reset, since those depend on which category you're actually
    // committing to.
    setSelectedDiscountId('');
    setSelectedPromoId('');
    setDiscountIdVerified(false);
    setSelectedSlot(null);
    setStaffPreference(null);
    setStaffPickerUnavailable(false);
    resetHotelPreferences();
  }

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

  useEffect(() => {
    // No setDiscounts([]) reset here (react-hooks/set-state-in-effect) -
    // applicableDiscounts below already returns [] whenever
    // canApplyDiscounts is false, so a stale `discounts` list sitting
    // unused in state is never read.
    if (!accessToken || !selectedBranchId || !canApplyDiscounts) {
      return;
    }

    let isMounted = true;

    void listDiscounts(accessToken, {
      branchId: selectedBranchId,
      activeOnly: true,
    }).then((result) => {
      if (!isMounted || !result.data) return;
      setDiscounts(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken, selectedBranchId, canApplyDiscounts]);

  // ---- Derived data ----

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === selectedPetId) ?? null,
    [pets, selectedPetId]
  );

  // Client interview finding: a pet with no recorded weight_class/coat_type
  // has never been staff-assessed onsite, and can only book a service
  // explicitly flagged as not requiring one (Initial Assessment) - never a
  // package. Mirrors the server-side gate in booking.service.ts.
  const isSelectedPetAssessed = Boolean(
    selectedPet?.weight_class && selectedPet.coat_type
  );

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? null,
    [branches, selectedBranchId]
  );

  const availableCategories = useMemo(() => {
    // An unassessed pet can only ever book a Misc service flagged
    // requires_assessed_pet=false (Initial Assessment) - Grooming/Hotel/
    // Daycare/Veterinary are always dead ends for it, so don't even offer
    // those tabs.
    if (!isSelectedPetAssessed) {
      return ['Misc'] as ServiceCategory[];
    }

    return SERVICE_CATEGORIES.filter(
      (candidate) =>
        candidate !== 'Veterinary' || (selectedBranch?.is_vet_branch ?? true)
    );
  }, [selectedBranch, isSelectedPetAssessed]);

  // For an unassessed pet, Initial Assessment is the only thing bookable at
  // all (see availableCategories above) - once the branch's catalog has
  // loaded, pre-select it automatically instead of making the customer find
  // and click the one option in an otherwise-empty-looking Service step.
  useEffect(() => {
    if (
      isSelectedPetAssessed ||
      !selectedBranchId ||
      allServices.length === 0
    ) {
      return;
    }

    const assessmentService = allServices.find(
      (service) => service.category === 'Misc' && !service.requires_assessed_pet
    );

    if (!assessmentService) return;

    // Deferred to a microtask (mirrors SlotPicker/GroomerDashboardPage's own
    // set-state-in-effect pattern) so these updates never run synchronously
    // inside the effect body itself.
    void Promise.resolve().then(() => {
      handleCategorySelect('Misc');
      updateCategorySelection('Misc', () => ({
        serviceIds: [assessmentService.id],
        packageIds: [],
      }));
    });
    // handleCategorySelect/updateCategorySelection are plain function
    // declarations recreated every render (not memoized) - including them
    // would re-run this effect on every render instead of only when the
    // pet/branch/catalog actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelectedPetAssessed, selectedPetId, selectedBranchId, allServices]);

  const servicesForCategory = useMemo(
    () =>
      allServices.filter(
        (service) =>
          service.category === category &&
          // requires_assessed_pet=false services (Initial Assessment) exist
          // ONLY for an unassessed pet - once assessed, they're already
          // done and hidden entirely, leaving only requires_assessed_pet
          // services (everything else, including Reassessment) visible.
          service.requires_assessed_pet === isSelectedPetAssessed
      ),
    [allServices, category, isSelectedPetAssessed]
  );

  const selectedServices = useMemo(
    () =>
      allServices.filter((service) => selectedServiceIds.includes(service.id)),
    [allServices, selectedServiceIds]
  );

  const selectedPackages = useMemo(
    () => packages.filter((pkg) => selectedPackageIds.includes(pkg.id)),
    [packages, selectedPackageIds]
  );

  const serviceNameById = useMemo(
    () => new Map(allServices.map((service) => [service.id, service.name])),
    [allServices]
  );

  // Packages have no category column of their own - filter to only those
  // whose every member service belongs to the currently selected category,
  // matching the server-side invariant booking.service.ts now enforces
  // per-item (multi-item bookings revision).
  const packagesForCategory = useMemo(
    () =>
      packages.filter((pkg) =>
        (pkg.package_services ?? []).every(
          (link) =>
            allServices.find((service) => service.id === link.service_id)
              ?.category === category
        )
      ),
    [packages, allServices, category]
  );

  // Hotel (one cage) and Daycare (one session) only ever hold a single item;
  // Grooming/Veterinary stay multi-select.
  const singleSelectCategory = category === 'Hotel' || category === 'Daycare';

  /** Union of every service already covered by a currently-selected
   * package's bundled price - those services are shown read-only in the
   * Individual service list (#22 follow-up), so a customer/receptionist
   * can't also separately select (and pay for) the same service. */
  const servicesCoveredByPackages = useMemo(() => {
    const covered = new Map<string, string>();
    for (const packageId of selectedPackageIds) {
      const pkg = packages.find((candidate) => candidate.id === packageId);
      for (const link of pkg?.package_services ?? []) {
        covered.set(link.service_id, pkg!.name);
      }
    }
    return covered;
  }, [selectedPackageIds, packages]);

  // selectionsByCategory persists a tab's picks while you're just browsing
  // (switching tabs without selecting anything), but updateCategorySelection
  // clears every other category's picks the moment you actually select or
  // deselect an item anywhere - a booking is always exactly one category,
  // so this can only ever be non-empty for the brief window after switching
  // tabs and before making a new pick, warning that the old pick is about
  // to be dropped.
  const categoriesWithOtherSelections = useMemo(
    () =>
      SERVICE_CATEGORIES.filter((candidate) => {
        if (candidate === category) return false;
        const picks = selectionsByCategory[candidate];
        return Boolean(picks?.serviceIds.length || picks?.packageIds.length);
      }),
    [selectionsByCategory, category]
  );

  const slotDurationMinutes =
    selectedServices.reduce(
      (sum, service) => sum + (service.duration_minutes ?? 60),
      0
    ) +
      selectedPackages.reduce(
        (sum, pkg) =>
          sum +
          (pkg.total_duration_minutes ??
            (pkg.package_services?.length ?? 1) * 60),
        0
      ) || 60;

  /** #22 follow-up: the real scheduled_end, computed from the item-derived
   * slotDurationMinutes rather than SlotPicker's own selectedSlot.end -
   * SlotPicker now runs at the 'availability' step, before any service/
   * package is picked, so its own end time only reflects the fixed
   * DEFAULT_DURATION_MINUTES stand-in and is never accurate enough to
   * submit. Reused here (not just in handleSubmit) so the Hotel care-
   * schedule bounds below judge against the stay actually being booked. */
  const finalScheduledEnd = selectedSlot
    ? new Date(
        new Date(selectedSlot.start).getTime() +
          (category === 'Hotel' ? hotelNights : 1) * slotDurationMinutes * 60000
      ).toISOString()
    : null;

  const hotelCheckInTime = selectedSlot
    ? getDayOneMinTime(selectedSlot.start)
    : null;
  const hotelCheckOutTime = finalScheduledEnd
    ? getLastDayMaxTime(finalScheduledEnd)
    : null;

  // Hotel is priced per night - base_price/bundled_price is the per-night
  // rate, multiplied by however many nights were set on the Service step
  // (mirrors the server's own resolveQuantity in booking.service.ts).
  const hotelNightsMultiplier = category === 'Hotel' ? hotelNights : 1;

  const itemsTotal =
    (selectedServices.reduce((sum, service) => sum + service.base_price, 0) +
      selectedPackages.reduce((sum, pkg) => sum + pkg.bundled_price, 0)) *
    hotelNightsMultiplier;

  const subtotal = itemsTotal;

  // Selectable at the payment step (booking-time discount/promo revision) -
  // every promo whose scope matches the current selection, not just a single
  // auto-picked preview. Anyone can pick a promo (self-service, like a
  // coupon code); no role or payment-method gate.
  const applicablePromos = useMemo(() => {
    if (!selectedBranch) return [];

    const branchKey = selectedBranch.name.trim().toLowerCase();
    const now = new Date();

    return promos.filter((promo) => {
      if (!promo.is_active) return false;
      if (promo.branch_scope !== 'both' && promo.branch_scope !== branchKey) {
        return false;
      }
      if (promo.start_date && new Date(promo.start_date) > now) return false;
      if (promo.end_date && new Date(promo.end_date) < now) return false;
      if (promo.scope_type === 'all_services') return true;

      return (promo.promo_scope ?? []).some(
        (scope) =>
          selectedServiceIds.includes(scope.service_id ?? '') ||
          selectedPackageIds.includes(scope.package_id ?? '')
      );
    });
  }, [promos, selectedBranch, selectedServiceIds, selectedPackageIds]);

  const selectedPromo = useMemo(
    () =>
      applicablePromos.find((promo) => promo.id === selectedPromoId) ?? null,
    [applicablePromos, selectedPromoId]
  );

  const promoDiscount = selectedPromo
    ? selectedPromo.discount_type === 'Percentage'
      ? subtotal * (selectedPromo.value / 100)
      : Math.min(selectedPromo.value, subtotal)
    : 0;

  // Discounts (Cash-only, staff-verified ID) - only shown/selectable once
  // Cash is chosen as the payment method (canApplyDiscounts already gates
  // whether any discounts were even fetched - see the discounts effect).
  const applicableDiscounts = useMemo(() => {
    if (!canApplyDiscounts || paymentMethod !== 'Cash') return [];

    return discounts.filter((discount) => {
      if (!discount.is_active) return false;

      if (discount.scope_type === 'service') {
        return selectedServiceIds.includes(discount.scope_service_id ?? '');
      }
      if (discount.scope_type === 'package') {
        return selectedPackageIds.includes(discount.scope_package_id ?? '');
      }
      return discount.scope_category === category;
    });
  }, [
    canApplyDiscounts,
    paymentMethod,
    discounts,
    selectedServiceIds,
    selectedPackageIds,
    category,
  ]);

  const selectedDiscount = useMemo(
    () =>
      applicableDiscounts.find(
        (discount) => discount.id === selectedDiscountId
      ) ?? null,
    [applicableDiscounts, selectedDiscountId]
  );

  const discountAmount = selectedDiscount
    ? selectedDiscount.discount_type === 'Percentage'
      ? subtotal * (selectedDiscount.value / 100)
      : Math.min(selectedDiscount.value, subtotal)
    : 0;

  const estimatedTotal = Math.max(0, subtotal - discountAmount - promoDiscount);

  const requiresPayment = category !== 'Veterinary';
  const downpaymentAmount =
    category === 'Hotel'
      ? Math.round(subtotal * HOTEL_DOWNPAYMENT_RATE * 100) / 100
      : null;

  // ---- Steps ----

  // #22 follow-up: staff/cage availability is checked BEFORE specific
  // services/packages are picked (category alone is enough to know whether
  // Grooming/Veterinary needs a Staff Picker or Hotel needs a Cage Picker),
  // so the customer learns early if nothing is available rather than after
  // investing effort picking exact items. Grooming/Veterinary's staff
  // choice and Hotel's cage-capacity display both live inside the single
  // 'availability' step alongside Date & Time (merged, not a separate
  // stepper entry) - Daycare gets Date & Time alone there, same as today.
  const steps: StepDef[] = useMemo(() => {
    const list: StepDef[] = [];

    if (isReceptionistMode) {
      list.push({ key: 'customer', label: 'Customer' });
    }

    list.push({ key: 'pet', label: 'Pet' });
    list.push({ key: 'branch', label: 'Branch' });
    list.push({ key: 'category', label: 'Service Type' });

    const availabilityLabel =
      category === 'Hotel'
        ? 'Cage & Date'
        : (category === 'Grooming' || category === 'Veterinary') &&
            !staffPickerUnavailable
          ? 'Staff & Date'
          : 'Date & Time';
    list.push({ key: 'availability', label: availabilityLabel });

    list.push({ key: 'items', label: 'Services' });

    if (category === 'Hotel') {
      list.push({ key: 'hotelDetails', label: 'Care Instructions' });
    }

    list.push({ key: 'payment', label: 'Review & Pay' });

    return list;
  }, [isReceptionistMode, category, staffPickerUnavailable]);

  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.key === currentStepKey)
  );
  const maxReachedIndex = steps.reduce(
    (highest, step, index) =>
      reachedStepKeys.has(step.key) ? Math.max(highest, index) : highest,
    0
  );

  const currentStep = steps[currentStepIndex] ?? steps[0];

  // Repairs `currentStepKey` when the step it points at just disappeared
  // from `steps` (e.g. the Staff step, once Staff Picker turns out to be
  // disabled for this branch+category) - advances to whatever step
  // logically follows it, rather than leaving `currentStepIndex` above to
  // silently resolve to a different step that slid into the same slot.
  const prevStepsRef = useRef(steps);
  useEffect(() => {
    const prevSteps = prevStepsRef.current;
    prevStepsRef.current = steps;

    if (steps.some((step) => step.key === currentStepKey)) return;

    const oldIndex = prevSteps.findIndex((step) => step.key === currentStepKey);
    const fallbackKey =
      prevSteps
        .slice(oldIndex + 1)
        .find((step) => steps.some((s) => s.key === step.key))?.key ??
      steps[steps.length - 1]?.key;

    if (fallbackKey) {
      setCurrentStepKey(fallbackKey);
      setReachedStepKeys((prev) => new Set(prev).add(fallbackKey));
    }
  }, [steps, currentStepKey]);

  function isStepValid(key: StepDef['key']): boolean {
    switch (key) {
      case 'customer':
        return walkInCustomer !== null;
      case 'pet':
        return selectedPetId !== '';
      case 'branch':
        return selectedBranchId !== '';
      case 'category':
        return category !== '';
      case 'availability':
        return (
          selectedSlot !== null &&
          ((category !== 'Grooming' && category !== 'Veterinary') ||
            staffPickerUnavailable ||
            staffPreference !== null)
        );
      case 'items':
        return selectedServiceIds.length + selectedPackageIds.length > 0;
      case 'hotelDetails':
        return true;
      case 'payment':
        return (
          (!requiresPayment || paymentMethod !== '') &&
          (!selectedDiscount?.is_mandated || discountIdVerified)
        );
      default:
        return true;
    }
  }

  const isCurrentStepValid = isStepValid(currentStep.key);

  function advanceTo(nextIndex: number) {
    const clamped = Math.min(Math.max(nextIndex, 0), steps.length - 1);
    const key = steps[clamped]?.key;
    if (!key) return;
    setCurrentStepKey(key);
    setReachedStepKeys((prev) => new Set(prev).add(key));
  }

  function goNext() {
    if (!isCurrentStepValid) return;
    advanceTo(currentStepIndex + 1);
  }

  /** #22 follow-up: fired by SlotPicker (inside the 'availability' step)
   * every time the currently-viewed date's availability resolves. Only
   * warns when that day actually had real candidate slots (time/staff/
   * cage) and every one of them is taken - hasAnySlots is false both when
   * the branch has no hours that weekday and when today's hours have
   * already passed (getDaySlots drops any candidate whose start is already
   * in the past), neither of which is a meaningful "fully booked" signal,
   * so both are silently skipped rather than shown as a warning. */
  function handleSlotAvailabilityChange({
    date,
    hasAnyAvailable,
    hasAnySlots,
  }: {
    date: string;
    hasAnyAvailable: boolean;
    hasAnySlots: boolean;
  }) {
    if (
      !hasAnySlots ||
      hasAnyAvailable ||
      !accessToken ||
      !selectedBranchId ||
      !category
    ) {
      return;
    }

    setIsCheckingAvailability(true);

    // date itself is already confirmed full - start the lookahead the day
    // after it instead of redundantly re-checking the same day.
    const [year, month, day] = date.split('-').map(Number);
    const searchFromDate = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);

    void getNextAvailableSlot(accessToken, {
      branchId: selectedBranchId,
      serviceCategory: category as ServiceCategory,
      fromDate: searchFromDate,
      slotDurationMinutes:
        DEFAULT_DURATION_MINUTES[category as ServiceCategory],
      petWeightClass:
        category === 'Hotel'
          ? (selectedPet?.weight_class ?? undefined)
          : undefined,
    }).then((result) => {
      setIsCheckingAvailability(false);
      // Fails open: a lookup error never shows a false "fully booked" claim.
      if (!result.error) {
        setFullyBookedNotice(result.data);
      }
    });
  }

  function dismissFullyBookedNotice() {
    setFullyBookedNotice(undefined);
  }

  function goBack() {
    const key = steps[Math.max(0, currentStepIndex - 1)]?.key;
    if (key) setCurrentStepKey(key);
  }

  function handleStepperSelect(index: number) {
    if (index <= maxReachedIndex) {
      const key = steps[index]?.key;
      if (key) setCurrentStepKey(key);
    }
  }

  // ---- Selection handlers (reset dependent state on change, AC-2) ----

  function handleCustomerSelect(customer: CustomerProfile) {
    setWalkInCustomer(customer);
    advanceTo(currentStepIndex + 1);
  }

  function handlePetSelect(petId: string) {
    setSelectedPetId(petId);
    // Clears every category's selections - important since an unassessed
    // pet can only book Misc's Initial Assessment, so a selection valid for
    // one pet may not be for another (mirrors handleBranchSelect's own
    // reset below).
    setCategory('');
    setSelectionMode('service');
    setSelectionsByCategory({});
    setSelectedDiscountId('');
    setSelectedPromoId('');
    setDiscountIdVerified(false);
    setSelectedSlot(null);
    setStaffPreference(null);
    setStaffPickerUnavailable(false);
    setHotelNights(1);
    resetHotelPreferences();
  }

  function handleBranchSelect(branchId: string) {
    setSelectedBranchId(branchId);
    setCategory('');
    setSelectionMode('service');
    setSelectionsByCategory({});
    setSelectedDiscountId('');
    setSelectedPromoId('');
    setDiscountIdVerified(false);
    setSelectedSlot(null);
    setStaffPreference(null);
    setStaffPickerUnavailable(false);
    setHotelNights(1);
    resetHotelPreferences();
  }

  /** A package's bundled price already covers its member services - keeping
   * one of them separately selectable would let a customer pay for (and a
   * receptionist book) the same service twice. */
  function packageMemberServiceIds(packageId: string): Set<string> {
    const pkg = packages.find((candidate) => candidate.id === packageId);
    return new Set(
      (pkg?.package_services ?? []).map((link) => link.service_id)
    );
  }

  function toggleServiceSelect(serviceId: string) {
    if (!category) return;
    // Already covered by a selected package's bundled price - read-only
    // (the option card's own onClick shouldn't even be reachable, but this
    // guards against it directly too).
    if (servicesCoveredByPackages.has(serviceId)) return;

    // #22 follow-up: no longer resets selectedSlot/staffPreference here -
    // that made sense when items were picked BEFORE availability (the real
    // item-derived duration used to drive the slot/staff check directly),
    // but items are now picked AFTER availability, which already ran
    // against a fixed placeholder duration independent of which items get
    // chosen. Resetting here silently wiped out an already-confirmed slot,
    // which then made handleSubmit's `!selectedSlot` guard fail silently -
    // Confirm booking looked like it did nothing at all.
    if (selectedServiceIds.includes(serviceId)) {
      updateCategorySelection(category, (current) => ({
        ...current,
        serviceIds: current.serviceIds.filter((id) => id !== serviceId),
      }));
    } else if (singleSelectCategory) {
      updateCategorySelection(category, () => ({
        serviceIds: [serviceId],
        packageIds: [],
      }));
    } else {
      updateCategorySelection(category, (current) => ({
        ...current,
        serviceIds: [...current.serviceIds, serviceId],
      }));
    }
  }

  function togglePackageSelect(packageId: string) {
    if (!category) return;

    // #22 follow-up: see toggleServiceSelect's comment above - the
    // selectedSlot/staffPreference reset was removed for the same reason.
    if (selectedPackageIds.includes(packageId)) {
      updateCategorySelection(category, (current) => ({
        ...current,
        packageIds: current.packageIds.filter((id) => id !== packageId),
      }));
    } else if (singleSelectCategory) {
      updateCategorySelection(category, () => ({
        serviceIds: [],
        packageIds: [packageId],
      }));
    } else {
      updateCategorySelection(category, (current) => ({
        ...current,
        serviceIds: current.serviceIds.filter(
          (id) => !packageMemberServiceIds(packageId).has(id)
        ),
        packageIds: [...current.packageIds, packageId],
      }));
    }
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

  function addHotelPlayBlock() {
    setHotelPlaying((prev) => [...prev, { ...EMPTY_HOTEL_PLAYING_ROW }]);
  }

  function updateHotelPlayBlock(
    index: number,
    updates: Partial<typeof EMPTY_HOTEL_PLAYING_ROW>
  ) {
    setHotelPlaying((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row))
    );
  }

  function removeHotelPlayBlock(index: number) {
    setHotelPlaying((prev) => prev.filter((_, i) => i !== index));
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
          ? { food_catalog_id: row.food_catalog_id }
          : {}),
      };
    });

    const walking: HotelBookingPreferenceWalking[] = hotelWalking.map(
      (row) => ({
        time_block: row.time_block,
        duration_minutes: row.duration_minutes,
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      })
    );

    const playing: HotelBookingPreferencePlaying[] = hotelPlaying.map(
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
          ? { medication_catalog_id: row.medication_catalog_id }
          : {}),
      }));

    if (
      feeding.length === 0 &&
      walking.length === 0 &&
      playing.length === 0 &&
      medications.length === 0
    ) {
      return undefined;
    }

    return {
      uniform_instructions: hotelUniformInstructions,
      feeding,
      walking,
      playing,
      medications,
    };
  }, [
    category,
    hotelFeeding,
    hotelWalking,
    hotelPlaying,
    hotelMedications,
    hotelUniformInstructions,
  ]);

  async function handleSubmit() {
    if (
      !accessToken ||
      !selectedPetId ||
      !selectedBranchId ||
      !category ||
      !selectedSlot ||
      selectedServiceIds.length + selectedPackageIds.length === 0
    ) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const paymentConfirmed = requiresPayment
      ? ONLINE_METHODS.has(paymentMethod as PaymentMethod)
      : false;

    // #22 follow-up: try/catch is load-bearing, not defensive boilerplate -
    // without it, a thrown exception here (a network failure, a bad JSON
    // response) would skip setIsSubmitting(false) entirely, leaving the
    // button silently stuck disabled with no visible error - exactly the
    // "clicking Confirm booking doesn't advance or error" symptom.
    try {
      const result = await createBooking(accessToken, {
        ...(isReceptionistMode && walkInCustomer
          ? { customer_id: walkInCustomer.id }
          : {}),
        pet_id: selectedPetId,
        branch_id: selectedBranchId,
        service_category: category,
        items: [
          ...selectedServiceIds.map((service_id) => ({ service_id })),
          ...selectedPackageIds.map((package_id) => ({ package_id })),
        ],
        scheduled_start: selectedSlot.start,
        scheduled_end: finalScheduledEnd!,
        ...(staffPreference ? { staff_preference: staffPreference } : {}),
        ...(requiresPayment && paymentMethod
          ? {
              payment_method: paymentMethod,
              payment_confirmed: paymentConfirmed,
            }
          : {}),
        ...(selectedDiscount ? { discount_id: selectedDiscount.id } : {}),
        ...(selectedPromo ? { promo_id: selectedPromo.id } : {}),
        ...(specialInstructions.trim()
          ? { special_instructions: specialInstructions.trim() }
          : {}),
        ...(hotelPreferencesPayload
          ? { hotel_preferences: hotelPreferencesPayload }
          : {}),
      });

      if (result.error || !result.data) {
        // #22 follow-up: the availability step checks capacity/staff against
        // a placeholder duration (real service/package duration isn't known
        // until the later Services step) - a longer real duration than that
        // placeholder is the most likely reason a submission gets rejected
        // here despite the slot having looked open earlier, so say so
        // instead of leaving a bare server error message.
        setSubmitError(
          `${result.error ?? 'Could not create the booking.'} This can happen when the actual service/package duration no longer fits the time you picked - try choosing a different time.`
        );
        return;
      }

      setConfirmedBooking(result.data);
    } catch {
      setSubmitError(
        'Could not reach the server. Check your connection and try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
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
                  {PET_TYPE_LABEL[pet.pet_type]}
                  {pet.weight_class && pet.coat_type ? (
                    <>
                      {' '}
                      &middot; {WEIGHT_CLASS_LABEL[pet.weight_class]} (
                      {pet.weight_class}) &middot;{' '}
                      {COAT_TYPE_LABEL[pet.coat_type]}
                    </>
                  ) : (
                    <> &middot; Not yet assessed</>
                  )}
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
                isStaff={isReceptionistMode}
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

      case 'category':
        return (
          <div className={styles.serviceStep}>
            <div className={styles.categoryGrid}>
              {availableCategories.map((candidate) => {
                const Icon = CATEGORY_ICONS[candidate];
                return (
                  <button
                    key={candidate}
                    type="button"
                    aria-pressed={category === candidate}
                    className={`${styles.categoryCard} ${
                      category === candidate ? styles.selected : ''
                    }`}
                    onClick={() => handleCategorySelect(candidate)}
                  >
                    <Icon className={styles.categoryIcon} aria-hidden="true" />
                    <span className={styles.categoryLabel}>{candidate}</span>
                  </button>
                );
              })}
            </div>

            {categoriesWithOtherSelections.length > 0 ? (
              <p className={styles.crossCategoryNotice} role="alert">
                You still have items selected under{' '}
                {categoriesWithOtherSelections.join(', ')} - a booking only ever
                covers one category, so selecting anything under{' '}
                <strong>{category}</strong> will clear
                {categoriesWithOtherSelections.length > 1
                  ? ' those selections'
                  : ' that selection'}
                . Book the other
                {categoriesWithOtherSelections.length > 1
                  ? ' categories'
                  : ' category'}{' '}
                separately if you need both.
              </p>
            ) : null}

            {selectedPet && !isSelectedPetAssessed ? (
              <p className={styles.copy}>
                {selectedPet.name} hasn&apos;t been assessed by staff yet
                (weight class and coat type are recorded onsite). Only Initial
                Assessment can be booked for this pet until then.
              </p>
            ) : null}
          </div>
        );

      case 'availability':
        return (
          <div className={styles.slotStep}>
            {category === 'Hotel' && selectedPet?.weight_class ? (
              <p className={styles.copy}>
                {selectedPet.name} is{' '}
                {WEIGHT_CLASS_LABEL[selectedPet.weight_class]} (
                {selectedPet.weight_class}) - the matching cage size is marked
                Recommended below.
              </p>
            ) : null}

            {category === 'Hotel' ? (
              <div className={styles.nightsField}>
                <label>
                  <span>Number of nights</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={hotelNights}
                    onChange={(event) =>
                      setHotelNights(
                        Math.max(1, Number(event.target.value) || 1)
                      )
                    }
                  />
                </label>
                {NIGHT_COUNT_PRESETS.map((nights) => (
                  <button
                    key={nights}
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setHotelNights(nights)}
                  >
                    {nights} nights
                  </button>
                ))}
              </div>
            ) : null}

            <SlotPicker
              accessToken={accessToken!}
              branchId={selectedBranchId}
              serviceCategory={category as ServiceCategory}
              slotDurationMinutes={
                DEFAULT_DURATION_MINUTES[category as ServiceCategory]
              }
              petWeightClass={
                category === 'Hotel'
                  ? (selectedPet?.weight_class ?? undefined)
                  : undefined
              }
              viewerMode={isReceptionistMode ? 'staff' : 'customer'}
              selectedSlot={selectedSlot}
              onSelect={(slot) => setSelectedSlot(slot)}
              onAvailabilityChange={handleSlotAvailabilityChange}
            />

            {selectedSlot &&
            (category === 'Grooming' || category === 'Veterinary') &&
            !staffPickerUnavailable ? (
              <StaffPickerList
                accessToken={accessToken!}
                branchId={selectedBranchId}
                serviceCategory={category as 'Grooming' | 'Veterinary'}
                scheduledStart={selectedSlot.start}
                scheduledEnd={selectedSlot.end}
                selected={staffPreference}
                onSelect={setStaffPreference}
                onUnavailable={() => setStaffPickerUnavailable(true)}
              />
            ) : null}

            {selectedSlot && category === 'Hotel' ? (
              <CagePicker
                accessToken={accessToken!}
                branchId={selectedBranchId}
                date={selectedSlot.start.slice(0, 10)}
                recommendedSize={selectedPet?.weight_class ?? null}
              />
            ) : null}
          </div>
        );

      case 'items':
        return (
          <div className={styles.serviceStep}>
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
                {packagesForCategory.length > 0 && isSelectedPetAssessed ? (
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

            {singleSelectCategory ? (
              <p className={styles.copy}>
                {category === 'Hotel'
                  ? 'One cage per booking - selecting another will replace your current pick.'
                  : 'One session per booking - selecting another will replace your current pick.'}
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
                    selectedPet?.weight_class != null &&
                    deriveHotelCageSize(service.name) ===
                      selectedPet.weight_class;

                  const isChecked = selectedServiceIds.includes(service.id);
                  const coveredByPackageName = servicesCoveredByPackages.get(
                    service.id
                  );

                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={isChecked}
                      aria-disabled={coveredByPackageName !== undefined}
                      disabled={coveredByPackageName !== undefined}
                      className={`${styles.optionCard} ${
                        isChecked ? styles.selected : ''
                      } ${coveredByPackageName !== undefined ? styles.readOnly : ''}`}
                      onClick={() => toggleServiceSelect(service.id)}
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
                        PHP{' '}
                        {(service.base_price * hotelNightsMultiplier).toFixed(
                          2
                        )}
                        {category === 'Hotel'
                          ? ` (PHP ${service.base_price.toFixed(2)}/night × ${hotelNights})`
                          : ''}
                      </span>
                      {coveredByPackageName !== undefined ? (
                        <span className={styles.optionMeta}>
                          Included in {coveredByPackageName}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {category && selectionMode === 'package' ? (
              <div className={styles.optionGrid}>
                {packagesForCategory.map((pkg) => {
                  const isChecked = selectedPackageIds.includes(pkg.id);

                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      aria-pressed={isChecked}
                      className={`${styles.optionCard} ${
                        isChecked ? styles.selected : ''
                      }`}
                      onClick={() => togglePackageSelect(pkg.id)}
                    >
                      <span className={styles.optionTitle}>{pkg.name}</span>
                      <span className={styles.optionMeta}>
                        PHP{' '}
                        {(pkg.bundled_price * hotelNightsMultiplier).toFixed(2)}
                        {category === 'Hotel'
                          ? ` (PHP ${pkg.bundled_price.toFixed(2)}/night × ${hotelNights})`
                          : ''}
                      </span>
                      <ul className={styles.readOnlyList}>
                        {(pkg.package_services ?? []).map((entry) => (
                          <li key={entry.service_id}>
                            {serviceNameById.get(entry.service_id) ?? 'Service'}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {category ? (
              <div className={styles.pricingRowTotal}>
                <span>Running total (before promos/discounts)</span>
                <span>PHP {itemsTotal.toFixed(2)}</span>
              </div>
            ) : null}

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
                const notOnDayOne =
                  hotelCheckInTime !== null &&
                  !isMealApplicableOnDayOne(mealTime, hotelCheckInTime);
                const notOnLastDay =
                  hotelCheckOutTime !== null &&
                  !isMealApplicableOnLastDay(mealTime, hotelCheckOutTime);

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
                    {row && (notOnDayOne || notOnLastDay) ? (
                      <p className={styles.copy}>
                        {`Not served on ${notOnDayOne ? 'arrival day' : ''}${notOnDayOne && notOnLastDay ? ' or ' : ''}${notOnLastDay ? 'departure day' : ''} due to check-in/checkout time.`}
                      </p>
                    ) : null}
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
                    <select
                      className={styles.input}
                      aria-label="Walk time of day"
                      value={row.time_block}
                      onChange={(event) =>
                        updateHotelWalkBlock(index, {
                          time_block: event.target
                            .value as HotelBookingPreferenceWalking['time_block'],
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
                      placeholder="Duration (min)"
                      value={row.duration_minutes}
                      onChange={(event) =>
                        updateHotelWalkBlock(index, {
                          duration_minutes: Number(event.target.value),
                        })
                      }
                    />
                    {DURATION_PRESETS_MINUTES.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          updateHotelWalkBlock(index, {
                            duration_minutes: minutes,
                          })
                        }
                      >
                        {minutes}m
                      </button>
                    ))}
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
                  <p className={styles.copy}>
                    Applies daily - won&apos;t happen before check-in on arrival
                    day or after checkout on departure day.
                  </p>
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
              <span className={styles.sectionTitle}>Playtime</span>
              {hotelPlaying.map((row, index) => (
                <div key={index} className={styles.instructionBlock}>
                  <div className={styles.inlineFields}>
                    <select
                      className={styles.input}
                      aria-label="Playtime time of day"
                      value={row.time_block}
                      onChange={(event) =>
                        updateHotelPlayBlock(index, {
                          time_block: event.target
                            .value as HotelBookingPreferenceWalking['time_block'],
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
                      placeholder="Duration (min)"
                      value={row.duration_minutes}
                      onChange={(event) =>
                        updateHotelPlayBlock(index, {
                          duration_minutes: Number(event.target.value),
                        })
                      }
                    />
                    {DURATION_PRESETS_MINUTES.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() =>
                          updateHotelPlayBlock(index, {
                            duration_minutes: minutes,
                          })
                        }
                      >
                        {minutes}m
                      </button>
                    ))}
                    <input
                      className={styles.input}
                      placeholder="Notes (optional)"
                      value={row.notes}
                      onChange={(event) =>
                        updateHotelPlayBlock(index, {
                          notes: event.target.value,
                        })
                      }
                    />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => removeHotelPlayBlock(index)}
                    >
                      Remove
                    </button>
                  </div>
                  <p className={styles.copy}>
                    Applies daily - won&apos;t happen before check-in on arrival
                    day or after checkout on departure day.
                  </p>
                </div>
              ))}
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={addHotelPlayBlock}
              >
                Add playtime
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
                  <p className={styles.copy}>
                    Applies daily - won&apos;t happen before check-in on arrival
                    day or after checkout on departure day.
                  </p>
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
              {selectedServices.map((service) => (
                <div key={service.id} className={styles.pricingRow}>
                  <span>
                    {service.name}
                    {hotelNightsMultiplier > 1
                      ? ` × ${hotelNightsMultiplier} nights`
                      : ''}
                  </span>
                  <span>
                    PHP{' '}
                    {(service.base_price * hotelNightsMultiplier).toFixed(2)}
                  </span>
                </div>
              ))}
              {selectedPackages.map((pkg) => (
                <div key={pkg.id} className={styles.pricingRow}>
                  <span>
                    {pkg.name}
                    {hotelNightsMultiplier > 1
                      ? ` × ${hotelNightsMultiplier} nights`
                      : ''}
                  </span>
                  <span>
                    PHP {(pkg.bundled_price * hotelNightsMultiplier).toFixed(2)}
                  </span>
                </div>
              ))}
              {category === 'Grooming' && selectedServices.length > 0 ? (
                <p className={styles.copy}>
                  Grooming price may be adjusted for your pet's size and coat at
                  confirmation.
                </p>
              ) : null}
              {selectedDiscount ? (
                <div className={styles.pricingRow}>
                  <span>{selectedDiscount.name}</span>
                  <span>-PHP {discountAmount.toFixed(2)}</span>
                </div>
              ) : null}
              {selectedPromo ? (
                <div className={styles.pricingRow}>
                  <span>{selectedPromo.name}</span>
                  <span>-PHP {promoDiscount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className={styles.pricingRowTotal}>
                <span>Estimated total</span>
                <span>PHP {estimatedTotal.toFixed(2)}</span>
              </div>
              {downpaymentAmount !== null ? (
                <p className={styles.copy}>
                  50% downpayment required now: PHP{' '}
                  {downpaymentAmount.toFixed(2)}
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

            {canApplyDiscounts ? (
              paymentMethod === 'Cash' ? (
                <fieldset className={styles.field}>
                  <legend className={styles.fieldLabel}>
                    Discount (Cash only - verify ID before applying)
                  </legend>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="discount"
                      checked={selectedDiscountId === ''}
                      onChange={() => {
                        setSelectedDiscountId('');
                        setDiscountIdVerified(false);
                      }}
                    />
                    None
                  </label>
                  {applicableDiscounts.map((discount) => (
                    <label key={discount.id} className={styles.radioOption}>
                      <input
                        type="radio"
                        name="discount"
                        checked={selectedDiscountId === discount.id}
                        onChange={() => {
                          setSelectedDiscountId(discount.id);
                          setDiscountIdVerified(false);
                        }}
                      />
                      {discount.name} (
                      {discount.discount_type === 'Percentage'
                        ? `${discount.value}%`
                        : `PHP ${discount.value.toFixed(2)}`}
                      )
                    </label>
                  ))}
                  {applicableDiscounts.length === 0 ? (
                    <p className={styles.copy}>
                      No discounts apply to the selected items.
                    </p>
                  ) : null}
                  {selectedDiscount?.is_mandated ? (
                    <label className={styles.radioOption}>
                      <input
                        type="checkbox"
                        checked={discountIdVerified}
                        onChange={(event) =>
                          setDiscountIdVerified(event.target.checked)
                        }
                      />
                      I have verified the customer&apos;s ID for this discount
                    </label>
                  ) : null}
                </fieldset>
              ) : (
                <p className={styles.copy}>
                  Select Cash as the payment method to apply a discount.
                </p>
              )
            ) : null}

            {applicablePromos.length > 0 ? (
              <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>Promo</legend>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="promo"
                    checked={selectedPromoId === ''}
                    onChange={() => setSelectedPromoId('')}
                  />
                  None
                </label>
                {applicablePromos.map((promo) => (
                  <label key={promo.id} className={styles.radioOption}>
                    <input
                      type="radio"
                      name="promo"
                      checked={selectedPromoId === promo.id}
                      onChange={() => setSelectedPromoId(promo.id)}
                    />
                    {promo.name} (
                    {promo.discount_type === 'Percentage'
                      ? `${promo.value}%`
                      : `PHP ${promo.value.toFixed(2)}`}
                    )
                  </label>
                ))}
              </fieldset>
            ) : null}

            <PayMongoFeeNotice paymentMethod={paymentMethod} />

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

      {currentStep.key !== 'customer' && currentStep.key !== 'payment' ? (
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
            disabled={
              !isCurrentStepValid || isLastStep || isCheckingAvailability
            }
            onClick={goNext}
          >
            {isCheckingAvailability ? 'Checking availability...' : 'Next'}
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

      {fullyBookedNotice !== undefined ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            {fullyBookedNotice === null ? (
              <>
                <h2 className={styles.modalTitle}>No availability found</h2>
                <p className={styles.copy}>
                  This branch has no open slots for this service in the next
                  couple of weeks. Try a different branch or service.
                </p>
              </>
            ) : (
              <>
                <h2 className={styles.modalTitle}>This looks fully booked</h2>
                <p className={styles.copy}>
                  The earliest opening we found is{' '}
                  {new Date(fullyBookedNotice.date).toLocaleDateString()}, from{' '}
                  {new Date(
                    fullyBookedNotice.earliestSlot.start
                  ).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  to{' '}
                  {new Date(
                    fullyBookedNotice.earliestSlot.end
                  ).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  .
                </p>
              </>
            )}
            <div className={styles.navRow}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  dismissFullyBookedNotice();
                  setCurrentStepKey('category');
                  setReachedStepKeys((prev) => new Set(prev).add('category'));
                }}
              >
                Change branch/service
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={dismissFullyBookedNotice}
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
