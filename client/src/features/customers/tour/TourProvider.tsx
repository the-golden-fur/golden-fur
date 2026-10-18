import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { TourContext } from './tourContext';
import { TourOverlay, type TourOverlayStep } from './TourOverlay';
import { TourSectionPicker } from './TourSectionPicker';
import { TOUR_SECTIONS, type TourSection } from './tourSections';

interface TourProviderProps {
  children: ReactNode;
  sections?: TourSection[];
}

function flatten(sections: TourSection[]): TourOverlayStep[] {
  return sections.flatMap((section) =>
    section.steps.map((step, index) => ({
      ...step,
      sectionTitle: section.title,
      indexInSection: index,
      sectionLength: section.steps.length,
    }))
  );
}

/**
 * The customer tutorial: a spotlight tour over the real portal UI, grouped
 * into sections (tourSections.ts). Wraps the customer AppShell in
 * CustomerAuthGuard, so Settings and the mascot can replay it from any page
 * - every step's target lives in that shell (sidebar, navbar, mascot).
 *
 * It starts on its own in exactly one case: CustomerSignupForm has just
 * created the account and redirected to /portal with
 * `state: { justRegistered: true }`. The flag is cleared the moment the tour
 * starts, so a refresh, Back, or any later login never starts it again.
 * Everything else (Settings > Preferences, the mascot's Tutorial bubble) is
 * an explicit click that opens the section picker.
 */
export function TourProvider({
  children,
  sections = TOUR_SECTIONS,
}: TourProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<TourOverlayStep[] | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const startTour = useCallback(
    (sectionId?: string) => {
      const chosen = sectionId
        ? sections.filter((section) => section.id === sectionId)
        : sections;
      const flat = flatten(chosen);

      setIsPickerOpen(false);
      setSteps(flat.length > 0 ? flat : null);
    },
    [sections]
  );

  const openSectionPicker = useCallback(() => {
    setSteps(null);
    setIsPickerOpen(true);
  }, []);

  // Fresh-registration auto-start. The ref keeps it to one start per flag
  // even if this effect re-runs before the cleared state lands.
  const justRegistered =
    location.pathname === '/portal' &&
    (location.state as { justRegistered?: boolean } | null)?.justRegistered ===
      true;
  const handledRegistrationKey = useRef<string | null>(null);

  useEffect(() => {
    if (!justRegistered || handledRegistrationKey.current === location.key) {
      return;
    }

    handledRegistrationKey.current = location.key;
    startTour();
    navigate(location.pathname, { replace: true, state: null });
  }, [justRegistered, location.key, location.pathname, navigate, startTour]);

  const value = useMemo(
    () => ({
      isActive: steps !== null || isPickerOpen,
      startTour,
      openSectionPicker,
    }),
    [steps, isPickerOpen, startTour, openSectionPicker]
  );

  return (
    <TourContext.Provider value={value}>
      {children}

      {isPickerOpen ? (
        <TourSectionPicker
          sections={sections}
          onStart={startTour}
          onClose={() => setIsPickerOpen(false)}
        />
      ) : null}

      {steps ? (
        <TourOverlay
          // Remount per run, so a replay always starts from step 1.
          key={steps.map((step) => step.title).join('|')}
          steps={steps}
          onClose={() => setSteps(null)}
        />
      ) : null}
    </TourContext.Provider>
  );
}
