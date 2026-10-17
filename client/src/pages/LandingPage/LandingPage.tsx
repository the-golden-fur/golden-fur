import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LandingNavbar } from './components/LandingNavbar/LandingNavbar';
import { HelpMascot } from '../../shared/components/HelpMascot/HelpMascot';
import logo from '../../assets/logo.png';
import { loadLandingPage } from '../../features/landing/api/landing.api';
import {
  CATEGORY_SLUGS,
  FEATURE_SLUGS,
  STORY_STEPS,
  formatOperatingHours,
  type ResolvedLanding,
} from '../../features/landing/landing.content';
import './LandingPage.css';

function getDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;
}

function getMapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

/** One "What we Offer" card. */
type BranchService = {
  name: string;
  image: string;
  alt: string;
  description: string;
};

export default function GoldenFurLanding() {
  // Custom change (editable landing page): the words, images, sections,
  // reviews and branches below come from the server (Settings > Config >
  // Landing Page, Settings > Branches), laid over built-in defaults.
  //
  // The page renders only once that has resolved - loadLandingPage never
  // takes longer than LANDING_LOAD_TIMEOUT_MS, falling back to the defaults -
  // and never re-renders with new content after that. The setup effect below
  // works on the DOM directly (splitting stagger text into spans, observing
  // .fade-up sections, building the service cards), so it must run once,
  // against the final content.
  const [landing, setLanding] = useState<ResolvedLanding | null>(null);

  useEffect(() => {
    let isMounted = true;

    void loadLandingPage().then((resolved) => {
      if (isMounted) setLanding(resolved);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!landing) return;

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

    // Each branch's cards, keyed by branch id (the tab buttons'
    // data-branch): one card per category the branch offers, with the
    // category's editable name, description and image.
    const { text } = landing;
    const branchServices = new Map<string, BranchService[]>(
      landing.branches.map((branch) => [
        branch.id,
        branch.categories.map((category) => {
          const slug = CATEGORY_SLUGS[category];
          const name = text[`services.${slug}.name`];
          return {
            name,
            image: text[`services.${slug}.image`],
            alt: `${name} service`,
            description: text[`services.${slug}.description`],
          };
        }),
      ])
    );

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

    function renderBranchServices(branchId: string) {
      const services = branchServices.get(branchId);
      if (!serviceListEl || !services) return;

      serviceListEl.replaceChildren();

      services.forEach((service, index) => {
        const card = document.createElement('article');
        card.className = 'service-card service-card-stagger';
        card.style.setProperty('--card-delay', `${index * 90}ms`);

        // Built element by element, never as an HTML string: the name and
        // image come from Superadmin-editable content, so they must only
        // ever be set as text / an attribute.
        const imageWrap = document.createElement('div');
        imageWrap.className = 'service-card-image-wrap';
        const image = document.createElement('img');
        image.src = service.image;
        image.alt = service.alt;
        image.className = 'service-card-image';
        image.loading = 'lazy';
        imageWrap.appendChild(image);

        const title = document.createElement('h3');
        title.className = 'service-card-title';
        title.textContent = service.name;

        card.append(imageWrap, title);

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
      } else {
        // e.g. a branch just added in Settings > Branches, before any
        // service is made available there.
        updateServiceDetails({
          name: 'Coming soon',
          description: 'Services at this branch will be listed here soon.',
        });
      }
    }

    serviceBranchButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        serviceBranchButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        renderBranchServices(btn.dataset.branch ?? '');
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

    if (landing.branches.length > 0) {
      renderBranchServices(landing.branches[0].id);
    }

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
  }, [landing]);

  // At most LANDING_LOAD_TIMEOUT_MS - every section below fades in on its
  // own anyway, so this reads as the same entrance, just a moment later.
  if (!landing) {
    return <LandingNavbar />;
  }

  const { text, sections, reviews, branches } = landing;

  return (
    <>
      <div className="page-reveal" id="pageReveal" aria-hidden="true">
        <div className="reveal-panel reveal-left"></div>
        <div className="reveal-panel reveal-right"></div>
      </div>

      <LandingNavbar />

      {sections.hero ? (
        <main className="hero fade-up">
          <img
            src={text['hero.image']}
            alt={text['hero.image_alt']}
            className="hero-image"
          />
          <div className="hero-scrim" aria-hidden="true" />

          <div className="hero-content">
            <p className="hero-eyebrow fade-up">{text['hero.eyebrow']}</p>

            <h1 className="hero-title">
              <span className="hero-title-lead fade-up">
                {text['hero.title_lead']}
              </span>
              <span
                className="hero-title-brand stagger"
                data-stagger
                data-stagger-direction="left"
              >
                {text['hero.title_brand']}
              </span>
            </h1>

            <p className="hero-lead fade-up">{text['hero.lead']}</p>

            <div className="hero-actions fade-up">
              <Link to="/portal/book" className="hero-btn hero-btn-primary">
                {text['hero.primary_cta']}
              </Link>
              <a href="#servicesSection" className="hero-btn hero-btn-ghost">
                {text['hero.secondary_cta']}
              </a>
            </div>

            <ul className="hero-branches fade-up" aria-label="Our branches">
              {branches.map((branch) => (
                <li className="hero-branch" key={branch.id}>
                  <span aria-hidden="true">📍</span> {branch.name}
                </li>
              ))}
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
      ) : null}

      {sections.services ? (
        <div className="services fade-up" id="servicesSection">
          <h1 className="serviceTitle stagger" data-stagger>
            {text['services.title']}
          </h1>

          <div
            className="service-branch-switcher"
            role="tablist"
            aria-label="Branch Services"
          >
            {branches.map((branch, index) => (
              <button
                key={branch.id}
                className={`service-branch-btn${index === 0 ? ' is-active' : ''}`}
                data-branch={branch.id}
                type="button"
              >
                {branch.name}
              </button>
            ))}
          </div>

          <div
            className="service-list"
            id="serviceList"
            aria-live="polite"
          ></div>

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
      ) : null}

      {sections.features ? (
        <section
          className="feature-strip-section"
          id="featureStripSection"
          aria-label="More service highlights"
        >
          <div className="feature-strip">
            {FEATURE_SLUGS.map((slug) => (
              <article className="feature-strip-card" key={slug}>
                <img
                  src={text[`features.${slug}.image`]}
                  alt={`${text[`features.${slug}.title`]} highlight`}
                  className="feature-strip-image"
                  loading="lazy"
                />
                <div className="feature-strip-overlay"></div>
                <div className="feature-strip-content">
                  <div className="feature-strip-copy">
                    <h3>{text[`features.${slug}.title`]}</h3>
                    <p>{text[`features.${slug}.summary`]}</p>
                    <p className="feature-strip-detail">
                      {text[`features.${slug}.detail`]}
                    </p>
                  </div>
                  <button className="feature-strip-btn" type="button">
                    View
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sections.reviews ? (
        <section className="reviews fade-up" aria-labelledby="reviewsTitle">
          <h2 className="reviews-title stagger" data-stagger id="reviewsTitle">
            {text['reviews.title']}
          </h2>
          <p className="reviews-subtitle fade-up">{text['reviews.subtitle']}</p>

          <div className="reviews-grid">
            {reviews.map((review) => (
              <article className="review-card fade-up" key={review.id}>
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
                    {review.detail ? (
                      <span className="review-detail">{review.detail}</span>
                    ) : null}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {sections.story ? (
        <section
          className="scroll-story"
          id="scrollStory"
          aria-label="Guided care journey"
        >
          <div className="scroll-story-inner">
            <div className="scroll-story-left" aria-hidden="true">
              <div className="scroll-story-strip" id="scrollStoryStrip">
                {STORY_STEPS.map((step, index) => (
                  <article
                    key={step}
                    className={`scroll-story-image-card${index === 0 ? ' is-active' : ''}`}
                    data-story-index={index}
                  >
                    <img
                      src={text[`story.${step}.image`]}
                      alt={text[`story.${step}.title`]}
                      loading="lazy"
                    />
                  </article>
                ))}
              </div>
            </div>

            <div className="scroll-story-right">
              {STORY_STEPS.map((step, index) => (
                <article
                  key={step}
                  className={`scroll-story-copy${index === 0 ? ' is-active' : ''}`}
                  data-story-copy={index}
                  hidden={index !== 0}
                >
                  <p className="scroll-story-kicker">Step 0{step}</p>
                  <h3>{text[`story.${step}.title`]}</h3>
                  <p>{text[`story.${step}.body`]}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {sections.visit ? (
        <section
          className="visit fade-up"
          id="visitSection"
          aria-labelledby="visitTitle"
        >
          <h2 className="visit-title stagger" data-stagger id="visitTitle">
            {text['visit.title']}
          </h2>
          <p className="visit-subtitle fade-up">{text['visit.subtitle']}</p>

          <div className="visit-grid">
            {branches.map((branch) => (
              <article className="visit-card fade-up" key={branch.id}>
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
                    {formatOperatingHours(branch.operating_hours).map(
                      (slot) => (
                        <div className="visit-hours-row" key={slot.days}>
                          <dt>{slot.days}</dt>
                          <dd>{slot.time}</dd>
                        </div>
                      )
                    )}
                  </dl>

                  {branch.contact_number ? (
                    <p className="visit-contact">
                      <a
                        href={`tel:${branch.contact_number.replace(/\s/g, '')}`}
                      >
                        {branch.contact_number}
                      </a>
                    </p>
                  ) : null}

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
      ) : null}

      {sections.cta ? (
        <section className="cta-band fade-up" aria-labelledby="ctaBandTitle">
          <div className="cta-band-inner">
            <div className="cta-band-copy">
              <h2 className="cta-band-title" id="ctaBandTitle">
                {text['cta.title']}
              </h2>
              <p className="cta-band-text">{text['cta.text']}</p>
            </div>
            <div className="cta-band-actions">
              <Link
                to="/portal/book"
                className="cta-band-btn cta-band-btn-primary"
              >
                {text['cta.primary_button']}
              </Link>
              <Link to="/branches" className="cta-band-btn cta-band-btn-ghost">
                {text['cta.secondary_button']}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

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
              <p className="footer-tagline">{text['footer.tagline']}</p>
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
              {branches.map((branch) => (
                <li key={branch.id}>📍 {branch.name}</li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>Get in touch</h4>
            <ul>
              <li>
                <a href={`tel:${text['footer.phone'].replace(/\s/g, '')}`}>
                  {text['footer.phone']}
                </a>
              </li>
              <li>
                <a href={`mailto:${text['footer.email']}`}>
                  {text['footer.email']}
                </a>
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
