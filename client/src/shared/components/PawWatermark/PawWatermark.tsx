// One large rounded main pad, plus 4 toe pads fanned out above it - the
// classic paw-print silhouette. The previous layout put all 5 ellipses in a
// single row (a "5 dots" cluster, not a paw), so this one moves the main pad
// to the bottom-center and arcs the toes above it, narrowest in the middle.
const pawEllipses = [
  { cx: 50, cy: 68, rx: 22, ry: 18 },
  { cx: 20, cy: 40, rx: 10, ry: 13 },
  { cx: 38, cy: 18, rx: 9, ry: 12 },
  { cx: 62, cy: 18, rx: 9, ry: 12 },
  { cx: 80, cy: 40, rx: 10, ry: 13 },
];

/** Decorative paw-print watermark for a login-hero panel (StaffLoginPage,
 * CustomerLoginPage, CustomerSignupPage) - fill tracks
 * --color-text-on-heropanel so it stays visible against both the light-mode
 * gold gradient and the dark-mode brown gradient. */
export function PawWatermark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {pawEllipses.map((ellipse) => (
        <ellipse
          key={`${ellipse.cx}-${ellipse.cy}`}
          {...ellipse}
          fill="var(--color-text-on-heropanel)"
        />
      ))}
    </svg>
  );
}
