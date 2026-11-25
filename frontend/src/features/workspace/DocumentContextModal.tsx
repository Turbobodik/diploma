import { AlertCircle, BookOpen, Expand } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Skeleton } from '../../components/common/Skeleton';
import type { DocumentContextResponse } from '../../models/api';
import { normalizeAxiosError } from '../../services/httpClient';
import { workspaceService } from '../../services/workspaceService';

export interface DocumentContextTarget {
  documentId: string;
  documentName: string;
  charStart: number;
  charEnd: number;
  pageNo?: number | null;
  heading?: string;
}

export interface DocumentContextModalProps {
  projectId: string;
  target: DocumentContextTarget | null;
  onClose: () => void;
}

const DEFAULT_WINDOW = 900;
const MAX_WINDOW = 5000;

interface FetchState {
  windowSize: number;
  context: DocumentContextResponse | null;
  error: string | null;
}

function DocumentContextModalBody({
  projectId,
  target,
  onClose,
}: {
  projectId: string;
  target: DocumentContextTarget;
  onClose: () => void;
}) {
  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW);
  const [fetched, setFetched] = useState<FetchState>({
    windowSize: 0,
    context: null,
    error: null,
  });
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    workspaceService
      .getDocumentContext(projectId, target.documentId, {
        char_start: target.charStart,
        char_end: target.charEnd,
        window: windowSize,
      })
      .then((res) => {
        if (!cancelled) {
          setFetched({ windowSize, context: res, error: null });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetched((prev) => ({
            windowSize,
            context: prev.context,
            error: normalizeAxiosError(err).message,
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, target.documentId, target.charStart, target.charEnd, windowSize]);

  const { context, error } = fetched;
  const loading = fetched.windowSize !== windowSize;

  useEffect(() => {
    if (context && markRef.current && typeof markRef.current.scrollIntoView === 'function') {
      markRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [context]);

  const title = `${target.heading ?? 'Document Context'} — ${target.documentName}`;
  const before = context ? context.excerpt.slice(0, context.highlight_start) : '';
  const highlighted = context
    ? context.excerpt.slice(context.highlight_start, context.highlight_end)
    : '';
  const after = context ? context.excerpt.slice(context.highlight_end) : '';
  const canExpand = Boolean(
    context && (context.has_before || context.has_after) && windowSize < MAX_WINDOW,
  );

  return (
    <Modal open title={title} onClose={onClose}>
      <div className="stack-md">
        <div className="cluster text-muted">
          <BookOpen size={15} aria-hidden="true" />
          <span>{target.documentName}</span>
          {context?.page_no || target.pageNo ? (
            <span>· Page {context?.page_no ?? target.pageNo}</span>
          ) : null}
          <span className="mono">
            · chars [{target.charStart}..{target.charEnd}]
          </span>
        </div>

        {error ? (
          <div className="alert-banner error" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && !context ? (
          <div className="stack-sm">
            <Skeleton variant="line" count={5} />
          </div>
        ) : context ? (
          <div className="doc-context-viewer" aria-label="Document context excerpt">
            {context.has_before ? <span className="text-muted">… </span> : null}
            <span>{before}</span>
            {highlighted ? (
              <mark ref={markRef} className="doc-context-highlight">
                {highlighted}
              </mark>
            ) : null}
            <span>{after}</span>
            {context.has_after ? <span className="text-muted"> …</span> : null}
          </div>
        ) : null}

        <div className="cluster">
          {canExpand ? (
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              onClick={() => setWindowSize((prev) => Math.min(MAX_WINDOW, prev + 1600))}
              id="doc-context-expand-btn"
            >
              <Expand size={15} aria-hidden="true" />
              Load more surrounding text
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DocumentContextModal({ projectId, target, onClose }: DocumentContextModalProps) {
  if (!target) return null;
  const key = `${target.documentId}:${target.charStart}:${target.charEnd}`;
  return (
    <DocumentContextModalBody key={key} projectId={projectId} target={target} onClose={onClose} />
  );
}
