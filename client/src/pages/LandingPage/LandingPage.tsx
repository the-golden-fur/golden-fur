import { useEffect } from 'react';
import { Link } from 'react-router';
import { LandingNavbar } from './components/LandingNavbar/LandingNavbar';
import doggyGif from '../../assets/doggy.gif';
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

    const bookingTabs =
      document.querySelectorAll<HTMLElement>('.booking-step-tab');
    const bookingPanels =
      document.querySelectorAll<HTMLElement>('[data-step-panel]');
    const bookingPrevBtn = document.getElementById(
      'bookingPrevBtn'
    ) as HTMLButtonElement | null;
    const bookingNextBtn = document.getElementById(
      'bookingNextBtn'
    ) as HTMLButtonElement | null;
    let bookingCurrentStep = 0;
    let bookingSelectedService = 'grooming';

    function requiresSpecialistStep(serviceKey: string) {
      return serviceKey === 'grooming' || serviceKey === 'veterinary';
    }

    function getNearestValidStep(stepIndex: number) {
      if (!requiresSpecialistStep(bookingSelectedService) && stepIndex === 3) {
        return 4;
      }
      return stepIndex;
    }

    function updateBookingStepperUI() {
      bookingCurrentStep = getNearestValidStep(bookingCurrentStep);
      bookingTabs.forEach((tab, index) => {
        tab.classList.remove('is-current', 'is-complete');

        if (index < bookingCurrentStep) {
          tab.classList.add('is-complete');
        } else if (index === bookingCurrentStep) {
          tab.classList.add('is-current');
        }
      });

      bookingPanels.forEach((panel, index) => {
        const isActive = index === bookingCurrentStep;
        panel.hidden = !isActive;
        panel.classList.toggle('is-active', isActive);
      });

      if (bookingPrevBtn) {
        bookingPrevBtn.disabled = bookingCurrentStep === 0;
      }

      if (bookingNextBtn) {
        bookingNextBtn.textContent =
          bookingCurrentStep === bookingPanels.length - 1 ? 'Finish' : 'Next';
      }

      const step4SkipNote = document.getElementById(
        'bookingStep4SkipNote'
      ) as HTMLElement | null;
      if (step4SkipNote) {
        step4SkipNote.hidden = requiresSpecialistStep(bookingSelectedService);
      }
    }

    if (bookingPrevBtn) {
      bookingPrevBtn.addEventListener('click', () => {
        if (bookingCurrentStep > 0) {
          bookingCurrentStep -= 1;

          if (
            bookingCurrentStep === 3 &&
            !requiresSpecialistStep(bookingSelectedService)
          ) {
            bookingCurrentStep = 2;
          }

          updateBookingStepperUI();
        }
      });
    }

    if (bookingNextBtn) {
      bookingNextBtn.addEventListener('click', () => {
        if (bookingCurrentStep < bookingPanels.length - 1) {
          bookingCurrentStep += 1;

          if (
            bookingCurrentStep === 3 &&
            !requiresSpecialistStep(bookingSelectedService)
          ) {
            bookingCurrentStep = 4;
          }

          updateBookingStepperUI();
        }
      });
    }

    const bookingServiceOptionButtons = document.querySelectorAll<HTMLElement>(
      '.booking-service-option'
    );
    bookingServiceOptionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        bookingSelectedService = btn.dataset.service || 'grooming';

        bookingServiceOptionButtons.forEach((b) =>
          b.classList.remove('is-selected')
        );
        btn.classList.add('is-selected');

        if (
          bookingCurrentStep === 3 &&
          !requiresSpecialistStep(bookingSelectedService)
        ) {
          bookingCurrentStep = 4;
        }

        updateBookingStepperUI();
      });
    });

    bookingTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const stepIndex = Number(tab.dataset.step);
        if (!Number.isNaN(stepIndex)) {
          bookingCurrentStep = stepIndex;
          updateBookingStepperUI();
        }
      });
    });

    updateBookingStepperUI();

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

    const helpMascotBubble = document.getElementById(
      'helpMascotBubble'
    ) as HTMLElement | null;
    const mascotTips = [
      'Welcome to Golden Fur!',
      'Tip: Book grooming early — weekend slots fill up fast!',
      'Tip: Regular vet checkups keep tails wagging longer.',
      'Tip: Try our Day Care for social, supervised playtime.',
      'Tip: Traveling? Reserve a Pet Hotel suite in advance.',
      'Need help? Tap the chat bubble for FAQs and support.',
    ];
    let lastMascotTipIndex = -1;
    let mascotHideTimeoutId: ReturnType<typeof setTimeout> | null = null;

    function getRandomMascotTipIndex() {
      if (mascotTips.length <= 1) return 0;

      let nextIndex: number;
      do {
        nextIndex = Math.floor(Math.random() * mascotTips.length);
      } while (nextIndex === lastMascotTipIndex);

      return nextIndex;
    }

    function showMascotTip() {
      if (!helpMascotBubble) return;

      const tipIndex = getRandomMascotTipIndex();
      lastMascotTipIndex = tipIndex;
      helpMascotBubble.textContent = mascotTips[tipIndex];

      helpMascotBubble.classList.remove('is-visible');
      void helpMascotBubble.offsetWidth;
      helpMascotBubble.classList.add('is-visible');

      if (mascotHideTimeoutId) {
        clearTimeout(mascotHideTimeoutId);
      }
      mascotHideTimeoutId = setTimeout(() => {
        helpMascotBubble.classList.remove('is-visible');
      }, 5000);
    }

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

      setTimeout(showMascotTip, 900);
      setInterval(showMascotTip, 15000);
    });

    return () => {
      if (navToggle) {
        navToggle.removeEventListener('click', handleNavToggleClick);
      }
      observer.disconnect();
      fadeReplayObserver.disconnect();
      featureRevealObserver.disconnect();
      featureExpandCollapseObserver.disconnect();
      if (mascotHideTimeoutId) {
        clearTimeout(mascotHideTimeoutId);
      }
    };
  }, []);

  return (
    <>
      <div className="page-reveal" id="pageReveal" aria-hidden="true">
        <div className="reveal-panel reveal-left"></div>
        <div className="reveal-panel reveal-right"></div>
      </div>

      <LandingNavbar />

      <img src={heroBg} alt="Hero Image" className="hero-image" />

      <main className="hero reveal-text fade-up">
        <section className="section">
          <div className="text-card">
            <h3 className="reveal-text stagger" data-stagger id="TopP">
              Care as warm as
            </h3>
            <h1 className="reveal-text stagger" data-animate data-stagger>
              Golden
            </h1>
            <h1 className="reveal-text stagger" data-animate data-stagger>
              Fur
            </h1>
            <p className="reveal-text fade-up">
              Compassionate, expert veterinary care for your beloved companions.
              Because every tail wag, purr, and nuzzle deserves the very best in
              health and wellness.
            </p>
          </div>
          <div className="branches">
            <div className="branch-card fade-up">
              <h2>📍 Makati</h2>
            </div>

            <div className="branch-card fade-up">
              <h2>📍 Southwoods, Laguna</h2>
            </div>
          </div>
        </section>
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

      <section className="booking-flow fade-up" aria-label="How booking works">
        <div className="booking-flow-inner">
          <h2 className="booking-flow-title stagger" data-stagger>
            How booking works
          </h2>
          <p className="booking-flow-subtitle fade-up">
            Book in minutes with instant, fully automatic confirmation.
          </p>

          <div
            className="booking-step-tabs"
            id="bookingStepTabs"
            role="tablist"
            aria-label="Booking steps progress"
          >
            <button
              className="booking-step-tab fade-up is-current"
              type="button"
              data-step="0"
            >
              1. Pet
            </button>
            <button
              className="booking-step-tab fade-up"
              type="button"
              data-step="1"
            >
              2. Branch
            </button>
            <button
              className="booking-step-tab fade-up"
              type="button"
              data-step="2"
            >
              3. Service
            </button>
            <button
              className="booking-step-tab fade-up"
              type="button"
              data-step="3"
            >
              4. Groomer/Vet
            </button>
            <button
              className="booking-step-tab fade-up"
              type="button"
              data-step="4"
            >
              5. Payment
            </button>
          </div>

          <div className="booking-step-stage">
            <article
              className="booking-step-card is-active"
              data-step-panel="0"
            >
              <div className="booking-step-number">1</div>
              <h3 className="booking-step-title fade-up">Pick your pet</h3>
              <p className="booking-step-text fade-up">
                Choose which pet profile you are booking for.
              </p>
            </article>

            <article className="booking-step-card" data-step-panel="1" hidden>
              <div className="booking-step-number">2</div>
              <h3 className="booking-step-title fade-up">Pick your branch</h3>
              <p className="booking-step-text fade-up">
                Select your preferred branch location before proceeding.
              </p>
            </article>

            <article className="booking-step-card" data-step-panel="2" hidden>
              <div className="booking-step-number">3</div>
              <h3 className="booking-step-title fade-up">Pick your service</h3>
              <p className="booking-step-text fade-up">
                Choose one of the four available services.
              </p>
            </article>

            <article className="booking-step-card" data-step-panel="3" hidden>
              <div className="booking-step-number">4</div>
              <h3 className="booking-step-title fade-up">
                Pick groomer or vet
              </h3>
              <p className="booking-step-text fade-up" id="bookingStep4Text">
                Choose your preferred specialist, or select{' '}
                <strong>No preference</strong>.
              </p>
              <div
                className="booking-step-conditional-note fade-up"
                id="bookingStep4SkipNote"
                hidden
              >
                Step skipped automatically because selected service does not
                require groomer/vet selection.
              </div>
            </article>

            <article className="booking-step-card" data-step-panel="4" hidden>
              <div className="booking-step-number">5</div>
              <h3 className="booking-step-title fade-up">Payment</h3>
              <p className="booking-step-text fade-up">
                Complete payment securely and receive immediate booking
                confirmation.
              </p>
            </article>
          </div>

          <div className="booking-step-controls">
            <button
              id="bookingPrevBtn"
              className="booking-step-ctrl booking-step-ctrl-prev"
              type="button"
              disabled
            >
              Previous
            </button>
            <button
              id="bookingNextBtn"
              className="booking-step-ctrl booking-step-ctrl-next"
              type="button"
            >
              Next
            </button>
          </div>
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

      <aside className="help-mascot" aria-label="Quick help links">
        <div
          className="help-mascot-bubble"
          id="helpMascotBubble"
          aria-live="polite"
        ></div>

        <button
          className="help-mascot-trigger"
          type="button"
          aria-label="Open quick help"
        >
          <img
            className="help-mascot-image"
            src={doggyGif}
            alt="Dog mascot"
            loading="eager"
            decoding="async"
            onLoad={(event) => {
              event.currentTarget
                .closest('.help-mascot-trigger')
                ?.classList.remove('media-failed');
            }}
            onError={(event) => {
              event.currentTarget
                .closest('.help-mascot-trigger')
                ?.classList.add('media-failed');
            }}
          />
          <span className="help-mascot-fallback" aria-hidden="true">
            🐶
          </span>
        </button>

        <nav className="help-mascot-menu" aria-label="Support links">
          <a href="#" className="help-mascot-link">
            FAQs
          </a>
          <a href="#" className="help-mascot-link">
            Create an account
          </a>
          <a href="#" className="help-mascot-link">
            Create a ticket
          </a>
        </nav>
      </aside>

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
