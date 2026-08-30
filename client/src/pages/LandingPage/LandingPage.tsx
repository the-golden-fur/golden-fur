import { useEffect } from 'react';
import { Link } from 'react-router';
import { LandingNavbar } from './components/LandingNavbar/LandingNavbar';
import { HelpMascot } from '../../shared/components/HelpMascot/HelpMascot';
import heroBg from '../../assets/herobg.png';
import grooming from '../../assets/grooming.png';
import vet from '../../assets/vet.png';
import hotel from '../../assets/hotel.png';
import daycare from '../../assets/daycare.png';
import logo from '../../assets/logo.png';
import step1 from '../../assets/step1.png';
import step2 from '../../assets/step2.png';
import step3 from '../../assets/step3.png';
import step4 from '../../assets/step4.png';
import './LandingPage.module.css';

const CUSTOMER_REVIEWS = [
  {
    quote:
      'Rio used to come home from other groomers anxious and shaking. Here he practically drags me to the door. The team clearly loves what they do.',
    name: 'Andrea Salcedo',
    detail: 'Grooming · Makati',
    rating: 5,
  },
  {
    quote:
      'Our senior cat needed bloodwork and a dental. The vet walked us through every option without rushing, and we even got a follow-up call the next day.',
    name: 'Miguel Tan',
    detail: 'Veterinary · Makati',
    rating: 5,
  },
  {
    quote:
      'Booked the pet hotel for a week-long trip. The daily photo updates meant I actually relaxed on vacation — Buddy came back happy and calm.',
    name: 'Kristine Reyes',
    detail: 'Pet Hotel · Southwoods',
    rating: 5,
  },
  {
    quote:
      'Day care has been a lifesaver on long workdays. Nala gets her play and naps on schedule, and pickup is always quick and friendly.',
    name: 'Paolo Mendoza',
    detail: 'Day Care · Makati',
    rating: 5,
  },
  {
    quote:
      'Switched both dogs here after one visit. Clean, always on time, and they remember the little things — like which one is terrified of the dryer.',
    name: 'Camille Ong',
    detail: 'Grooming · Southwoods',
    rating: 5,
  },
];

// Placeholder branch details — replace addresses, hours, and phone numbers
// with each branch's real information (kept in sync with BranchesPage).
const VISIT_US = [
  {
    name: 'Makati',
    address: 'Golden Fur Pet Care, Makati, Metro Manila, Philippines',
    phone: '+63 2 8000 0000',
    hours: [
      { days: 'Mon – Fri', time: '9:00 AM – 7:00 PM' },
      { days: 'Sat – Sun', time: '8:00 AM – 6:00 PM' },
    ],
  },
  {
    name: 'Southwoods, Laguna',
    address: 'Golden Fur Pet Care, Southwoods, Laguna, Philippines',
    phone: '+63 49 500 0000',
    hours: [
      { days: 'Mon – Fri', time: '9:00 AM – 7:00 PM' },
      { days: 'Sat – Sun', time: '8:00 AM – 6:00 PM' },
    ],
  },
];

function getDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;
}

function getMapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

