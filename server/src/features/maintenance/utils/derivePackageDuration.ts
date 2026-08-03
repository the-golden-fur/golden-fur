/**
 * Pure derivation, mirroring deriveBundledPrice.ts's shape: (included
 * services' duration_minutes[]) -> a package's total duration. Packages have
 * no stored duration column of their own - unlike price, there is no bundle
 * discount concept for time, so this is a plain sum. A null member duration
 * (e.g. a Grooming/Veterinary service that's slot-based, not duration-based)
 * counts as 0 rather than making the whole package's duration unknown.
 */
export function derivePackageDuration(
  includedServiceDurations: Array<number | null>
): number | null {
  if (includedServiceDurations.length === 0) return null;

  return includedServiceDurations.reduce(
    (total: number, minutes) => total + (minutes ?? 0),
    0
  );
}
