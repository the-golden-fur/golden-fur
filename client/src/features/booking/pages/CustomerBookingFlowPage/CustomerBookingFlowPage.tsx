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
  type PaymentMethod,
  type ServiceCategory,
  type StaffPreferenceInput,
} from '../../booking.types';
import styles from './CustomerBookingFlowPage.module.css';

const ONLINE_METHODS = new Set<PaymentMethod>(['GCash', 'Maya']);
const HOTEL_DOWNPAYMENT_RATE = 0.5;

interface StepDef {
  key:
    | 'customer'
    | 'pet'
    | 'branch'
    | 'service'
    | 'slot'
    | 'staff'
    | 'addons'
    | 'payment';
  label: string;
}

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

  const requiresPayment = category !== 'Veterinary';
  const downpaymentAmount =
    category === 'Hotel'
      ? Math.round(subtotal * HOTEL_DOWNPAYMENT_RATE * 100) / 100
      : null;

  // ---- Steps ----

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
          Status: {confirmedBooking.status}.{' '}
          {confirmedBooking.status === 'Pending'
            ? 'This booking will be confirmed once payment is received at the counter.'
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
                <span className={styles.optionMeta}>{pet.pet_type}</span>
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

            {category && selectionMode === 'service' ? (
              <div className={styles.optionGrid}>
                {servicesForCategory.length === 0 ? (
                  <p className={styles.copy}>
                    No {category} services available at this branch.
                  </p>
                ) : null}
                {servicesForCategory.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    className={`${styles.optionCard} ${
                      selectedServiceId === service.id ? styles.selected : ''
                    }`}
                    onClick={() => handleServiceSelect(service.id)}
                  >
                    <span className={styles.optionTitle}>{service.name}</span>
                    <span className={styles.optionMeta}>
                      PHP {service.base_price.toFixed(2)}
                    </span>
                  </button>
                ))}
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
