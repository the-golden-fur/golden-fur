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
  /** Alt text for the mascot image. */
  alt: string;
  /** The GIF shown at rest. */
  idleGif: string;
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

/**
 * TO ADD A MASCOT: put its files in client/src/assets, import them above,
 * and add another definition like DOGGY with its own idle GIF, petting GIF,
 * duration and sound (e.g. 'Meow!'). Then point CURRENT_MASCOT at it, or
 * add whatever picks between mascots here.
 */
export const CURRENT_MASCOT: MascotDefinition = DOGGY;
