import { useState } from 'react';
import styles from './MfaSetupGuide.module.css';

type GuideDevice = 'computer' | 'phone';

const APP_STORE_URL =
  'https://apps.apple.com/app/google-authenticator/id388497605';
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2';

/** A touch-first device is most likely the phone the app will live on -
 * which can't scan a QR code on its own screen, so the setup-key path is
 * the one to lead with there. Falls back to 'computer' if matchMedia is
 * unavailable (tests, very old browsers). */
function detectDevice(): GuideDevice {
  try {
    return window.matchMedia('(pointer: coarse)').matches
      ? 'phone'
      : 'computer';
  } catch {
    return 'computer';
  }
}

/**
 * Plain-language, step-by-step help for setting up Google Authenticator,
 * shown inside TotpEnrollPanel (so every enroll entry point - the login-time
 * Set Up MFA page, the mandatory-role popup, Settings > Security - gets it).
 * Written for someone who isn't comfortable navigating their phone: names
 * the exact buttons to tap, in order. Collapsed by default so it doesn't
 * crowd the QR code for people who already know what to do.
 */
export function MfaSetupGuide() {
  const [device, setDevice] = useState<GuideDevice>(detectDevice);

  return (
    <details className={styles.guide}>
      <summary className={styles.summary}>
        Need help? Step-by-step setup guide
      </summary>

      <div className={styles.body}>
        <div className={styles.tabs} role="tablist" aria-label="Your device">
          <button
            type="button"
            role="tab"
            aria-selected={device === 'computer'}
            className={device === 'computer' ? styles.tabActive : styles.tab}
            onClick={() => setDevice('computer')}
          >
            I&apos;m on a computer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={device === 'phone'}
            className={device === 'phone' ? styles.tabActive : styles.tab}
            onClick={() => setDevice('phone')}
          >
            I&apos;m on this phone
          </button>
        </div>

        <ol className={styles.steps}>
          <li className={styles.step}>
            <h3 className={styles.stepTitle}>
              Get the Google Authenticator app on your phone
            </h3>
            <p className={styles.copy}>
              <strong>iPhone:</strong> on your home screen, tap the blue{' '}
              <strong>App Store</strong> icon. Tap <strong>Search</strong> (the
              magnifying glass, bottom right), type{' '}
              <em>Google Authenticator</em>, then tap <strong>Get</strong> next
              to the one made by <strong>Google LLC</strong>. Confirm with Face
              ID, Touch ID or your passcode if asked.
            </p>
            <p className={styles.copy}>
              <strong>Android:</strong> tap the <strong>Play Store</strong> icon
              (a colourful triangle). Tap the search bar at the top, type{' '}
              <em>Google Authenticator</em>, then tap <strong>Install</strong>{' '}
              next to the one made by <strong>Google LLC</strong>.
            </p>
            <p className={styles.copy}>
              Or open it directly:{' '}
              <a
                className={styles.link}
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                App Store (iPhone)
              </a>{' '}
              ·{' '}
              <a
                className={styles.link}
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Play (Android)
              </a>
            </p>
          </li>

          <li className={styles.step}>
            <h3 className={styles.stepTitle}>Open the app</h3>
            <p className={styles.copy}>
              Once it has finished installing, tap <strong>Open</strong> (or
              find the new <strong>Authenticator</strong> icon on your home
              screen and tap it). Tap <strong>Get started</strong>. If it asks
              you to sign in with a Google account, you can sign in (this backs
              up your codes) or tap{' '}
              <strong>Use Authenticator without an account</strong>.
            </p>
          </li>

          {device === 'computer' ? (
            <li className={styles.step}>
              <h3 className={styles.stepTitle}>Scan the QR code</h3>
              <p className={styles.copy}>
                In the app, tap <strong>Add a code</strong> - or, if you have
                used the app before, the colourful <strong>+</strong> button in
                the bottom-right corner. Then tap{' '}
                <strong>Scan a QR code</strong>.
              </p>
              <p className={styles.copy}>
                If your phone asks whether Authenticator may use the camera, tap{' '}
                <strong>Allow</strong> (or <strong>While using the app</strong>
                ).
              </p>
              <p className={styles.copy}>
                Hold your phone up to this computer screen so the black and
                white square below fills the box on your phone&apos;s screen.
                Keep it still until the phone vibrates or a{' '}
                <strong>Golden Fur</strong> entry appears in the app.
              </p>
            </li>
          ) : (
            <li className={styles.step}>
              <h3 className={styles.stepTitle}>Type in the setup key</h3>
              <p className={styles.copy}>
                You can&apos;t scan a code on the same phone, so use the key
                instead. On this page, scroll down to{' '}
                <strong>Can&apos;t scan? Enter this key manually</strong> and
                tap <strong>Copy</strong>.
              </p>
              <p className={styles.copy}>
                Switch to the Authenticator app: swipe up from the bottom of the
                screen (or tap the square button at the bottom on some Android
                phones) and tap Authenticator.
              </p>
              <p className={styles.copy}>
                Tap <strong>Add a code</strong> (or the colourful{' '}
                <strong>+</strong> button, bottom right), then tap{' '}
                <strong>Enter a setup key</strong>.
              </p>
              <ul className={styles.subSteps}>
                <li>
                  <strong>Account</strong>: type <em>Golden Fur</em>.
                </li>
                <li>
                  <strong>Key</strong>: press and hold in the box, then tap{' '}
                  <strong>Paste</strong>.
                </li>
                <li>
                  <strong>Type of key</strong>: leave it on{' '}
                  <strong>Time based</strong>.
                </li>
              </ul>
              <p className={styles.copy}>
                Tap <strong>Add</strong>. A <strong>Golden Fur</strong> entry
                appears in the app.
              </p>
            </li>
          )}

          <li className={styles.step}>
            <h3 className={styles.stepTitle}>Enter the 6-digit code</h3>
            <p className={styles.copy}>
              Under <strong>Golden Fur</strong> in the app you&apos;ll see a
              6-digit number (ignore the space in the middle). Come back to this
              page, type it into the <strong>6-digit code</strong> boxes below
              and tap <strong>Confirm MFA</strong>.
            </p>
            <p className={styles.copy}>
              The number changes every 30 seconds - the little circle next to it
              shows how much time is left. If it&apos;s about to run out, wait
              for the new number.
            </p>
          </li>
        </ol>

        <div className={styles.troubleshooting}>
          <h3 className={styles.stepTitle}>Having trouble?</h3>
          <ul className={styles.subSteps}>
            <li>
              <strong>&quot;Invalid code&quot;</strong>: make sure your
              phone&apos;s date and time are set automatically (in your
              phone&apos;s Settings), then try the newest number.
            </li>
            <li>
              <strong>The camera won&apos;t scan</strong>:{' '}
              <button
                type="button"
                className={styles.inlineButton}
                onClick={() => setDevice('phone')}
              >
                type in the setup key instead
              </button>
              .
            </li>
            <li>
              <strong>You already have an old Golden Fur entry</strong>: use the
              newest one, and delete the old one (press and hold it, then tap
              the bin icon). If you tap <strong>Start over</strong> on this
              page, entries you added before stop working.
            </li>
          </ul>
        </div>
      </div>
    </details>
  );
}
