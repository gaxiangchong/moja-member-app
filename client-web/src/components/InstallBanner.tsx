import { useInstallPrompt } from '../lib/pwa';

/**
 * "Add Moja to your home screen" card. Renders nothing when installed,
 * unsupported, or dismissed in the last two weeks (see `useInstallPrompt`).
 */
export function InstallBanner() {
  const { visible, ios, install, dismiss } = useInstallPrompt();
  if (!visible) return null;

  return (
    <div className="installBanner" role="region" aria-label="Install the Moja app">
      <img className="installBannerIcon" src="/icons/icon-192.png" alt="" width={40} height={40} />
      <div className="installBannerBody">
        <div className="installBannerTitle">Add Moja to your home screen</div>
        <div className="installBannerText">
          {ios
            ? 'Tap Share, then “Add to Home Screen” for one-tap ordering.'
            : 'One-tap ordering, faster pickup, no app store needed.'}
        </div>
      </div>
      <div className="installBannerActions">
        {!ios && (
          <button type="button" className="installBannerInstall" onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className="installBannerDismiss" onClick={dismiss} aria-label="Not now">
          ×
        </button>
      </div>
    </div>
  );
}
