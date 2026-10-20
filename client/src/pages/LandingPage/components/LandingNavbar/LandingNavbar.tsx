import { Link } from 'react-router';
import { LandingThemeToggle } from '../LandingThemeToggle/LandingThemeToggle';
import '../../LandingPage.css';

/**
 * Marketing navbar for the public landing page only - distinct from the
 * authenticated shared/components/Navbar used inside /staff and /portal.
 * Just the brand and the actions - the Services/Branches/Packages/About
 * links (and the mobile hamburger that only revealed them) were removed. The
 * navbar itself is static - no entrance animation.
 */
export function LandingNavbar() {
  return (
    <nav
      className="navbar"
      id="navbar"
      style={{ padding: '14px clamp(16px, 3vw, 24px)' }}
    >
      <div
        className="nav-inner"
        style={{
          gridTemplateColumns: 'auto auto',
          justifyContent: 'space-between',
          gap: 'clamp(12px, 2.4vw, 20px)',
        }}
      >
        <Link to="/" className="brand">
          Golden Fur
        </Link>

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
          <LandingThemeToggle />
        </div>
      </div>
    </nav>
  );
}
