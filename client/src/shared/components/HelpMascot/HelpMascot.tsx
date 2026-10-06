import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { PawPrint } from 'lucide-react';
import { Link } from 'react-router';
import { fetchPublicFaqs } from '../../../features/faq/api/faq.api';
import styles from './HelpMascot.module.css';
import {
  MASCOTS,
  readSavedMascot,
  saveMascot,
  type MascotDefinition,
} from './mascots';
import { useGifStillFrame, useReplayableGif } from './useReplayableGif';

/** One sound bubble ("Woof!") popped out by a press - where it starts (on the gold
 * circle's edge) and where it drifts to, as offsets from the circle's
 * centre. */
interface Woof {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Slight tilt, in degrees, so a burst of them doesn't look stamped. */
  tilt: number;
}

/** At most this many bubbles at once - rapid pressing drops the oldest. */
const MAX_WOOFS = 6;

/** A woof heading out to the LEFT of the circle (the mascot sits in the
 * screen's bottom-right corner, so left is where there is room): a random
 * direction between up-left and down-left, ending just outside the circle
 * so it stays near it. */
function createWoof(id: number, circleRadius: number): Woof {
  // 180deg is straight left; +/-60deg either side of it.
  const angle = ((120 + Math.random() * 120) * Math.PI) / 180;
  const reach = circleRadius + 30 + Math.random() * 30;

  return {
    id,
    fromX: Math.cos(angle) * circleRadius,
    fromY: Math.sin(angle) * circleRadius,
    toX: Math.cos(angle) * reach,
    toY: Math.sin(angle) * reach,
    tilt: -12 + Math.random() * 24,
  };
}

const HIDDEN_STORAGE_KEY = 'golden-fur.mascotHidden';

/** Whether the visitor hid the mascot on this device last time. Storage can
 * be blocked (e.g. private browsing) - the mascot then simply shows. */
function readMascotHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveMascotHidden(isHidden: boolean): void {
  try {
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, String(isHidden));
  } catch {
    // Not remembered, but the choice still applies for this page view.
  }
}

export type HelpMascotLink =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

interface HelpMascotProps {
  /** The two page-link radial menu items - FAQs is always first (built in,
   * opens the FAQ modal instead of navigating), then these two, then the
   * built-in "Change pet" and "Hide me". Radial positions are hardcoded in
   * CSS for exactly five items. */
  links: [HelpMascotLink, HelpMascotLink];
}

const MASCOT_TIPS = [
  'Welcome to Golden Fur!',
  'Tip: Book grooming early — weekend slots fill up fast!',
  'Tip: Regular vet checkups keep tails wagging longer.',
  'Tip: Try our Day Care for social, supervised playtime.',
  'Tip: Traveling? Reserve a Pet Hotel suite in advance.',
  'Need help? Tap the chat bubble for FAQs and support.',
];

interface MascotFaq {
  /** Absent on the built-in fallback FAQs. */
  id?: string;
  question: string;
  answer: string;
}

/**
 * The built-in FAQs. What the popup actually shows is set by a Superadmin
 * (Settings > Config > Mascot FAQs, read from GET /public/faqs each time the
 * popup opens); these are the fallback whenever that list can't be used -
 * still loading, the request failed, or no FAQs are set - so the popup is
 * never empty. They match the rows migration 20261006246 starts with.
 */
const DEFAULT_FAQ_ITEMS: MascotFaq[] = [
  {
    question: 'How do I book a service?',
    answer:
      'Head to "Book a Service" from your portal sidebar (or the landing page navbar if you\'re not logged in yet), pick a branch, service, and time slot, then confirm.',
  },
  {
    question: 'Can I cancel or reschedule a booking?',
    answer:
      'Yes - open the booking from "My Bookings" and use the cancel/reschedule option there. Cancellation windows vary by service, so check the booking details for the exact cutoff.',
  },
  {
    question: 'What branches does Golden Fur have?',
    answer:
      'We currently operate in Makati and Southwoods, Laguna. See the Branches page for addresses and directions to each.',
  },
  {
    question: 'How do credits and packages work?',
    answer:
      'Bundled packages and promos are listed on the Packages & Promos page. Any credit balance from a package or refund shows on your portal home, broken down by branch.',
  },
  {
    question: 'How do I update my pet’s profile or medical records?',
    answer:
      'Go to "Pet Manager" in your sidebar, select a pet, and edit their profile, food/medication, and health notes from there.',
  },
  {
    question: 'Still need help?',
    answer:
      'Use "Contact support" or "Create a ticket" from this same menu, and our team will follow up with you directly.',
  },
];

