import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns a full order UUID, or `NUM:<orderNumber>` for sequential pickup codes / ORDER: QR payloads.
 */
export function extractOrderTokenFromScan(raw: string): string | null {
  const t = raw.trim();
  if (UUID_RE.test(t)) return t;
  const m = t.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  if (m) return m[0];
  const orderLbl = t.match(/^ORDER:\s*(\d{3,12})$/i);
  if (orderLbl) return `NUM:${orderLbl[1]}`;
  const numBare = t.match(/^(\d{4,12})$/);
  if (numBare) return `NUM:${numBare[1]}`;
  return null;
}

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
    return (
      'Camera was blocked or needs your tap first. Press “Turn on camera” below, then allow access ' +
      'in the browser prompt — or use “Paste order UUID” (no camera).'
    );
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found/i.test(msg)) {
    return 'No camera found. Use paste UUID below.';
  }
  if (/HTTPS|secure context/i.test(msg)) {
    return 'Camera needs HTTPS (or localhost). Use paste UUID below.';
  }
  return msg || 'Camera or scanner unavailable.';
}

export function ScanCollectModal({
  open,
  onClose,
  onCollect,
  variant = 'modal',
  closeOnCollect = true,
}: {
  open: boolean;
  onClose: () => void;
  onCollect: (orderToken: string) => Promise<void>;
  variant?: 'modal' | 'standalone';
  /** If false, keep scanner open after a successful collect (standalone popup). */
  closeOnCollect?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collectingRef = useRef(false);
  /**
   * Pop-up windows lose the user-activation chain before useEffect runs, so getUserMedia()
   * must start from a click *inside this window*. Standalone scan popup always waits for
   * “Turn on camera”; modal mode can auto-start (same window as queue).
   */
  const [cameraLive, setCameraLive] = useState(() => variant === 'modal');

  useEffect(() => {
    if (!open) {
      setManualId('');
      setErr(null);
      collectingRef.current = false;
      setCameraLive(variant === 'modal');
      return;
    }
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;
    if (variant === 'standalone' && !cameraLive) return;

    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    const controlsRef: { current: { stop: () => void } | null } = { current: null };

    const tryCollect = async (orderToken: string) => {
      if (collectingRef.current) return;
      collectingRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        await onCollect(orderToken);
        if (closeOnCollect) {
          onClose();
        } else {
          collectingRef.current = false;
          setCameraLive(false);
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Collect failed';
        const lower = raw.toLowerCase();
        const apiHint =
          lower.includes('invalid') || lower.includes('unauthorized') || lower.includes('not active')
            ? ' Check the ops API key on the main queue tab and that this order is still open.'
            : '';
        setErr(`${raw}${apiHint}`);
        collectingRef.current = false;
      } finally {
        setBusy(false);
      }
    };

    void reader
      .decodeFromVideoDevice(undefined, video, (result, _decodeErr, ctrl) => {
        if (cancelled || !result) return;
        const tok = extractOrderTokenFromScan(result.getText());
        if (!tok) return;
        ctrl.stop();
        void tryCollect(tok);
      })
      .then((c) => {
        if (!cancelled) controlsRef.current = c;
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(humanizeCameraError(e));
        }
      });

    return () => {
      cancelled = true;
      collectingRef.current = false;
      try {
        controlsRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [open, variant, cameraLive, onCollect, onClose, closeOnCollect]);

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tok = extractOrderTokenFromScan(manualId);
    if (!tok) {
      setErr('Paste order number (e.g. 10042) or full order UUID from the member app.');
      return;
    }
    void (async () => {
      if (collectingRef.current) return;
      collectingRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        await onCollect(tok);
        if (closeOnCollect) {
          onClose();
        } else {
          collectingRef.current = false;
          setManualId('');
          setCameraLive(false);
        }
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Collect failed';
        setErr(raw);
      } finally {
        setBusy(false);
        collectingRef.current = false;
      }
    })();
  };

  if (!open) return null;

  const wrapClass = variant === 'standalone' ? 'scanWindowInner' : 'scanOverlay';
  const innerClass = variant === 'standalone' ? 'scanModal scanModal--standalone' : 'scanModal';
  const showCameraGate = variant === 'standalone' && !cameraLive;

  return (
    <div className={wrapClass} role="dialog" aria-modal={variant === 'modal'} aria-label="Scan order QR">
      <div className={innerClass}>
        <div className="scanModalHead">
          <h2>Scan to collect</h2>
          <button type="button" className="btnGhost" onClick={onClose} disabled={busy}>
            {variant === 'standalone' ? 'Close window' : 'Close'}
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          QR encodes <strong>ORDER:&lt;number&gt;</strong> or a legacy order UUID. Use HTTPS or localhost
          for the camera. You can paste the <strong>order number</strong> or UUID below — no camera required.
        </p>
        {showCameraGate ? (
          <div className="scanCameraGate">
            <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
              In a separate window the browser only allows the camera <strong>after you tap here</strong>{' '}
              (not automatically).
            </p>
            <button
              type="button"
              className="btnPrimary"
              disabled={busy}
              onClick={() => {
                setErr(null);
                setCameraLive(true);
              }}
            >
              Turn on camera
            </button>
          </div>
        ) : (
          <div className="scanVideoWrap">
            <video ref={videoRef} className="scanVideo" muted playsInline />
          </div>
        )}
        {err ? <p className="err">{err}</p> : null}
        <form className="scanManual" onSubmit={onManualSubmit}>
          <label htmlFor="scanManualId">Paste order number or UUID (collect without camera)</label>
          <input
            id="scanManualId"
            value={manualId}
            onChange={(ev) => setManualId(ev.target.value)}
            placeholder="e.g. 10042 or order UUID"
            autoComplete="off"
            disabled={busy}
          />
          <button type="submit" className="btnPrimary" disabled={busy}>
            {busy ? 'Saving…' : 'Mark collected'}
          </button>
        </form>
      </div>
    </div>
  );
}
