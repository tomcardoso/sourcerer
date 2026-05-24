import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContactScreenshot } from '@shared/types';
import './ContactDetail.css';
import './ScreenshotPanel.css';

interface Props {
  contactId: string;
}

export default function ScreenshotPanel({ contactId }: Props) {
  const [screenshots, setScreenshots] = useState<ContactScreenshot[]>([]);
  const [screenshotImages, setScreenshotImages] = useState<Record<string, string>>({});
  const [viewingScreenshot, setViewingScreenshot] = useState<string | null>(null);
  const [hoveredScreenshotId, setHoveredScreenshotId] = useState<string | null>(null);
  const [confirmDeleteScreenshotId, setConfirmDeleteScreenshotId] = useState<string | null>(null);
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit');
  const viewerRef = useRef<HTMLDivElement>(null);
  const imageAreaRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const inFlightRef = useRef<Set<string>>(new Set());
  // Ref always holds the latest screenshotImages so async callbacks and the
  // loadAll effect can check current state without a stale closure.
  const screenshotImagesRef = useRef<Record<string, string>>({});
  screenshotImagesRef.current = screenshotImages;

  useEffect(() => {
    window.sourcerer.listScreenshots(contactId).then(setScreenshots);
  }, [contactId]);

  useEffect(() => {
    return window.sourcerer.onScreenshotAssigned((assignedId) => {
      if (assignedId === contactId) {
        window.sourcerer.listScreenshots(contactId).then(setScreenshots);
      }
    });
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      for (const s of screenshots) {
        if (cancelled) return;
        if (screenshotImagesRef.current[s.id]) continue;
        const result = await window.sourcerer.loadScreenshot(s.id);
        if (cancelled) return;
        if ('data' in result) {
          setScreenshotImages((prev) => ({ ...prev, [s.id]: result.data }));
        } else {
          console.error('[screenshot] load failed for', s.id, '—', result.error);
          setScreenshotImages((prev) => ({ ...prev, [s.id]: `error:${result.error}` }));
        }
      }
    }

    loadAll().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [screenshots]);

  useEffect(() => {
    if (viewingScreenshot) {
      viewerRef.current?.focus();
      setZoomMode('fit');
    }
  }, [viewingScreenshot]);

  async function loadScreenshotImage(id: string) {
    if (screenshotImagesRef.current[id] || inFlightRef.current.has(id)) return;
    inFlightRef.current.add(id);
    try {
      const result = await window.sourcerer.loadScreenshot(id);
      if ('data' in result) {
        setScreenshotImages((prev) => ({ ...prev, [id]: result.data }));
      } else {
        console.error('[screenshot] load failed for', id, '—', result.error);
        setScreenshotImages((prev) => ({ ...prev, [id]: `error:${result.error}` }));
      }
    } finally {
      inFlightRef.current.delete(id);
    }
  }

  async function handleDeleteScreenshot(id: string) {
    await window.sourcerer.deleteScreenshot(id);
    setScreenshots((prev) => prev.filter((s) => s.id !== id));
    setScreenshotImages((prev) => { const next = { ...prev }; delete next[id]; return next; });
    if (viewingScreenshot === id) setViewingScreenshot(null);
  }

  if (screenshots.length === 0) return null;

  return (
    <div className="detail-section detail-section--screenshots">
      <div className="detail-section-label">Screenshots</div>
      <div className="sp-grid">
        {screenshots.map((s) => (
          <div
            key={s.id}
            className="sp-thumb"
            onClick={() => { if (confirmDeleteScreenshotId === s.id) return; setViewingScreenshot(s.id); loadScreenshotImage(s.id); }}
            onMouseEnter={() => { loadScreenshotImage(s.id); setHoveredScreenshotId(s.id); }}
            onMouseLeave={() => setHoveredScreenshotId(null)}
            title={new Date(s.captured_at * 1000).toLocaleString()}
          >
            {screenshotImages[s.id]?.startsWith('error:') ? (
              <div className="sp-thumb-error" title={screenshotImages[s.id].slice(6)}>Failed to load</div>
            ) : screenshotImages[s.id] ? (
              <img src={screenshotImages[s.id]} className="sp-thumb-img" alt="screenshot" />
            ) : (
              <div className="sp-thumb-loading">⬜</div>
            )}
            {confirmDeleteScreenshotId === s.id ? (
              <div className="sp-delete-confirm">
                <span className="sp-delete-label">Delete?</span>
                <div className="sp-delete-actions">
                  <button className="sp-delete-yes" onClick={(e) => { e.stopPropagation(); setConfirmDeleteScreenshotId(null); handleDeleteScreenshot(s.id); }}>Yes</button>
                  <button className="sp-delete-no" onClick={(e) => { e.stopPropagation(); setConfirmDeleteScreenshotId(null); }}>No</button>
                </div>
              </div>
            ) : hoveredScreenshotId === s.id && (
              <button
                className="sp-thumb-remove"
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteScreenshotId(s.id); }}
                title="Delete screenshot"
              >×</button>
            )}
          </div>
        ))}
      </div>

      {viewingScreenshot && screenshotImages[viewingScreenshot] && !screenshotImages[viewingScreenshot].startsWith('error:') && createPortal(
        <div
          ref={viewerRef}
          className="sv-overlay"
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setViewingScreenshot(null); } }}
        >
          <div className="sv-toolbar" onClick={(e) => e.stopPropagation()}>
            <span className="sv-toolbar-url">
              {screenshots.find((s) => s.id === viewingScreenshot)?.tab_url ?? ''}
            </span>
            {(() => {
              const shot = screenshots.find((s) => s.id === viewingScreenshot);
              return shot ? (
                <span className="sv-toolbar-date">
                  {new Date(shot.captured_at * 1000).toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit', second: '2-digit',
                  })}
                </span>
              ) : null;
            })()}
            <div className="sv-toolbar-actions">
              <div className="sv-zoom-toggle">
                <button
                  className={`sv-zoom-btn${zoomMode === 'fit' ? ' sv-zoom-btn--active' : ''}`}
                  onClick={() => setZoomMode('fit')}
                >Fit</button>
                <button
                  className={`sv-zoom-btn${zoomMode === 'actual' ? ' sv-zoom-btn--active' : ''}`}
                  onClick={() => setZoomMode('actual')}
                >1:1</button>
              </div>
              <button className="sv-action-btn" onClick={() => window.sourcerer.saveScreenshot(viewingScreenshot)}>Download</button>
              <button className="sv-action-btn sv-action-btn--danger" onClick={() => handleDeleteScreenshot(viewingScreenshot)}>Delete</button>
              <button className="sv-action-btn" onClick={() => setViewingScreenshot(null)}>Close</button>
            </div>
          </div>
          <div
            ref={imageAreaRef}
            className={`sv-image-area${zoomMode === 'actual' ? ' sv-image-area--actual' : ' sv-image-area--fit'}`}
            onClick={(e) => {
              if (zoomMode === 'fit' && e.target === imageAreaRef.current) setViewingScreenshot(null);
            }}
            onMouseDown={(e) => {
              if (zoomMode !== 'actual' || !imageAreaRef.current) return;
              isDragging.current = true;
              dragStart.current = {
                x: e.clientX,
                y: e.clientY,
                scrollLeft: imageAreaRef.current.scrollLeft,
                scrollTop: imageAreaRef.current.scrollTop,
              };
            }}
            onMouseMove={(e) => {
              if (!isDragging.current || !imageAreaRef.current) return;
              e.preventDefault();
              imageAreaRef.current.scrollLeft = dragStart.current.scrollLeft - (e.clientX - dragStart.current.x);
              imageAreaRef.current.scrollTop = dragStart.current.scrollTop - (e.clientY - dragStart.current.y);
            }}
            onMouseUp={() => { isDragging.current = false; }}
            onMouseLeave={() => { isDragging.current = false; }}
          >
            <img
              className="sv-image"
              src={screenshotImages[viewingScreenshot]}
              alt="screenshot"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                if (zoomMode === 'fit') setZoomMode('actual'); else setZoomMode('fit');
              }}
            />
          </div>
        </div>
      , document.body)}
    </div>
  );
}