/**
 * Floating help mascot: circular trigger with a hover/focus radial link
 * menu, plus a chat bubble that rotates through MASCOT_TIPS on a timer.
 * Shared across the marketing pages (Landing/Branches/Packages/About) and
 * the customer portal (AppShell) - originally built inline in LandingPage.
 *
 * The mascot can be "petted": a hand follows the mouse while it is over the
 * mascot, and pressing the mascot plays the petting GIF once before it goes
 * back to its idle GIF. The hand's own GIF plays once per press too (it
 * rests on its first frame in between), and every press pops a sound bubble
 * ("Woof!") out to the left of the gold circle.
 *
 * "Change pet" (hover menu) opens a small popup in the middle of the screen
 * listing every mascot in mascots.ts; the one picked is remembered on that
 * device.
 *
 * The visitor can hide the mascot ("Hide me", the last bubble of the hover
 * menu). Hidden
 * means gone: no circle, no tips, no hover links, no hand - only a small paw
 * button in the corner to bring it back. The choice is remembered on that
 * device.
 *
 * All of that artwork and the sound belong to the mascot's own definition
 * in mascots.ts, not to this component - a different mascot brings its own
 * petting GIF, hand and sound instead of inheriting the dog's.
 */
export function HelpMascot({ links }: HelpMascotProps) {
  const [mascot, setMascot] = useState(readSavedMascot);
  const [isPetPickerOpen, setIsPetPickerOpen] = useState(false);

  function choosePet(next: MascotDefinition) {
    setMascot(next);
    saveMascot(next.id);
    setWoofs([]);
    setIsPetPickerOpen(false);
  }
  const bubbleRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const handRef = useRef<HTMLSpanElement>(null);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [faqItems, setFaqItems] = useState<MascotFaq[]>(DEFAULT_FAQ_ITEMS);

  // Loaded when the popup opens rather than with every page: the mascot is
  // on nearly every page and most visits never open it. Asking again on each
  // open means a Superadmin's change shows without a reload.
  useEffect(() => {
    if (!isFaqOpen) return;

    let isMounted = true;

    void fetchPublicFaqs().then((result) => {
      if (!isMounted) return;

      setFaqItems(
        result.data && result.data.length > 0 ? result.data : DEFAULT_FAQ_ITEMS
      );
    });

    return () => {
      isMounted = false;
    };
  }, [isFaqOpen]);
  const [isHandVisible, setIsHandVisible] = useState(false);
  const [isHidden, setIsHidden] = useState(readMascotHidden);

  function setMascotHidden(nextIsHidden: boolean) {
    setIsHidden(nextIsHidden);
    saveMascotHidden(nextIsHidden);

    if (nextIsHidden) {
      setIsHandVisible(false);
      setWoofs([]);
    }
  }
  const [woofs, setWoofs] = useState<Woof[]>([]);
  const nextWoofIdRef = useRef(0);
  const petGif = useReplayableGif(mascot.pet.gif, mascot.pet.gifDurationMs);
  // When the hand is a GIF that plays once per press: it rests on its first
  // frame, and each press plays it through. Otherwise it is a plain image.
  const handPlayMs = mascot.pet.handGifDurationMs;
  const animatedHand = handPlayMs ? mascot.pet.handImage : null;
  const handGif = useReplayableGif(animatedHand, handPlayMs ?? 0);
  const handStill = useGifStillFrame(animatedHand);
  const handSrc = handGif.src ?? handStill ?? mascot.pet.handImage;

  /** Downloads the petting artwork once, the first time the visitor shows
   * interest in the mascot (hover/focus/press) - not on page load, since
   * most visitors never pet it. */
  function loadPetArtwork() {
    petGif.preload();
    handGif.preload();
  }

  function petMascot() {
    if (mascot.pet.sound) {
      const circleRadius = (triggerRef.current?.offsetWidth || 130) / 2;
      const woof = createWoof(nextWoofIdRef.current++, circleRadius);
      setWoofs((current) => [...current, woof].slice(-MAX_WOOFS));
    }

    // Both play from their first frame on every press; the mascot goes back
    // to its idle GIF once the petting GIF has played through.
    petGif.play();
    handGif.play();
  }

  // The hand is moved by writing its position straight to the element -
  // re-rendering the whole widget on every mouse move would be wasteful.
  function moveHand(event: PointerEvent<HTMLButtonElement>) {
    // A finger has no hover; the hand is for a mouse pointer only.
    if (event.pointerType !== 'mouse') return;

    loadPetArtwork();

    const hand = handRef.current;
    if (hand) {
      hand.style.left = `${event.clientX}px`;
      hand.style.top = `${event.clientY}px`;
    }

    setIsHandVisible(true);
  }

  // Escape closes whichever popup (FAQs or the pet picker) is open.
  useEffect(() => {
    if (!isFaqOpen && !isPetPickerOpen) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsFaqOpen(false);
        setIsPetPickerOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isFaqOpen, isPetPickerOpen]);

  useEffect(() => {
    const bubble = bubbleRef.current;
    if (!bubble) return;

    let lastTipIndex = -1;
    let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function getRandomTipIndex() {
      let nextIndex: number;
      do {
        nextIndex = Math.floor(Math.random() * MASCOT_TIPS.length);
      } while (nextIndex === lastTipIndex);
      return nextIndex;
    }

    function showTip() {
      const tipIndex = getRandomTipIndex();
      lastTipIndex = tipIndex;
      bubble!.textContent = MASCOT_TIPS[tipIndex];

      bubble!.classList.remove(styles.isVisible);
      void bubble!.offsetWidth;
      bubble!.classList.add(styles.isVisible);

      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
      }
      hideTimeoutId = setTimeout(() => {
        bubble!.classList.remove(styles.isVisible);
      }, 5000);
    }

    const initialTimeoutId = setTimeout(showTip, 900);
    const intervalId = setInterval(showTip, 15000);

    return () => {
      clearTimeout(initialTimeoutId);
      clearInterval(intervalId);
      if (hideTimeoutId) {
        clearTimeout(hideTimeoutId);
      }
    };
    // Re-run when the mascot is shown again: the tip bubble only exists
    // while it is visible, and hiding it stops the tips altogether.
  }, [isHidden]);

  if (isHidden) {
    return (
      <aside className={styles.mascot} aria-label="Mascot">
        <button
          type="button"
          className={styles.showButton}
          aria-label="Show mascot"
          title="Show mascot"
          onClick={() => setMascotHidden(false)}
        >
          <PawPrint size={18} aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside className={styles.mascot} aria-label="Quick help links">
      <div ref={bubbleRef} className={styles.bubble} aria-live="polite" />

      <button
        ref={triggerRef}
        className={
          petGif.isPlaying && !petGif.src
            ? `${styles.trigger} ${styles.petBounce}`
            : styles.trigger
        }
        type="button"
        aria-label="Pet the mascot"
        onClick={petMascot}
        onFocus={loadPetArtwork}
        onPointerEnter={moveHand}
        onPointerMove={moveHand}
        onPointerLeave={() => setIsHandVisible(false)}
      >
        <img
          // Keyed by address, so each press (and the return to idle) shows a
          // fresh image element.
          key={petGif.src ?? 'idle'}
          className={styles.image}
          src={petGif.src ?? mascot.idleGif}
          alt={mascot.alt}
          // Grows from the bottom centre (the image's transform-origin), so
          // a bigger mascot still stands on the same spot in the circle.
          style={
            mascot.imageScale ? { scale: String(mascot.imageScale) } : undefined
          }
          loading="eager"
          decoding="async"
          onLoad={() =>
            triggerRef.current?.classList.remove(styles.mediaFailed)
          }
          onError={() => triggerRef.current?.classList.add(styles.mediaFailed)}
        />
        <span className={styles.fallback} aria-hidden="true">
          {mascot.fallbackEmoji}
        </span>
        {woofs.map((woof) => (
          <span
            key={woof.id}
            className={styles.woof}
            aria-hidden="true"
            style={
              {
                '--woof-from-x': `${woof.fromX}px`,
                '--woof-from-y': `${woof.fromY}px`,
                '--woof-to-x': `${woof.toX}px`,
                '--woof-to-y': `${woof.toY}px`,
                '--woof-tilt': `${woof.tilt}deg`,
              } as CSSProperties
            }
            // Each bubble removes itself once it has faded out.
            onAnimationEnd={() =>
              setWoofs((current) =>
                current.filter((other) => other.id !== woof.id)
              )
            }
          >
            {mascot.pet.sound}
          </span>
        ))}
      </button>

      <span
        ref={handRef}
        className={
          isHandVisible ? `${styles.hand} ${styles.handVisible}` : styles.hand
        }
        aria-hidden="true"
      >
        {handSrc ? (
          <img
            // Keyed by address, so each press shows a fresh image element.
            key={handSrc}
            className={styles.handImage}
            src={handSrc}
            alt=""
          />
        ) : (
          '🖐️'
        )}
      </span>

      <nav className={styles.menu} aria-label="Support links">
        <button
          type="button"
          className={styles.link}
          onClick={() => setIsFaqOpen(true)}
        >
          FAQs
        </button>

        {links.map((link) => {
          if ('onClick' in link) {
            return (
              <button
                key={link.label}
                type="button"
                className={styles.link}
                onClick={link.onClick}
              >
                {link.label}
              </button>
            );
          }

          return link.href.startsWith('/') ? (
            <Link key={link.label} to={link.href} className={styles.link}>
              {link.label}
            </Link>
          ) : (
            <a key={link.label} href={link.href} className={styles.link}>
              {link.label}
            </a>
          );
        })}

        <button
          type="button"
          className={styles.link}
          onClick={() => setIsPetPickerOpen(true)}
        >
          Change pet
        </button>

        <button
          type="button"
          className={styles.link}
          onClick={() => setMascotHidden(true)}
        >
          Hide me
        </button>
      </nav>

      {isFaqOpen ? (
        <div
          className={styles.faqBackdrop}
          role="presentation"
          onClick={() => setIsFaqOpen(false)}
        >
          <section
            className={styles.faqModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-mascot-faq-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.faqHeader}>
              <h2 id="help-mascot-faq-title" className={styles.faqTitle}>
                Frequently asked questions
              </h2>
              <button
                type="button"
                className={styles.faqCloseButton}
                aria-label="Close FAQs"
                onClick={() => setIsFaqOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className={styles.faqList}>
              {faqItems.map((item) => (
                <details
                  key={item.id ?? item.question}
                  className={styles.faqItem}
                >
                  <summary className={styles.faqQuestion}>
                    {item.question}
                  </summary>
                  <p className={styles.faqAnswer}>{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isPetPickerOpen ? (
        <div
          className={styles.faqBackdrop}
          role="presentation"
          onClick={() => setIsPetPickerOpen(false)}
        >
          <section
            className={styles.petPicker}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-mascot-pet-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.faqHeader}>
              <h2 id="help-mascot-pet-picker-title" className={styles.faqTitle}>
                Choose your pet
              </h2>
              <button
                type="button"
                className={styles.faqCloseButton}
                aria-label="Close pet picker"
                onClick={() => setIsPetPickerOpen(false)}
              >
                ✕
              </button>
            </div>

            <ul className={styles.petList}>
              {MASCOTS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className={styles.petOption}
                    aria-pressed={option.id === mascot.id}
                    onClick={() => choosePet(option)}
                  >
                    <img
                      className={styles.petOptionImage}
                      src={option.idleGif}
                      alt=""
                      loading="lazy"
                    />
                    <span>{option.name}</span>
                  </button>
                </li>
              ))}
            </ul>

            {MASCOTS.length < 2 ? (
              <p className={styles.petPickerNote}>More pets are on the way!</p>
            ) : null}
          </section>
        </div>
      ) : null}
    </aside>
  );
}
