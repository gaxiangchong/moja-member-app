import { useState } from 'react';

type Props = { onClose: () => void };

export default function OrgOnboarding({ onClose }: Props) {
  const [step, setStep] = useState(1);
  const [orgName, setOrgName] = useState('');
  const [billingContact, setBillingContact] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [invoiceEnabled, setInvoiceEnabled] = useState(false);

  return (
    <div className="modalOverlay">
      <div className="modalContent">
        <div className="onboardHeader">
          <h2>Create organization</h2>
          <button type="button" className="linkBtn" onClick={onClose}>
            Close
          </button>
        </div>

        {step === 1 && (
          <div className="onboardStep">
            <p className="caption">Basic information for your organization.</p>
            <label>Organization name</label>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <label>Billing contact (email)</label>
            <input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} type="email" />
            <div className="onboardActions">
              <button type="button" className="btnSecondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btnPrimary"
                onClick={() => setStep(2)}
                disabled={!orgName || !billingContact}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboardStep">
            <p className="caption">Invite team members by email (comma separated).</p>
            <label>Invite emails</label>
            <textarea value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} rows={4} />
            <div className="onboardActions">
              <button type="button" className="btnSecondary" onClick={() => setStep(1)}>
                Back
              </button>
              <button type="button" className="btnPrimary" onClick={() => setStep(3)}>
                Next: Billing
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboardStep">
            <p className="caption">Billing preference for the organization.</p>
            <label className="checkRow">
              <input
                type="checkbox"
                checked={invoiceEnabled}
                onChange={(e) => setInvoiceEnabled(e.target.checked)}
              />
              Enable invoicing / PO support
            </label>
            <div style={{ marginTop: 12 }} />
            <div className="onboardActions">
              <button type="button" className="btnSecondary" onClick={() => setStep(2)}>
                Back
              </button>
              <button type="button" className="btnPrimary" onClick={onClose}>
                Finish (demo)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
