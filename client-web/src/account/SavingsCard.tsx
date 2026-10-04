import { useEffect, useState } from 'react';

import { fetchMemberSavings, type MemberSavings } from '../api';
import { formatRm } from '../shop/data/mockCatalog';

/**
 * What the member has saved by being a member: vouchers and rewards on app
 * orders, plus discounts on in-store receipts, since they joined.
 * Loads when the Account tab is opened.
 */
export function SavingsCard({ active }: { active: boolean }) {
  const [savings, setSavings] = useState<MemberSavings | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    // A nicety: if it fails the card keeps its last figure (or "adding up").
    fetchMemberSavings()
      .then((s) => {
        if (alive) setSavings(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [active]);

  if (!savings) {
    return (
      <section className="pmCard savingsCard" aria-busy="true">
        <p className="savingsLabel">Your savings</p>
        <p className="caption" style={{ margin: 0 }}>
          Adding up your savings…
        </p>
      </section>
    );
  }
  const since = savings.memberSince ? new Date(savings.memberSince) : null;
  const sinceLabel =
    since && !Number.isNaN(since.getTime())
      ? since.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : null;
  const saved = savings.totalSavedCents > 0;
  const splitKnown =
    savings.onlineSavedCents > 0 && savings.inStoreSavedCents > 0;
  return (
    <section className="pmCard savingsCard">
      <p className="savingsLabel">Your savings</p>
      <p
        className="savingsValue"
        aria-label={`You have saved ${formatRm(savings.totalSavedCents)}`}
      >
        {formatRm(savings.totalSavedCents)}
      </p>
      <p className="caption savingsCaption">
        {saved
          ? sinceLabel
            ? `Saved with Moja since you joined in ${sinceLabel}`
            : 'Saved with Moja since you joined'
          : 'Use a voucher or reward on your next order and your savings will add up here.'}
      </p>
      {splitKnown ? (
        <p className="caption savingsSplit">
          Online orders {formatRm(savings.onlineSavedCents)} · In store{' '}
          {formatRm(savings.inStoreSavedCents)}
        </p>
      ) : null}
    </section>
  );
}
