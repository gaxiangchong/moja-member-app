import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

/** The member QR is just their phone number, without the +. Returns digits, or null. */
export function phoneFromMemberQr(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function cameraMessage(e: unknown): string {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as DOMException).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera blocked. Allow access, or type the phone number instead.';
  }
  if (name === 'NotFoundError') return 'No camera found. Type the phone number instead.';
  return e instanceof Error && e.message ? e.message : 'Camera unavailable.';
}

/** Scans the QR on the member's phone (Moja app → Account → Show my member QR). */
export function MemberQrScanModal({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  /** Digits of the member's phone number. */
  onScan: (phoneDigits: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video) return;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    let handled = false;
    const controls: { current: { stop: () => void } | null } = { current: null };

    void reader
      .decodeFromVideoDevice(undefined, video, (result, _e, ctrl) => {
        if (cancelled || handled || !result) return;
        const phone = phoneFromMemberQr(result.getText());
        if (!phone) {
          setErr('That QR is not a Moja member code.');
          return;
        }
        handled = true;
        ctrl.stop();
        onScan(phone);
        onClose();
      })
      .then((c) => {
        if (!cancelled) controls.current = c;
      })
      .catch((e) => {
        if (!cancelled) setErr(cameraMessage(e));
      });

    return () => {
      cancelled = true;
      try {
        controls.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [open, onClose, onScan]);

  if (!open) return null;
  return (
    <div className="scanOverlay" role="dialog" aria-modal aria-label="Scan member QR">
      <div className="scanModal">
        <div className="scanModalHead">
          <h2>Scan member QR</h2>
          <button type="button" className="btnGhost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Ask the member to open the Moja app → Account → <strong>Show my member QR</strong>.
        </p>
        <div className="scanVideoWrap">
          <video ref={videoRef} className="scanVideo" muted playsInline />
        </div>
        {err ? <p className="err">{err}</p> : null}
      </div>
    </div>
  );
}
