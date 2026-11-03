/**
 * Back to the order queue from a subscreen. Subscreens open as their own
 * windows from the queue, so Home brings that window forward and closes this
 * one; opened on its own (a bookmark, a refresh), it loads the queue here.
 */
function goHome(): void {
  try {
    const opener = window.opener as Window | null;
    if (opener && !opener.closed) {
      opener.focus();
      window.close();
      return;
    }
  } catch {
    /* opener from another origin: fall through */
  }
  const u = new URL(window.location.href);
  u.hash = '';
  // A URL without a fragment is a full load, so main.tsx picks the queue.
  window.location.assign(u.toString().replace(/#$/, ''));
}

export function HomeBar({ title }: { title: string }) {
  return (
    <nav className="homeBar" aria-label="Ops navigation">
      <button type="button" className="homeBtn" onClick={goHome}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-5.5h3V20h5V9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Order queue
      </button>
      <span className="homeBarTitle">{title}</span>
    </nav>
  );
}
