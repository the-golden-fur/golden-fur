import {
  Bath,
  Bed,
  Bone,
  Brush,
  Building2,
  Calendar,
  Cat,
  ClipboardList,
  Clock,
  Dog,
  Droplet,
  Footprints,
  Gift,
  HeartPulse,
  Home,
  MapPin,
  Package,
  PawPrint,
  Scale,
  Scissors,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  Thermometer,
  Users,
  Utensils,
  Warehouse,
  Wind,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated allowlist an admin may pick from for a service type/service/
 * package's icon (Architectural-Change-History). Kept in lockstep with the
 * server's own copy (server/src/features/maintenance/modules/validators/
 * maintenance.validator.ts's SERVICE_ICON_NAMES) - add/remove a name in
 * both places together, since the server rejects any name not in its list.
 */
export const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  Scissors,
  Bath,
  PawPrint,
  Dog,
  Cat,
  Bone,
  Stethoscope,
  Syringe,
  HeartPulse,
  Bed,
  Home,
  Droplet,
  Sparkles,
  Package,
  Gift,
  Utensils,
  Footprints,
  ShieldCheck,
  Calendar,
  Clock,
  Star,
  Scale,
  Brush,
  Wind,
  ClipboardList,
  Users,
  MapPin,
  Building2,
  Warehouse,
  Thermometer,
};

export const SERVICE_ICON_NAMES = Object.keys(SERVICE_ICON_MAP);

/** Looks up a stored icon name, tolerating one that's no longer in the
 * current allowlist (e.g. removed after this list changes) by rendering
 * nothing instead of throwing. */
export function getServiceIcon(
  name: string | null | undefined
): LucideIcon | null {
  if (!name) return null;
  return SERVICE_ICON_MAP[name] ?? null;
}
