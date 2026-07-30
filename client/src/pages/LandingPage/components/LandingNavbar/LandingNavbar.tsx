import { Link, useLocation } from 'react-router';
import '../../LandingPage.module.css';

/**
 * Marketing navbar for the public landing page only - distinct from the
 * authenticated shared/components/Navbar used inside /staff and /portal.
 * Ids/classes are unchanged from their previous inline markup: LandingPage's
 * own useEffect still wires up the mobile toggle and stagger-text animation
 * by querying #navToggle/#primaryNavLinks/.brand[data-stagger] directly.
 */
export function LandingNavbar() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <nav
      className="navbar"
      id="navbar"
      style={{ padding: '14px clamp(16px, 3vw, 24px)' }}
    >
      <div
        className="nav-inner"
        style={{
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          gap: 'clamp(12px, 2.4vw, 20px)',
        }}
      >
        <Link to="/" className="brand stagger" data-stagger>
          Golden Fur
        </Link>

        <button
          className="nav-toggle"
          id="navToggle"
          aria-label="Toggle navigation menu"
          aria-expanded="false"
          aria-controls="primaryNavLinks"
          type="button"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <ul
          className="nav-links"
          id="primaryNavLinks"
          style={{ gap: 'clamp(10px, 2vw, 20px)', justifyContent: 'center' }}
        >
          <li>
            {isHome ? (
              <a href="#featureStripSection">Services</a>
            ) : (
              <Link to="/#featureStripSection">Services</Link>
            )}
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

        <div
          className="nav-actions"
          style={{ gap: 'clamp(8px, 1.5vw, 12px)', flexWrap: 'wrap' }}
        >
          <Link
            to="/signup"
            className="btn btn-outline"
            style={{ whiteSpace: 'nowrap' }}
          >
            Sign In
          </Link>
          <a
            href="#"
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
          >
            Book Now
          </a>
        </div>
      </div>
    </nav>
  );
}
