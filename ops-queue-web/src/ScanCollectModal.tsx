import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractOrderIdFromScan(raw: string): string | null {
  const t = raw.trim();
  if (UUID_RE.test(t)) return t;
  const m = t.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  );
  return m ? m[0] : null;
}

export function ScanCollectModal({
  open,
  onClose,
  onCollect,
}: {
  open: boolean;
  onClose: () => void;
  onCollect: (orderId: string) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collectingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setManualId('');
      setErr(null);
      collectingRef.current = false;
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    const controlsRef: { current: { stop: () => void } | null } = { current: null };

    const tryCollect = async (orderId: string) => {
      if (collectingRef.current) return;
      collectingRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        await onCollect(orderId);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Collect failed');
        collectingRef.current = false;
      } finally {
        setBusy(false);
      }
    };

    void reader
      .decodeFromVideoDevice(undefined, video, (result, _decodeErr, ctrl) => {
        if (cancelled || !result) return;
        const id = extractOrderIdFromScan(result.getText());
        if (!id) return;
        ctrl.stop();
        void tryCollect(id);
      })
      .then((c) => {
        if (!cancelled) controlsRef.current = c;
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Camera or scanner unavailable');
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
  }, [open, onCollect, onClose]);

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const id = extractOrderIdFromScan(manualId);
    if (!id) {
      setErr('Paste a full order UUID from the member app.');
      return;
    }
    void (async () => {
      if (collectingRef.current) return;
      collectingRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        await onCollect(id);
        onClose();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Collect failed');
      } finally {
        setBusy(false);
        collectingRef.current = false;
      }
    })();
  };

  if (!open) return null;

  return (
    <div className="scanOverlay" role="dialog" aria-modal="true" aria-label="Scan order QR">
      <div className="scanModal">
        <div className="scanModalHead">
          <h2>Scan to collect</h2>
          <button type="button" className="btnGhost" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Point the camera at the member&apos;s order QR (order id). Works on HTTPS or localhost.
        </p>
        <div className="scanVideoWrap">
          <video ref={videoRef} className="scanVideo" muted playsInline />
        </div>
        {err ? <p className="err">{err}</p> : null}
        <form className="scanManual" onSubmit={onManualSubmit}>
          <label htmlFor="scanManualId">Or paste order UUID</label>
          <input
            id="scanManualId"
            value={manualId}
            onChange={(ev) => setManualId(ev.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