export default function GoldenFurLanding() {
  useEffect(() => {
    const navToggle = document.getElementById(
      'navToggle'
    ) as HTMLButtonElement | null;
    const primaryNavLinks = document.getElementById(
      'primaryNavLinks'
    ) as HTMLElement | null;

    function handleNavToggleClick() {
      if (!primaryNavLinks || !navToggle) return;
      const isOpen = primaryNavLinks.classList.toggle('is-open');
      navToggle.classList.toggle('is-active', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    }

    if (navToggle && primaryNavLinks) {
      navToggle.addEventListener('click', handleNavToggleClick);
    }

    // Scrolls to the target section when arriving via a link from another
    // page (e.g. LandingNavbar's Services link on /branches, /packages, or
    // /about is `/#featureStripSection`) - client-side navigation doesn't
    // trigger the browser's native hash-scroll behavior the way a full page
    // load does.
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth' });
        });
      }
    }

    function prepareStaggerText(el: HTMLElement) {
      if (
        (el as HTMLElement & { dataset: { prepared?: string } }).dataset
          .prepared === 'true'
      )
        return;

      const text = el.textContent || '';
      el.textContent = '';
      const chars = [...text];
      const center = (chars.length - 1) / 2;
      const baseDelay = 45;
      const direction = el.dataset.staggerDirection || 'center';

      chars.forEach((char, i) => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = char === ' ' ? '\u00A0' : char;

        let delay: number;
        if (direction === 'left') {
          delay = i * baseDelay;
        } else if (direction === 'right') {
          delay = (chars.length - 1 - i) * baseDelay;
        } else {
          const distance = Math.abs(i - center);
          delay = Math.round(distance * baseDelay);
        }

        span.style.setProperty('--char-delay', `${delay}ms`);
        el.appendChild(span);
      });

      (
        el as HTMLElement & { dataset: { prepared?: string } }
      ).dataset.prepared = 'true';
    }

    function showStagger(el: HTMLElement, restart = false) {
      if (restart) {
        el.classList.remove('is-visible');
        void el.offsetWidth;
      }
      el.classList.add('is-visible');
    }

    document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((el) => {
      prepareStaggerText(el);
      showStagger(el, true);
    });

    const brandStagger = document.querySelector<HTMLElement>(
      '.brand[data-stagger]'
    );
    if (brandStagger) {
      prepareStaggerText(brandStagger);
      showStagger(brandStagger, true);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.matches('[data-stagger]')) {
              showStagger(entry.target as HTMLElement, true);
            }

            if ((entry.target as HTMLElement).classList.contains('fade-up')) {
              (entry.target as HTMLElement).classList.add('is-visible');
            }
          }
        });
      },
      { threshold: 0.35 }
    );

    document
      .querySelectorAll<HTMLElement>('[data-stagger]')
      .forEach((el) => observer.observe(el));

    const fadeReplayObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.22 }
    );

    document
      .querySelectorAll<HTMLElement>('.fade-up')
      .forEach((el) => fadeReplayObserver.observe(el));

    const featureRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.25 }
    );

    document
      .querySelectorAll<HTMLElement>('.feature-strip-card')
      .forEach((card) => {
        featureRevealObserver.observe(card);
      });

    const branchServices = {
      makati: [
        {
          name: 'Grooming',
          image: grooming,
          alt: 'Grooming service',
          description:
            'Gentle bathing, coat trimming, nail clipping, ear cleaning, and styling to keep your pet clean, healthy, and comfortable.',
        },
        {
          name: 'Veterinary',
          image: vet,
          alt: 'Veterinary service',
          description:
            'Comprehensive checkups, diagnostics, vaccinations, treatment plans, and expert medical care tailored to your pet’s needs.',
        },
        {
          name: 'Day Care',
          image: daycare,
          alt: 'Day care service',
          description:
            'Safe, supervised daytime care with social play, feeding support, and rest time for pets while you’re away.',
        },
        {
          name: 'Pet Hotel',
          image: hotel,
          alt: 'Pet hotel service',
          description:
            'Comfortable overnight boarding with attentive staff, clean suites, routine care, and regular wellness monitoring.',
        },
      ],
      southwoods: [
        {
          name: 'Grooming',
          image: grooming,
          alt: 'Grooming service',
          description:
            'Gentle bathing, coat trimming, nail clipping, ear cleaning, and styling to keep your pet clean, healthy, and comfortable.',
        },
        {
          name: 'Day Care',
          image: daycare,
          alt: 'Day care service',
          description:
            'Safe, supervised daytime care with social play, feeding support, and rest time for pets while you’re away.',
        },
        {
          name: 'Pet Hotel',
          image: hotel,
          alt: 'Pet hotel service',
          description:
            'Comfortable overnight boarding with attentive staff, clean suites, routine care, and regular wellness monitoring.',
        },
      ],
    };

    const serviceListEl = document.getElementById(
      'serviceList'
    ) as HTMLElement | null;
    const serviceDetailsEl = document.getElementById(
      'serviceDetails'
    ) as HTMLElement | null;
    const serviceDetailsTitleEl = document.getElementById(
      'serviceDetailsTitle'
    ) as HTMLElement | null;
    const serviceDetailsTextEl = document.getElementById(
      'serviceDetailsText'
    ) as HTMLElement | null;
    const serviceBranchButtons = document.querySelectorAll<HTMLElement>(
      '.service-branch-btn'
    );

    function setActiveServiceCard(activeCard: HTMLElement | null) {
      document
        .querySelectorAll<HTMLElement>('.service-card')
        .forEach((card) => {
          card.classList.remove('is-selected');
        });
      if (activeCard) activeCard.classList.add('is-selected');
    }

    function updateServiceDetails(
      service: { name: string; description?: string } | null
    ) {
      if (!serviceDetailsTitleEl || !serviceDetailsTextEl || !service) return;
      serviceDetailsTitleEl.textContent = service.name;
      serviceDetailsTextEl.textContent =
        service.description || 'No description available for this service yet.';

      if (serviceDetailsEl) {
        serviceDetailsEl.classList.remove('is-animating');
        void serviceDetailsEl.offsetWidth;
        serviceDetailsEl.classList.add('is-animating');
      }
    }

    function renderBranchServices(branchKey: keyof typeof branchServices) {
      if (!serviceListEl || !branchServices[branchKey]) return;

      serviceListEl.innerHTML = '';
      const services = branchServices[branchKey];

      services.forEach((service, index) => {
        const card = document.createElement('article');
        card.className = 'service-card service-card-stagger';
        card.style.setProperty('--card-delay', `${index * 90}ms`);

        card.innerHTML = `
          <div class="service-card-image-wrap">
            <img src="${service.image}" alt="${service.alt}" class="service-card-image" loading="lazy">
          </div>
          <h3 class="service-card-title">${service.name}</h3>
        `;

        card.addEventListener('click', () => {
          setActiveServiceCard(card as HTMLElement);
          updateServiceDetails(service);
        });

        serviceListEl.appendChild(card);

        requestAnimationFrame(() => {
          card.classList.add('is-visible');
        });

        if (typeof serviceCardReplayObserver !== 'undefined') {
          serviceCardReplayObserver.observe(card as HTMLElement);
        }
      });

      if (services.length > 0) {
        updateServiceDetails(services[0]);
        const firstCard =
          serviceListEl.querySelector<HTMLElement>('.service-card');
        setActiveServiceCard(firstCard);
      }
    }

    serviceBranchButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const branchKey = btn.dataset.branch as keyof typeof branchServices;
        serviceBranchButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        renderBranchServices(branchKey);
      });
    });

    const serviceCardReplayObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.22 }
    );

    renderBranchServices('makati');

    const featureStripCards = document.querySelectorAll<HTMLElement>(
      '.feature-strip-card'
    );

    const scrollStorySection = document.getElementById(
      'scrollStory'
    ) as HTMLElement | null;
    const scrollStoryImageCards = scrollStorySection
      ? scrollStorySection.querySelectorAll<HTMLElement>(
          '.scroll-story-image-card'
        )
      : [];
    const scrollStoryCopies = scrollStorySection
      ? scrollStorySection.querySelectorAll<HTMLElement>('.scroll-story-copy')
      : [];
    let activeStoryIndex = 0;

    function setActiveStory(index: number) {
      if (index === activeStoryIndex) return;
      activeStoryIndex = index;

      scrollStoryImageCards.forEach((card, i) => {
        card.classList.toggle('is-active', i === index);
      });

      scrollStoryCopies.forEach((copy, i) => {
        const isActive = i === index;
        copy.hidden = !isActive;
        copy.classList.toggle('is-active', isActive);
      });
    }

    function updateScrollStoryByViewportPosition() {
      if (!scrollStorySection || !scrollStoryImageCards.length) return;

      const triggerY = window.innerHeight * 0.42;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      scrollStoryImageCards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const cardCenterY = rect.top + rect.height / 2;
        const distance = Math.abs(cardCenterY - triggerY);

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      setActiveStory(nearestIndex);
    }

    if (
      scrollStorySection &&
      scrollStoryImageCards.length &&
      scrollStoryCopies.length
    ) {
      const scrollStoryObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              updateScrollStoryByViewportPosition();
            }
          });
        },
        { threshold: 0.08 }
      );

      scrollStoryObserver.observe(scrollStorySection);
      window.addEventListener('scroll', updateScrollStoryByViewportPosition, {
        passive: true,
      });
      window.addEventListener('resize', updateScrollStoryByViewportPosition);
      updateScrollStoryByViewportPosition();
    }

    const FEATURE_CARD_CLICK_GROWTH_STEP = 140; // px added per repeat click
    const FEATURE_CARD_CLICK_GROWTH_MAX_STEPS = 4; // caps runaway growth

    function resetFeatureCard(card: HTMLElement) {
      card.classList.remove('is-expanded');
      card.style.removeProperty('--click-extra');
      card.dataset.clickCount = '0';
    }

    function collapseExpandedFeatureCards() {
      featureStripCards.forEach((card) => resetFeatureCard(card));
    }

    featureStripCards.forEach((card) => {
      card.dataset.clickCount = '0';

      card.addEventListener('click', (event) => {
        event.stopPropagation();

        const isAlreadyActive = card.classList.contains('is-expanded');

        featureStripCards.forEach((other) => {
          if (other !== card) resetFeatureCard(other);
        });

        const nextCount = isAlreadyActive
          ? Math.min(
              Number(card.dataset.clickCount || '0') + 1,
              FEATURE_CARD_CLICK_GROWTH_MAX_STEPS
            )
          : 1;

        card.dataset.clickCount = String(nextCount);
        card.classList.add('is-expanded');
        card.style.setProperty(
          '--click-extra',
          `${(nextCount - 1) * FEATURE_CARD_CLICK_GROWTH_STEP}px`
        );
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        collapseExpandedFeatureCards();
      }
    });

    document.addEventListener('click', (event) => {
      const clickedOutsideCard = !(event.target as HTMLElement).closest(
        '.feature-strip-card'
      );
      if (clickedOutsideCard) {
        collapseExpandedFeatureCards();
      }
    });

    // Collapse an expanded card once it has fully scrolled out of view.
    // Uses threshold: 0 (not the 0.25 used for the fade-in reveal above)
    // because an expanded card is much taller, so waiting for 75% of it
    // to leave the viewport would mean scrolling far past it first.
    const featureExpandCollapseObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            const card = entry.target as HTMLElement;
            if (card.classList.contains('is-expanded')) {
              resetFeatureCard(card);
            }
          }
        });
      },
      { threshold: 0 }
    );

    featureStripCards.forEach((card) => {
      featureExpandCollapseObserver.observe(card);
    });

    window.addEventListener('load', () => {
      document
        .querySelectorAll<HTMLElement>('[data-stagger]')
        .forEach((el) => showStagger(el, true));

      if (brandStagger) {
        showStagger(brandStagger, true);
      }

      document
        .querySelectorAll<HTMLElement>('.fade-up')
        .forEach((el) => el.classList.add('is-visible'));

      const reveal = document.getElementById(
        'pageReveal'
      ) as HTMLElement | null;
      if (reveal) {
        requestAnimationFrame(() => {
          reveal.classList.add('is-active');
        });

        const totalDuration = 1200;
        setTimeout(() => {
          reveal.classList.add('is-done');
        }, totalDuration);
      }
    });

    return () => {
      if (navToggle) {
        navToggle.removeEventListener('click', handleNavToggleClick);
      }
      observer.disconnect();
      fadeReplayObserver.disconnect();
      featureRevealObserver.disconnect();
      featureExpandCollapseObserver.disconnect();
    };
  }, []);

  return (
    <>
      <div className="page-reveal" id="pageReveal" aria-hidden="true">
        <div className="reveal-panel reveal-left"></div>
        <div className="reveal-panel reveal-right"></div>
      </div>

      <LandingNavbar />

      <main className="hero fade-up">
        <img
          src={heroBg}
          alt="A smiling owner embracing her golden retriever in warm light"
          className="hero-image"
        />
        <div className="hero-scrim" aria-hidden="true" />

        <div className="hero-content">
          <p className="hero-eyebrow fade-up">
            Grooming &middot; Veterinary &middot; Day Care &middot; Pet Hotel
          </p>

          <h1 className="hero-title">
            <span className="hero-title-lead fade-up">Care as warm as</span>
            <span
              className="hero-title-brand stagger"
              data-stagger
              data-stagger-direction="left"
            >
              Golden Fur
            </span>
          </h1>

          <p className="hero-lead fade-up">
            Compassionate, expert care for your beloved companions — because
            every tail wag, purr, and nuzzle deserves the very best.
          </p>

          <div className="hero-actions fade-up">
            <Link to="/portal/book" className="hero-btn hero-btn-primary">
              Book an appointment
            </Link>
            <a href="#servicesSection" className="hero-btn hero-btn-ghost">
              Explore our services
            </a>
          </div>

          <ul className="hero-branches fade-up" aria-label="Our branches">
            <li className="hero-branch">
              <span aria-hidden="true">📍</span> Makati
            </li>
            <li className="hero-branch">
              <span aria-hidden="true">📍</span> Southwoods, Laguna
            </li>
          </ul>
        </div>

        <a
          className="hero-scroll-cue"
          href="#servicesSection"
          aria-label="Scroll to what we offer"
        >
          <span className="hero-scroll-cue-track" aria-hidden="true">
            <span className="hero-scroll-cue-thumb" />
          </span>
          Scroll to explore
        </a>
      </main>

      <div className="services fade-up" id="servicesSection">
        <h1 className="serviceTitle stagger" data-stagger>
          What we Offer
        </h1>

        <div
          className="service-branch-switcher"
          role="tablist"
          aria-label="Branch Services"
        >
          <button
            className="service-branch-btn is-active"
            data-branch="makati"
            type="button"
          >
            Makati
          </button>
          <button
            className="service-branch-btn"
            data-branch="southwoods"
            type="button"
          >
            Southwoods
          </button>
        </div>

        <div className="service-list" id="serviceList" aria-live="polite"></div>

        <article
          className="service-details"
          id="serviceDetails"
          aria-live="polite"
        >
          <h3 className="service-details-title" id="serviceDetailsTitle">
            Select a service
          </h3>
          <p className="service-details-text" id="serviceDetailsText">
            Click a service card to view its description.
          </p>
        </article>
      </div>

      <section
        className="feature-strip-section"
        id="featureStripSection"
        aria-label="More service highlights"
      >
        <div className="feature-strip">
          <article className="feature-strip-card">
            <img
              src={grooming}
              alt="Premium grooming highlight"
              className="feature-strip-image"
              loading="lazy"
            />
            <div className="feature-strip-overlay"></div>
            <div className="feature-strip-content">
              <div className="feature-strip-copy">
                <h3>Premium Grooming</h3>
                <p>
                  Gentle coat care, trim styling, and wellness-focused grooming
                  sessions.
                </p>
                <p className="feature-strip-detail">
                  Includes breed-specific coat treatments, de-shedding options,
                  nail and paw care, and a calming bath routine handled by
                  certified groomers.
                </p>
              </div>
              <button className="feature-strip-btn" type="button">
                View
              </button>
            </div>
          </article>

          <article className="feature-strip-card">
            <img
              src={vet}
              alt="Veterinary care highlight"
              className="feature-strip-image"
              loading="lazy"
            />
            <div className="feature-strip-overlay"></div>
            <div className="feature-strip-content">
              <div className="feature-strip-copy">
                <h3>Veterinary Consults</h3>
                <p>
                  Routine checkups and preventive care for healthier, happier
                  pets.
                </p>
                <p className="feature-strip-detail">
                  Vaccinations, deworming, diagnostics, and personalized
                  treatment plans from licensed veterinarians who track your
                  pet’s health over time.
                </p>
              </div>
              <button className="feature-strip-btn" type="button">
                View
              </button>
            </div>
          </article>

          <article className="feature-strip-card">
            <img
              src={daycare}
              alt="Day care highlight"
              className="feature-strip-image"
              loading="lazy"
            />
            <div className="feature-strip-overlay"></div>
            <div className="feature-strip-content">
              <div className="feature-strip-copy">
                <h3>Trusted Day Care</h3>
                <p>
                  Safe supervised play and rest while you’re away for the day.
                </p>
                <p className="feature-strip-detail">
                  Group play matched to temperament and size, scheduled rest
                  breaks, and feeding on your pet’s usual routine, all under
                  attentive staff supervision.
                </p>
              </div>
              <button className="feature-strip-btn" type="button">
                View
              </button>
            </div>
          </article>

          <article className="feature-strip-card">
            <img
              src={hotel}
              alt="Pet hotel highlight"
              className="feature-strip-image"
              loading="lazy"
            />
            <div className="feature-strip-overlay"></div>
            <div className="feature-strip-content">
              <div className="feature-strip-copy">
                <h3>Comfort Pet Hotel</h3>
                <p>
                  Clean cozy overnight boarding with attentive and loving
                  support.
                </p>
                <p className="feature-strip-detail">
                  Private suites, regular wellness checks, comfortable bedding,
                  and daily updates so you can travel with peace of mind.
                </p>
              </div>
              <button className="feature-strip-btn" type="button">
                View
              </button>
            </div>
          </article>
        </div>
      </section>

      <section className="reviews fade-up" aria-labelledby="reviewsTitle">
        <h2 className="reviews-title stagger" data-stagger id="reviewsTitle">
          Loved by pet parents
        </h2>
        <p className="reviews-subtitle fade-up">
          Real words from families across our Makati and Southwoods branches.
        </p>

        <div className="reviews-grid">
          {CUSTOMER_REVIEWS.map((review) => (
            <article className="review-card fade-up" key={review.name}>
              <div
                className="review-stars"
                role="img"
                aria-label={`Rated ${review.rating} out of 5`}
              >
                {'★'.repeat(review.rating)}
                <span className="review-stars-empty" aria-hidden="true">
                  {'★'.repeat(5 - review.rating)}
                </span>
              </div>
              <p className="review-quote">{review.quote}</p>
              <div className="review-author">
                <span className="review-avatar" aria-hidden="true">
                  {review.name.charAt(0)}
                </span>
                <span className="review-author-meta">
                  <span className="review-name">{review.name}</span>
                  <span className="review-detail">{review.detail}</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section
        className="scroll-story"
        id="scrollStory"
        aria-label="Guided care journey"
      >
        <div className="scroll-story-inner">
          <div className="scroll-story-left" aria-hidden="true">
            <div className="scroll-story-strip" id="scrollStoryStrip">
              <article
                className="scroll-story-image-card is-active"
                data-story-index="0"
              >
                <img
                  src={step1}
                  alt="Initial consultation moment"
                  loading="lazy"
                />
              </article>
              <article className="scroll-story-image-card" data-story-index="1">
                <img
                  src={step2}
                  alt="Personalized care planning"
                  loading="lazy"
                />
              </article>
              <article className="scroll-story-image-card" data-story-index="2">
                <img src={step3} alt="Treatment and follow-up" loading="lazy" />
              </article>
              <article className="scroll-story-image-card" data-story-index="3">
                <img
                  src={step4}
                  alt="Long-term wellness support"
                  loading="lazy"
                />
              </article>
            </div>
          </div>

          <div className="scroll-story-right">
            <article
              className="scroll-story-copy is-active"
              data-story-copy="0"
            >
              <p className="scroll-story-kicker">Step 01</p>
              <h3>Warm, attentive intake</h3>
              <p>
                We begin with a calm assessment so your pet feels safe while we
                understand history, behavior, and immediate needs.
              </p>
            </article>

            <article className="scroll-story-copy" data-story-copy="1" hidden>
              <p className="scroll-story-kicker">Step 02</p>
              <h3>Customized care mapping</h3>
              <p>
                Our team maps a tailored service path—from grooming to
                veterinary support—based on breed, age, and condition.
              </p>
            </article>

            <article className="scroll-story-copy" data-story-copy="2" hidden>
              <p className="scroll-story-kicker">Step 03</p>
              <h3>Precise, gentle execution</h3>
              <p>
                Every treatment is delivered with careful handling, clear
                updates, and quality checks at each milestone.
              </p>
            </article>

            <article className="scroll-story-copy" data-story-copy="3" hidden>
              <p className="scroll-story-kicker">Step 04</p>
              <h3>Ongoing wellness continuity</h3>
              <p>
                After the visit, we guide next steps and preventive routines to
                keep your companion healthy between appointments.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        className="visit fade-up"
        id="visitSection"
        aria-labelledby="visitTitle"
      >
        <h2 className="visit-title stagger" data-stagger id="visitTitle">
          Visit us
        </h2>
        <p className="visit-subtitle fade-up">
          Drop by either branch — walk-ins are welcome, appointments
          recommended.
        </p>

        <div className="visit-grid">
          {VISIT_US.map((branch) => (
            <article className="visit-card fade-up" key={branch.name}>
              <div className="visit-map">
                <iframe
                  src={getMapEmbedUrl(branch.address)}
                  title={`Map to Golden Fur ${branch.name}`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <div className="visit-info">
                <h3 className="visit-branch-name">📍 {branch.name}</h3>
                <p className="visit-address">{branch.address}</p>

                <dl className="visit-hours">
                  {branch.hours.map((slot) => (
                    <div className="visit-hours-row" key={slot.days}>
                      <dt>{slot.days}</dt>
                      <dd>{slot.time}</dd>
                    </div>
                  ))}
                </dl>

                <p className="visit-contact">
                  <a href={`tel:${branch.phone.replace(/\s/g, '')}`}>
                    {branch.phone}
                  </a>
                </p>

                <a
                  href={getDirectionsUrl(branch.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="visit-directions"
                >
                  Get directions
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-band fade-up" aria-labelledby="ctaBandTitle">
        <div className="cta-band-inner">
          <div className="cta-band-copy">
            <h2 className="cta-band-title" id="ctaBandTitle">
              Your pet&rsquo;s next visit starts here
            </h2>
            <p className="cta-band-text">
              Book online in minutes for grooming, veterinary, day care, and
              boarding — at our Makati and Southwoods branches.
            </p>
          </div>
          <div className="cta-band-actions">
            <Link
              to="/portal/book"
              className="cta-band-btn cta-band-btn-primary"
            >
              Book an appointment
            </Link>
            <Link to="/branches" className="cta-band-btn cta-band-btn-ghost">
              Find a branch
            </Link>
          </div>
        </div>
      </section>

      <HelpMascot
        links={[
          { label: 'Create an account', href: '#' },
          { label: 'Create a ticket', href: '#' },
        ]}
      />

      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <img src={logo} alt="Golden Fur logo" className="footer-logo" />
            <div>
              <p className="footer-brand-name">Golden Fur</p>
              <p className="footer-tagline">
                Compassionate, expert pet care across grooming, veterinary, day
                care, and boarding — because every pet deserves the best.
              </p>
            </div>
          </div>

          <div className="footer-col">
            <h4>Explore</h4>
            <ul>
              <li>
                <a href="#featureStripSection">Services</a>
              </li>
              <li>
                <Link to="/branches">Branches</Link>
              </li>
              <li>
                <Link to="/packages">Packages</Link>
              </li>
              <li>
                <Link to="/about">About</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Branches</h4>
            <ul>
              <li>📍 Makati</li>
              <li>📍 Southwoods, Laguna</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Get in touch</h4>
            <ul>
              <li>
                <a href="tel:+63200000000">+63 2 0000 0000</a>
              </li>
              <li>
                <a href="mailto:hello@goldenfur.ph">hello@goldenfur.ph</a>
              </li>
            </ul>

            <div className="footer-social">
              <a
                href="#"
                className="footer-social-link"
                aria-label="Golden Fur on Facebook"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.3-1.5 1.6-1.5h1.4V4.2C15.6 4.1 14.7 4 13.6 4c-2.3 0-3.9 1.4-3.9 4v2.5H7.2v3H9.7V21h3.8z" />
                </svg>
              </a>
              <a
                href="#"
                className="footer-social-link"
                aria-label="Golden Fur on Instagram"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="16" rx="4" />
                  <circle cx="12" cy="12" r="3.4" />
                  <circle
                    cx="16.6"
                    cy="7.4"
                    r="0.9"
                    fill="currentColor"
                    stroke="none"
                  />
                </svg>
              </a>
              <a
                href="#"
                className="footer-social-link"
                aria-label="Golden Fur on TikTok"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.5 3c.4 2 1.9 3.6 3.9 3.9v2.8a6.7 6.7 0 0 1-3.9-1.3v6.9a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.9a3 3 0 1 0 2.1 2.9V3h2.9z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Golden Fur. All rights reserved.</p>
          <div className="footer-bottom-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </footer>
    </>
  );
}
