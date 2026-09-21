export interface PresetAvatar {
  id: string;
  /** Relative to the client's own origin (served from client/public/avatars/),
   * so it works the same as an absolute Supabase Storage URL in an <img src>. */
  url: string;
  /** Accessible name for the picker grid. */
  label: string;
}

/**
 * A small curated set of default avatars a user can pick instead of
 * uploading their own (Settings > Profile > AvatarPicker). Placeholder art
 * (a paw-print silhouette per color) - real art is a documented follow-up,
 * not a blocker for the picker mechanism itself. The `id` here must match
 * an entry in the server's own copy of this list (server/src/shared/config/
 * presetAvatars.ts) - the server resolves a submitted preset id to this
 * same url itself rather than trusting a client-supplied URL directly.
 */
export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'paw-amber', url: '/avatars/paw-amber.svg', label: 'Amber paw print' },
  { id: 'paw-teal', url: '/avatars/paw-teal.svg', label: 'Teal paw print' },
  { id: 'paw-plum', url: '/avatars/paw-plum.svg', label: 'Plum paw print' },
  { id: 'paw-slate', url: '/avatars/paw-slate.svg', label: 'Slate paw print' },
  { id: 'paw-rose', url: '/avatars/paw-rose.svg', label: 'Rose paw print' },
  {
    id: 'paw-forest',
    url: '/avatars/paw-forest.svg',
    label: 'Forest paw print',
  },
  { id: 'paw-sky', url: '/avatars/paw-sky.svg', label: 'Sky paw print' },
  {
    id: 'paw-charcoal',
    url: '/avatars/paw-charcoal.svg',
    label: 'Charcoal paw print',
  },
];
