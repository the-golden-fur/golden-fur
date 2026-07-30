# Landing Navbar Static Pages (Branches, Packages, About)

Type: Custom, client-only, scoped to the public marketing landing page.
Branch: `17-landing-static-pages` (suggested; based off `dev`).

## Scope

1. **Services smooth-scroll.** The navbar's "Services" link now scrolls (smoothly) to the feature-strip section on the landing page itself (`id="featureStripSection"` added to that `<section>`), instead of doing nothing (`href="#"`). `scroll-margin-top: 120px` on that section keeps it from landing underneath the fixed navbar pill.
2. **Three new placeholder pages.** `Branches`, `Packages`, and `About` are no longer dead `href="#"` links - each now routes to a real page:
   - `/branches` → `client/src/pages/BranchesPage`
   - `/packages` → `client/src/pages/PackagesPromosPage`
   - `/about` → `client/src/pages/AboutPage`
   Each is a minimal, ready-to-customize template: the shared `LandingNavbar` at the top, a placeholder heading/paragraph, and a "Back to home" link back to `/`. No content/design has been written for these yet - that's intentionally left for a follow-up pass.
3. **Footer parity.** The landing page footer's "Explore" column had the exact same four dead links duplicated - updated to match (Services scrolls, the other three route to their new pages).

## Files changed (high level)

- `client/src/pages/LandingPage/components/LandingNavbar/LandingNavbar.tsx` - Services → anchor scroll; Branches/Packages/About → `react-router` `Link`.
- `client/src/pages/LandingPage/LandingPage.tsx` - added `id="featureStripSection"`; footer "Explore" links updated to match the navbar; added `Link` import.
- `client/src/pages/LandingPage/LandingPage.module.css` - `html { scroll-behavior: smooth }`; `scroll-margin-top` on `.feature-strip-section`.
- `client/src/routes.tsx` - registers `/branches`, `/packages`, `/about`.
- New: `client/src/pages/BranchesPage/{BranchesPage.tsx,BranchesPage.module.css,BranchesPage.spec.ts}`
- New: `client/src/pages/PackagesPromosPage/{PackagesPromosPage.tsx,PackagesPromosPage.module.css,PackagesPromosPage.spec.ts}`
- New: `client/src/pages/AboutPage/{AboutPage.tsx,AboutPage.module.css,AboutPage.spec.ts}`

No server, database, or API changes - this batch is client-routing/UI only.

## Automated Verification

From `client/`:

```powershell
npx tsc -b --noEmit
npx vitest run
```

Expected: typecheck clean, **511/511 tests pass** (117 files) - 3 more than the prior 508/114, one new spec per new page. Pre-existing `act(...)` warnings from `NewWalkInCustomerForm` tests are unrelated to this change.

## Manual Verification

You'll need the `client/` dev server running (`npm run dev` from the repo root, or `npm run dev` inside `client/` if you only need the frontend).

1. Open the landing page (`/`). Click **Services** in the navbar - confirm the page smoothly scrolls down to the "Premium Grooming / Veterinary Consults / Trusted Day Care / Comfort Pet Hotel" feature strip, and that the strip isn't hidden behind the floating navbar pill when it settles.
2. Click **Branches** in the navbar - confirm it navigates to `/branches` and renders the navbar plus a "Branches" placeholder heading and a working "Back to home" link.
3. Click **Packages** in the navbar - confirm it navigates to `/packages` and renders a "Packages & Promos" placeholder heading, same layout as above.
4. Click **About** in the navbar - confirm it navigates to `/about` and renders an "About" placeholder heading, same layout as above.
5. On each of the three new pages, confirm the navbar itself still works (Services still scrolls back to the home page's feature strip, Sign In/Book Now still render) and resize to a narrow viewport to confirm the hamburger menu still opens/closes correctly.
6. Scroll to the footer on `/` and repeat steps 1-4 using the footer's "Explore" column links - confirm they behave identically to the navbar's.
7. Directly visit `/branches`, `/packages`, and `/about` in the URL bar (not just via navbar clicks) - confirm each loads directly without a 404.
