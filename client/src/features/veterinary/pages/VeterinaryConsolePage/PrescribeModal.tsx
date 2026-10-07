import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Modal } from '../../../../shared/components/Modal/Modal';
import { PrescriptionPrintout } from '../../../../shared/components/PrescriptionPrintout/PrescriptionPrintout';
import { listPetPrescriptions } from '../../../customers/api/customer.api';
import type { PetPrescriptionHistoryEntry } from '../../../customers/customer.types';
import { listMedicationCatalog } from '../../api/veterinary.api';
import type {
  Consultation,
  MedicationInput,
  VetMedicationCatalogItem,
} from '../../veterinary.types';
import { PrescriptionEditor } from './PrescriptionEditor';
import {
  findMissingDosage,
  includePendingMedicine,
  seedMedications,
  withValidQuantities,
} from './prescriptionMedications';
import styles from './ServicesDoneModal.module.css';

export interface PrescribeModalProps {
  /** The visit that was just completed. */
  consultation: Consultation;
  petName: string;
  accessToken: string;
  /** Where this sits in the after-visit flow, e.g. "Step 1 of 2". */
  stepLabel: string;
  isSaving: boolean;
  /** A save error from the server, shown until the next attempt. */
  error: string | null;
  /** Saves the prescription. Resolves to whether it was saved. */
  onSave: (fields: {
    medications: MedicationInput[];
    soldAtPharmacy: boolean;
  }) => Promise<boolean>;
  /** The prescription was saved - on to the next step. */
  onContinue: () => void;
  /** Nothing saved - on to the next step. */
  onSkip: () => void;
  /** The pop-up's X - leaves the after-visit flow altogether. */
  onClose: () => void;
}

/**
 * Step 1 of the flow that follows a completed visit: prescribe for the
 * patient, print it, or skip. Starts from whatever is already saved on the
 * visit, so coming Back from the follow-up step shows the prescription just
 * written. Saving goes through the same finished-visit edit as the details
 * form's "Edit record" (medicine bought from our pharmacy is billed, and the
 * customer is told). Mounted only while open.
 *
 * A prescription is never saved empty by accident: a name still sitting in
 * the add box is added as a row, a row without a dosage holds the save, and
 * no medicine at all means Skip, not Save.
 */
export function PrescribeModal({
  consultation,
  petName,
  accessToken,
  stepLabel,
  isSaving,
  error,
  onSave,
  onContinue,
  onSkip,
  onClose,
}: PrescribeModalProps) {
  const [medications, setMedications] = useState<MedicationInput[]>(() =>
    seedMedications(consultation)
  );
  const [pendingName, setPendingName] = useState('');
  const [soldAtPharmacy, setSoldAtPharmacy] = useState(
    consultation.sold_at_pharmacy ?? false
  );
  const [medicationCatalog, setMedicationCatalog] = useState<
    VetMedicationCatalogItem[]
  >([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printing, setPrinting] = useState<PetPrescriptionHistoryEntry | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    void listMedicationCatalog(accessToken).then((result) => {
      if (isMounted && result.data) setMedicationCatalog(result.data);
    });

    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  /** The prescription as it should be saved, or null when it isn't ready -
   * in which case the reason is on screen. */
  function readyPrescription(): MedicationInput[] | null {
    const all = includePendingMedicine(
      medications,
      pendingName,
      medicationCatalog
    );

    if (all.length !== medications.length) {
      setMedications(all);
      setPendingName('');
    }

    if (all.length === 0) {
      setProblem('Add a medicine first, or press Skip.');
      return null;
    }

    const missingDosage = findMissingDosage(all);
    if (missingDosage) {
      setProblem(`Enter a dosage for ${missingDosage.name}.`);
      return null;
    }

    setProblem(null);
    return withValidQuantities(all);
  }

  async function handleSaveAndContinue() {
    const ready = readyPrescription();
    if (!ready) return;

    if (await onSave({ medications: ready, soldAtPharmacy })) onContinue();
  }

  /** Saves first - the printed sheet is built from the saved prescription,
   * the same way the details form's Print button builds it. */
  async function handlePrint() {
    const ready = readyPrescription();
    if (!ready) return;

    setIsPrinting(true);
    const saved = await onSave({ medications: ready, soldAtPharmacy });

    if (!saved) {
      setIsPrinting(false);
      return;
    }

    const result = await listPetPrescriptions(consultation.pet_id, accessToken);
    const entry = result.data?.find(
      (candidate) => candidate.consultation_id === consultation.id
    );
    setIsPrinting(false);

    if (!entry) {
      setProblem(
        result.error ??
          'The prescription was saved, but it could not be loaded for printing.'
      );
      return;
    }

    // The sheet has to be in the page before the print dialog opens.
    flushSync(() => setPrinting(entry));
    window.print();
  }

  const medicinePaid =
    consultation.medication_transaction != null &&
    consultation.medication_transaction.payment_status !== 'Pending';
  const isBusy = isSaving || isPrinting;
  const shownError = problem ?? error;

  return (
    <>
      <Modal
        isOpen
        title={`${stepLabel}: Prescription for ${petName}`}
        onClose={onClose}
        closeOnBackdropClick={false}
        size="wide"
      >
        <div className={styles.body}>
          <p className={styles.copy}>
            The visit is completed. Prescribe any medicine {petName} needs and
            print it for the owner, or skip if there is none.
          </p>

          <PrescriptionEditor
            medications={medications}
            onMedicationsChange={setMedications}
            pendingName={pendingName}
            onPendingNameChange={setPendingName}
            soldAtPharmacy={soldAtPharmacy}
            onSoldAtPharmacyChange={setSoldAtPharmacy}
            medicationCatalog={medicationCatalog}
            editable
            canWrite
            medicinePaid={medicinePaid}
            showPaidNote={medicinePaid}
          />

          {shownError ? (
            <p className={styles.errorBanner} role="alert">
              {shownError}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={isBusy}
              onClick={() => void handleSaveAndContinue()}
            >
              {isSaving && !isPrinting ? 'Saving...' : 'Save and continue'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              disabled={isBusy}
              onClick={() => void handlePrint()}
            >
              {isPrinting ? 'Preparing...' : 'Print prescription'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              disabled={isBusy}
              onClick={onSkip}
            >
              Skip
            </button>
          </div>
        </div>
      </Modal>
      {printing ? (
        <PrescriptionPrintout
          branchName={printing.branch_name}
          branchAddress={printing.branch_address}
          veterinarianName={printing.veterinarian_name}
          petName={printing.pet_name}
          ownerName={printing.owner_name}
          date={printing.date}
          medications={printing.medications}
          onDone={() => setPrinting(null)}
        />
      ) : null}
    </>
  );
}
