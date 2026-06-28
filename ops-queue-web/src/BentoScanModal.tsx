import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { extractBentoPickupCodeFromScan } from './bentoPickupRef';

function humanizeCameraError(e: unknown): string {
  const ex = e as DOMException | Error | undefined;
  const name = ex && typeof ex === 'object' && 'name' in ex ? String((ex as DOMException).name) : '';
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    /permission denied/i.test(msg) ||
    /not allowed/i.test(msg)
  ) {
    return 'Camera blocked. Allow access or type the 6-digit pickup code below.';
  }
  if (name === 'NotFoundError' || /not found/i.test(msg)) {
    return 'No camera found. Type the pickup code below.';
  }
  return msg || 'Camera unavailable.';
}

export function BentoScanModal({
  open,
  onClose,
  onScan,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (pickupCode: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scanningRef = useRef(false);
  const [cameraLive, setCameraLive] = useState(true);

  useEffect(() => {
    if (!open) {
      setManualCode('');
      setErr(null);
      scanningRef.current = false;
      setCameraLive(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !cameraLive) return;
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    const controlsRef: { current: { stop: () => void } | null } = { current: null };

    const submitCode = (code: string) => {
      if (scanningRef.current) return;
      scanningRef.current = true;
      setBusy(true);
      setErr(null);
      onScan(code);
      scanningRef.current = false;
      setBusy(false);
      onClose();
    };

    void reader
      .decodeFromVideoDevice(undefined, video, (result, _decodeErr, ctrl) => {
        if (cancelled || !result) return;
        const code = extractBentoPickupCodeFromScan(result.getText());
        if (!code) return;
        ctrl.stop();
        submitCode(code);
      })
      .then((c) => {
        if (!cancelled) controlsRef.current = c;
      })
      .catch((e) => {
        if (!cancelled) setErr(humanizeCameraError(e));
      });

    return () => {
      cancelled = true;
      scanningRef.current = false;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [open, cameraLive, onClose, onScan]);

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const code = extractBentoPickupCodeFromScan(manualCode);
    if (!code) {
      setErr('Enter a 6-digit pickup code or BENTO:123456.');
      return;
    }
    onScan(code);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="scanOverlay" role="dialog" aria-modal aria-label="Scan bento pickup QR">
      <div className="scanModal">
        <div className="scanModalHead">
          <h2>Scan bento pickup</h2>
          <button type="button" className="btnGhost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Member QR encodes <strong>BENTO:&lt;6-digit code&gt;</strong>. You can also type the code below.
        </p>
        <div className="scanVideoWrap">
          <video ref={videoRef} className="scanVideo" muted playsInline />
        </div>
        {err ? <p className="err">{err}</p> : null}
        <form className="scanManual" onSubmit={onManualSubmit}>
          <label htmlFor="bentoManualCode">Pickup code</label>
          <input
            id="bentoManualCode"
            value={manualCode}
            onChange={(ev) => setManualCode(ev.target.value)}
            placeholder="e.g. 104829"
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" className="btnPrimary" disabled={busy}>
            Look up
          </button>
        </form>
      </div>
    </div>
  );
}
