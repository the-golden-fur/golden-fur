import catMascotGif from '../../../assets/catmascot.gif';
import catPetGif from '../../../assets/catmascot_pet.gif';
import doggyGif from '../../../assets/doggy.gif';
import dogPetGif from '../../../assets/dogpet.gif';
import petHandGif from '../../../assets/pethand.gif';

/**
 * Everything that belongs to ONE mascot: how it looks at rest, and how it
 * reacts to being petted. Each mascot carries its own petting artwork and
 * sound, so adding another mascot never borrows the dog's "Woof!" or its
 * petting GIF by accident.
 */
export interface MascotDefinition {
  /** Stable key for this mascot. */
  id: string;
  /** Shown under the mascot in the "Choose your pet" popup. */
  name: string;
  /** Alt text for the mascot image. */
  alt: string;
  /** The GIF shown at rest. */
  idleGif: string;
  /** Size of this mascot's image relative to the standard size - e.g. 1.1
   * for artwork that is drawn a little small in its frame. Leave out for 1. */
  imageScale?: number;
  /** Emoji shown in the gold circle if the image fails to load. */
  fallbackEmoji: string;
  pet: {
    /** Image that follows the mouse over the mascot; null = a hand emoji. */
    handImage: string | null;
    /** Set when `handImage` is a GIF that should play ONCE PER PRESS (a
     * petting stroke): the length of one loop, in milliseconds. The hand then
     * rests on the GIF's first frame until the mascot is pressed. null = show
     * `handImage` exactly as it is (a still image, or a GIF that just loops). */
    handGifDurationMs: number | null;
    /** GIF played once per press; null = the mascot does a small bounce. */
    gif: string | null;
    /** Length of one loop of `gif`, in milliseconds - how long it plays
     * before the mascot goes back to `idleGif` (a browser can't tell when a
     * GIF has finished). Update it whenever `gif` changes. */
    gifDurationMs: number;
    /** Text of the little bubble popped out on each press; null = none. */
    sound: string | null;
  };
}

export const DOGGY: MascotDefinition = {
  id: 'doggy',
  name: 'Doggy',
  alt: 'Dog mascot',
  idleGif: doggyGif,
  fallbackEmoji: '🐶',
  pet: {
    handImage: petHandGif,
    // pethand.gif is 4 frames at 100ms each.
    handGifDurationMs: 400,
    gif: dogPetGif,
    // dogpet.gif is 44 frames at 100ms each.
    gifDurationMs: 4400,
    sound: 'Woof!',
  },
};

export const KITTY: MascotDefinition = {
  id: 'kitty',
  name: 'Kitty',
  alt: 'Cat mascot',
  idleGif: catMascotGif,
  // The cat is drawn slightly smaller in its frame than the dog.
  imageScale: 1.1,
  fallbackEmoji: '🐱',
  pet: {
    // The same petting hand as the dog - it is a person's hand, not the
    // dog's own artwork.
    handImage: petHandGif,
    handGifDurationMs: 400,
    gif: catPetGif,
    // catmascot_pet.gif is 52 frames at 100ms each.
    gifDurationMs: 5200,
    sound: 'Meow!',
  },
};

/**
 * Every mascot the visitor can choose from the "Change pet" popup, in the
 * order they are listed there. The first one is the default.
 *
 * TO ADD A MASCOT: put its files in client/src/assets, import them above,
 * write another definition like DOGGY with its own idle GIF, petting GIF,
 * hand, durations and sound (e.g. 'Meow!'), and add it to this list.
 */
export const MASCOTS: MascotDefinition[] = [DOGGY, KITTY];

const STORAGE_KEY = 'golden-fur.mascot';

/** The mascot the visitor last chose on this device - the default one when
 * nothing is saved, the saved one no longer exists, or storage is blocked. */
export function readSavedMascot(): MascotDefinition {
  try {
    const savedId = window.localStorage.getItem(STORAGE_KEY);
    return MASCOTS.find((mascot) => mascot.id === savedId) ?? MASCOTS[0];
  } catch {
    return MASCOTS[0];
  }
}

export function saveMascot(mascotId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mascotId);
  } catch {
    // Not remembered, but the choice still applies for this page view.
  }
}
