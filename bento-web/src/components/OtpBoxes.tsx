import { useCallback, useRef, useState } from 'react';
import './OtpBoxes.css';

type OtpBoxesProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  length?: number;
  masked?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  name?: string;
};

export function OtpBoxes({
  id,
  value,
  onChange,
  length = 6,
  masked = false,
  autoFocus = false,
  disabled = false,
  ariaLabel = 'Verification code',
  name,
}: OtpBoxesProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  const focusInput = useCallback(() => {
    if (disabled) return;
    inputRef.current?.focus();
  }, [disabled]);

  const handleChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const next = ev.target.value.replace(/\D/g, '').slice(0, length);
      onChange(next);
    },
    [length, onChange],
  );

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div
      className={`otpBoxes${disabled ? ' otpBoxesDisabled' : ''}`}
      role="group"
      aria-label={ariaLabel}
      onClick={focusInput}
    >
      {Array.from({ length }, (_, i) => {
        const digit = value[i] ?? '';
        const filled = Boolean(digit);
        const isActive = isFocused && !disabled && i === activeIndex;
        return (
          <div
            key={i}
            className={['otpBox', filled ? 'otpBoxFilled' : '', isActive ? 'otpBoxActive' : '']
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          >
            {filled ? (masked ? '\u2022' : digit) : ''}
          </div>
        );
      })}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        maxLength={length}
        disabled={disabled}
        autoFocus={autoFocus}
        className="otpHiddenInput"
        aria-label={ariaLabel}
      />
    </div>
  );
}
