import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getIslandState, islandMarkShown, type IslandContent } from '../lib/ipc/islandCommands';
import './island.css';

/**
 * Completes the flash-free reveal: `show_island` orders this window in at
 * alpha 0 (macOS) so the previous island's stale composite can't paint;
 * two rAFs after applying the new content, WebKit has committed a fresh
 * frame and Rust may flip alpha to 1. Mirrors the launcher's
 * twoFrames()-then-commit_show gate. Rust drops stale generations, so
 * firing this once per received payload needs no cancellation logic.
 */
function markShownAfterPaint(content: IslandContent): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      islandMarkShown(content.revealGen).catch((err) =>
        console.error('[island] island_mark_shown failed:', err),
      );
    }),
  );
}

// React island page. Console-only logging: the island capability does not
// include the log permission (see capabilities/island.json).
export default function IslandPage() {
  const [content, setContent] = useState<IslandContent | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      // Belt: recover the most recently set state from Rust in case the
      // `island:show` event was emitted before this listener attached. (The
      // island window is eagerly initialized at app startup; on the very
      // first `show_island` call this fallback is what populates the pill
      // before the listener takes over for subsequent calls.)
      try {
        const initial = await getIslandState();
        if (!disposed && initial) {
          setContent(initial);
          markShownAfterPaint(initial);
        }
      } catch (err) {
        console.error('[island] get_island_state failed:', err);
      }

      try {
        const fn = await listen<IslandContent>('island:show', (event) => {
          setContent(event.payload);
          markShownAfterPaint(event.payload);
        });
        const hideFn = await listen('island:hide', () => setContent(null));
        if (disposed) {
          fn();
          hideFn();
        } else {
          unlisten = () => {
            fn();
            hideFn();
          };
        }
      } catch (err) {
        console.error('[island] listen island:show failed:', err);
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const isImageUrl = (icon: string): boolean =>
    /^https?:\/\//.test(icon) || icon.startsWith('data:');

  const isScoreLayout = Boolean(content?.awayIcon);
  const isGoal = Boolean(
    content?.centerText?.toUpperCase().includes('GOAL') ||
    content?.title?.toUpperCase().includes('GOAL'),
  );

  return (
    <div className="island-root">
      {content ? (
        <div
          className={'island-pill' + (isScoreLayout ? ' score' : '') + (isGoal ? ' goal' : '')}
          key={content.revealGen}
        >
          {isScoreLayout ? (
            <>
              {content.icon ? (
                <img
                  className="island-crest"
                  src={content.icon}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ) : null}
              <span className="island-score">{content.title}</span>
              {content.centerText ? (
                <span className="island-center">{content.centerText}</span>
              ) : null}
              <span className="island-score">{content.subtitle}</span>
              {content.awayIcon ? (
                <img
                  className="island-crest"
                  src={content.awayIcon}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ) : null}
            </>
          ) : (
            <>
              {content.icon ? (
                isImageUrl(content.icon) ? (
                  <img
                    className="island-art"
                    src={content.icon}
                    alt=""
                    aria-hidden="true"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : (
                  <span className="island-icon" aria-hidden="true">
                    {content.icon}
                  </span>
                )
              ) : null}
              <span className="island-text">
                <span className="island-title">{content.title}</span>
                {content.subtitle ? (
                  <span className="island-subtitle">{content.subtitle}</span>
                ) : null}
              </span>
              {content.waveform ? (
                <span className="island-wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
