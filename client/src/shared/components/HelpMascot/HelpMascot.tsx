import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import doggyGif from '../../../assets/doggy.gif';
import styles from './HelpMascot.module.css';

export type HelpMascotLink =
  | { label: string; href: string }
  | { label: string; onClick: () => void };

interface HelpMascotProps {
  /** The other two radial menu items - FAQs is always first (built in, opens
   * the FAQ modal instead of navigating). Radial positions are hardcoded in
   * CSS for exactly three items. */
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

const FAQ_ITEMS = [
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
 */
export function HelpMascot({ links }: HelpMascotProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isFaqOpen, setIsFaqOpen] = useState(false);

  useEffect(() => {
    if (!isFaqOpen) return;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsFaqOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isFaqOpen]);

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
  }, []);

  return (
    <aside className={styles.mascot} aria-label="Quick help links">
      <div ref={bubbleRef} className={styles.bubble} aria-live="polite" />

      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label="Open quick help"
      >
        <img
          className={styles.image}
          src={doggyGif}
          alt="Dog mascot"
          loading="eager"
          decoding="async"
          onLoad={() => triggerRef.current?.classList.remove(styles.mediaFailed)}
          onError={() => triggerRef.current?.classList.add(styles.mediaFailed)}
        />
        <span className={styles.fallback} aria-hidden="true">
          🐶
        </span>
      </button>

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
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} className={styles.faqItem}>
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
    </aside>
  );
}
