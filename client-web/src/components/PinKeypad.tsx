import './PinKeypad.css';

export function PinDots({ length, max = 6 }: { length: number; max?: number }) {
  return (
    <div
      className="pinDots"
      role="status"
      aria-live="polite"
      aria-label={`${length} of ${max} digits entered`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pinDot ${i < length ? 'filled' : ''}`} />
      ))}
    </div>
  );
}

/** Six underlined slots with large digits (PIN entry). */
export function PinDigitSlots({
  value,
  maxLength = 6,
}: {
  value: string;
  maxLength?: number;
}) {
  return (
    <div className="pinDigitSlots" role="group" aria-label="PIN entry">
      {Array.from({ length: maxLength }, (_, i) => (
        <div
          key={i}
          className={`pinDigitSlot ${i < value.length ? 'hasDigit' : ''}`}
        >
          <span className="pinDigitChar">{value[i] ?? ''}</span>
          <span className="pinDigitUnderline" />
        </div>
      ))}
    </div>
  );
}

const KEYPAD_LETTERS: Record<string, string> = {
  '1': '',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '',
};

type PinKeypadProps = {
  value: string;
  maxLength?: number;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** `disc` = circular keys; `sheet` = rounded-rect keys with phone-style letter row */
  variant?: 'disc' | 'sheet';
};

const ROWS: Array<Array<'1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' | 'back' | null>> = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [null, '0', 'back'],
];

export function PinKeypad({
  value,
  maxLength = 6,
  onChange,
  disabled,
  variant = 'disc',
}: PinKeypadProps) {
  const append = (d: string) => {
    if (disabled || value.length >= maxLength) return;
    onChange(value + d);
  };

  const back = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const rootClass = variant === 'sheet' ? 'pinKeypad pinKeypadSheet' : 'pinKeypad';
  const keyClass = variant === 'sheet' ? 'pinKey pinKeySheet' : 'pinKey';
  const backClass =
    variant === 'sheet' ? 'pinKey pinKeySheet pinKeyBack pinKeyBackSheet' : 'pinKey pinKeyBack';

  return (
    <div className={rootClass}>
      {ROWS.map((row, ri) => (
        <div className="pinKeyRow" key={ri}>
          {row.map((cell, ci) => {
            if (cell === null) {
              return <div className="pinKeySpacer" key={`s-${ci}`} />;
            }
            if (cell === 'back') {
              return (
                <button
                  key="back"
                  type="button"
                  className={backClass}
                  onClick={back}
                  disabled={disabled || value.length === 0}
                  aria-label="Delete digit"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M20 5H9l-7 7 7 7h11a2 2 0 002-2V7a2 2 0 00-2-2z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M15.5 9.5l-7 7M8.5 9.5l7 7"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              );
            }
            const letters = KEYPAD_LETTERS[cell] ?? '';
            return (
              <button
                key={cell}
                type="button"
                className={keyClass}
                onClick={() => append(cell)}
                disabled={disabled || value.length >= maxLength}
                aria-label={`Digit ${cell}`}
              >
                <span className="pinKeyNum">{cell}</span>
                {variant === 'sheet' && letters ? (
                  <span className="pinKeyLetters">{letters}</span>
                ) : variant === 'sheet' ? (
                  <span className="pinKeyLetters pinKeyLettersEmpty" />
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
