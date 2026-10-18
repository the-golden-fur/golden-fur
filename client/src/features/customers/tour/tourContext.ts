import { createContext, useContext } from 'react';

export interface TourContextValue {
  /** True while the tour or its section picker is open. */
  isActive: boolean;
  /** Runs one section, or every section in order when no id is given. */
  startTour: (sectionId?: string) => void;
  /** Opens the "which part do you want to see?" list. */
  openSectionPicker: () => void;
}

// A harmless default rather than a throw: SpinWheelPopup reads this, and it
// is also rendered (and tested) outside TourProvider.
export const TourContext = createContext<TourContextValue>({
  isActive: false,
  startTour: () => {},
  openSectionPicker: () => {},
});

export function useTour(): TourContextValue {
  return useContext(TourContext);
}
