/**
 * Mirrors client/src/shared/config/presetAvatars.ts's ids/urls exactly - the
 * client only ever sends a preset `id`; the server resolves it against this
 * map itself and stores that trusted url, rather than trusting a
 * client-supplied url directly (see uploadStaffAvatar/uploadCustomerAvatar's
 * preset branch).
 */
export const PRESET_AVATAR_URLS_BY_ID: Record<string, string> = {
  'paw-amber': '/avatars/paw-amber.svg',
  'paw-teal': '/avatars/paw-teal.svg',
  'paw-plum': '/avatars/paw-plum.svg',
  'paw-slate': '/avatars/paw-slate.svg',
  'paw-rose': '/avatars/paw-rose.svg',
  'paw-forest': '/avatars/paw-forest.svg',
  'paw-sky': '/avatars/paw-sky.svg',
  'paw-charcoal': '/avatars/paw-charcoal.svg',
};
