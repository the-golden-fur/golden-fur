import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';
import { LandingThemeToggle } from '../LandingThemeToggle/LandingThemeToggle';
import '../../LandingPage.css';

/**
 * Marketing navbar for the public landing page only - distinct from the
 * authenticated shared/components/Navbar used inside /staff and /portal.
 * Just the brand and the actions - the Services/Branches/Packages/About
 * links were removed. Below 900px the actions collapse behind a hamburger
 * (LandingPage.css turns .nav-actions into its dropdown panel). The navbar
 * itself is static - no entrance animation.
 */
export function LandingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav
      ref={navRef}
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

        <button
          ref={toggleRef}
          type="button"
          className="nav-menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="landing-nav-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <div
          id="landing-nav-menu"
          className={menuOpen ? 'nav-actions is-open' : 'nav-actions'}
          style={{ gap: 'clamp(8px, 1.5vw, 12px)', flexWrap: 'wrap' }}
        >
          <Link
            to="/signup"
            className="btn btn-outline"
            style={{ whiteSpace: 'nowrap' }}
            onClick={closeMenu}
          >
            Sign In
          </Link>
          <a
            href="#"
            className="btn btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={closeMenu}
          >
            Book Now
          </a>
          <LandingThemeToggle />
        </div>
      </div>
    </nav>
  );
}
