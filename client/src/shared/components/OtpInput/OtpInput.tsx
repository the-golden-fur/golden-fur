import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import styles from './OtpInput.module.css';

interface OtpInputProps {
  /** Digits entered so far, e.g. "123" while typing a 6-digit code. */
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Accessible group label, e.g. "6-digit code". */
  label: string;
}

/**
 * One box per digit - the now-standard OTP input shape, replacing a single
 * free-text `maxLength={6}` field across every MFA enroll/verify form
 * (staff login challenge/enrollment, customer login challenge, Settings >
 * Security). Still a plain controlled `value`/`onChange` string, so callers
 * keep their existing totpCodeSchema validation and submit logic unchanged -
 * only the rendered input swaps out.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  label,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  function setDigits(next: string[]) {
    onChange(next.join('').slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = digits.slice();
    next[index] = digit;
    setDigits(next);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = digits.slice();
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;

    event.preventDefault();
    const next = digits.slice();
    for (
      let offset = 0;
      offset < pasted.length && index + offset < length;
      offset += 1
    ) {
      next[index + offset] = pasted[offset];
    }
    setDigits(next);

    const lastFilledIndex = Math.min(index + pasted.length, length) - 1;
    inputRefs.current[Math.max(lastFilledIndex, 0)]?.focus();
  }

  return (
    <div className={styles.group} role="group" aria-label={label}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          className={styles.box}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          onFocus={(event) => event.target.select()}
          aria-label={`Digit ${index + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
