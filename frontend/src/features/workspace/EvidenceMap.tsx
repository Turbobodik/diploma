import {
  ChevronLeft,
  ChevronRight,
  Focus,
  Maximize2,
  Network,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { memo, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import type { GraphEdge, GraphNode, GraphResponse, NliLabel } from '../../models/api';

export interface EvidenceMapProps {
  graph: GraphResponse | null;
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
}

interface PositionedNode {
  node: GraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const AUTO_FOCUS_THRESHOLD = 24;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function edgeColor(edge: GraphEdge): string {
  if (edge.kind === 'extracted_from') return 'var(--border-strong)';
  const label: NliLabel = edge.label ?? 'neutral';
  if (label === 'entailment') return 'var(--nli-entailment)';
  if (label === 'contradiction') return 'var(--nli-contradiction)';
  return 'var(--nli-neutral)';
}

function nodeStroke(node: GraphNode, selectedClaimId: string | null): string {
  if (node.type === 'claim' && node.id === `claim:${selectedClaimId}`) {
    return 'var(--accent-primary)';
  }
  if (node.type === 'claim' && node.has_evidence === false) {
    return 'var(--status-warning)';
  }
  return 'var(--border-strong)';
}

function filterFocusedSubgraph(
  graph: GraphResponse,
  selectedClaimId: string | null,
): GraphResponse {
  const claims = graph.nodes.filter((n) => n.type === 'claim');
  const activeClaimNodeId =
    selectedClaimId && claims.some((c) => c.id === `claim:${selectedClaimId}`)
      ? `claim:${selectedClaimId}`
      : claims[0]?.id;

  if (!activeClaimNodeId) {
    return graph;
  }

  const keepEdges = graph.edges.filter(
    (e) => e.source === activeClaimNodeId || e.target === activeClaimNodeId,
  );
  const keepNodeIds = new Set<string>([activeClaimNodeId]);
  for (const edge of keepEdges) {
    keepNodeIds.add(edge.source);
    keepNodeIds.add(edge.target);
  }

  return {
    project_id: graph.project_id,
    nodes: graph.nodes.filter((n) => keepNodeIds.has(n.id)),
    edges: keepEdges,
  };
}

function computeLayout(graph: GraphResponse): {
  positioned: PositionedNode[];
  byId: Map<string, PositionedNode>;
  canvasWidth: number;
  canvasHeight: number;
} {
  const docs = graph.nodes.filter((n) => n.type === 'document');
  const claims = graph.nodes.filter((n) => n.type === 'claim');
  const passages = graph.nodes.filter((n) => n.type === 'passage');

  const positioned: PositionedNode[] = [];
  const colX = { document: 16, claim: 216, passage: 468 };
  const colW = { document: 170, claim: 204, passage: 214 };

  const placeColumn = (
    nodes: GraphNode[],
    x: number,
    width: number,
    height: number,
    gap: number,
  ) => {
    nodes.forEach((node, idx) => {
      positioned.push({
        node,
        x,
        y: 44 + idx * (height + gap),
        width,
        height,
      });
    });
  };

  placeColumn(docs, colX.document, colW.document, 58, 20);
  placeColumn(claims, colX.claim, colW.claim, 66, 18);
  placeColumn(passages, colX.passage, colW.passage, 62, 16);

  const maxY = positioned.reduce((acc, item) => Math.max(acc, item.y + item.height), 340);
  const byId = new Map(positioned.map((item) => [item.node.id, item]));

  return {
    positioned,
    byId,
    canvasWidth: 700,
    canvasHeight: Math.max(400, maxY + 44),
  };
}

export const EvidenceMap = memo(function EvidenceMap({
  graph,
  selectedClaimId,
  onSelectClaim,
}: EvidenceMapProps) {
  const isLargeGraph = (graph?.nodes.length ?? 0) > AUTO_FOCUS_THRESHOLD;
  const [focusOverride, setFocusOverride] = useState<boolean | null>(null);
  const focusSelected = focusOverride ?? isLargeGraph;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const allClaimIds = useMemo(
    () =>
      graph
        ? graph.nodes.filter((n) => n.type === 'claim').map((n) => n.id.replace(/^claim:/, ''))
        : [],
    [graph],
  );

  const effectiveClaimId =
    selectedClaimId && allClaimIds.includes(selectedClaimId)
      ? selectedClaimId
      : (allClaimIds[0] ?? null);

  const visibleGraph = useMemo(() => {
    if (!graph) return null;
    if (focusSelected && effectiveClaimId) {
      return filterFocusedSubgraph(graph, effectiveClaimId);
    }
    return graph;
  }, [graph, focusSelected, effectiveClaimId]);

  const layout = useMemo(() => (visibleGraph ? computeLayout(visibleGraph) : null), [visibleGraph]);

  if (!graph || graph.nodes.length === 0 || !visibleGraph || !layout) {
    return (
      <EmptyState
        icon={<Network size={22} />}
        title="No evidence map yet"
        description="Upload at least one scientific document and run the analysis pipeline to generate the interactive claim–evidence graph."
      />
    );
  }

  const activeClaimNodeId = effectiveClaimId ? `claim:${effectiveClaimId}` : null;
  const activeClaimIdx = effectiveClaimId ? allClaimIds.indexOf(effectiveClaimId) : -1;
  const showAllEdgeLabels = visibleGraph.edges.filter((e) => e.kind === 'evidence').length <= 12;

  const clampZoom = (next: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));

  const handleZoomIn = () => setZoom((z) => clampZoom(z + 0.2));
  const handleZoomOut = () => setZoom((z) => clampZoom(z - 0.2));

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleFitView = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      handleReset();
      return;
    }
    const scaleX = (rect.width - 24) / layout.canvasWidth;
    const scaleY = (rect.height - 24) / layout.canvasHeight;
    const fitted = clampZoom(Math.min(scaleX, scaleY, 1.2));
    const offsetX = Math.max(12, (rect.width - layout.canvasWidth * fitted) / 2);
    setZoom(fitted);
    setPan({ x: offsetX, y: 12 });
  };

  const handleStepClaim = (delta: -1 | 1) => {
    if (allClaimIds.length === 0) return;
    const nextIdx = (Math.max(0, activeClaimIdx) + delta + allClaimIds.length) % allClaimIds.length;
    onSelectClaim(allClaimIds[nextIdx]);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || focusSelected) {
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      setZoom((z) => clampZoom(z + delta));
    } else {
      // Natural vertical & horizontal panning on large graphs; hold Ctrl/Cmd to zoom or use +/- buttons
      setPan((prev) => ({
        x: prev.x - event.deltaX,
        y: Math.min(40, Math.max(-(layout.canvasHeight * zoom - 220), prev.y - event.deltaY)),
      }));
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.graph-node')) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    setPan({ x: dragOrigin.current.panX + dx, y: dragOrigin.current.panY + dy });
  };

  const handlePointerUp = () => {
    dragOrigin.current = null;
  };

  const handleNodeActivate = (node: GraphNode) => {
    if (node.type === 'claim') {
      onSelectClaim(node.id.replace(/^claim:/, ''));
      return;
    }
    if (node.type === 'passage') {
      const linked = graph.edges.find((e) => e.target === node.id && e.source.startsWith('claim:'));
      if (linked) {
        onSelectClaim(linked.source.replace(/^claim:/, ''));
      }
    }
  };

  return (
    <section className="graph-container" aria-label="Interactive evidence map">
      <div className="graph-toolbar">
        <div className="cluster">
          <strong>Evidence Map</strong>
          <span className="text-muted">
            {focusSelected
              ? `Claim ${activeClaimIdx + 1}/${allClaimIds.length} · ${visibleGraph.nodes.length} of ${graph.nodes.length} nodes`
              : `${graph.nodes.length} nodes · ${graph.edges.length} edges`}
          </span>
        </div>

        <div className="cluster">
          {allClaimIds.length > 1 ? (
            <>
              <Button
                variant={focusSelected ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setFocusOverride(!focusSelected);
                  setPan({ x: 0, y: 0 });
                  setZoom(1);
                }}
                id="graph-focus-toggle"
                aria-pressed={focusSelected}
              >
                <Focus size={15} aria-hidden="true" />
                {focusSelected ? 'Focused' : 'Focus claim'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleStepClaim(-1)}
                aria-label="Previous claim"
                id="graph-prev-claim"
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleStepClaim(1)}
                aria-label="Next claim"
                id="graph-next-claim"
              >
                <ChevronRight size={15} aria-hidden="true" />
              </Button>
            </>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleZoomOut}
            aria-label="Zoom out evidence map"
            id="graph-zoom-out"
          >
            <ZoomOut size={15} aria-hidden="true" />
          </Button>
          <span className="mono text-muted" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleZoomIn}
            aria-label="Zoom in evidence map"
            id="graph-zoom-in"
          >
            <ZoomIn size={15} aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFitView}
            aria-label="Fit evidence map to viewport"
            id="graph-fit-view"
          >
            Fit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            aria-label="Reset evidence map zoom and pan"
            id="graph-zoom-reset"
          >
            <Maximize2 size={15} aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="graph-viewport"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <svg
          className="graph-svg"
          role="img"
          aria-label="Graph connecting source documents, extracted claims, and NLI-verified passages"
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <text x={16} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              DOCUMENTS
            </text>
            <text x={216} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              EXTRACTED CLAIMS
            </text>
            <text x={468} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              EVIDENCE PASSAGES
            </text>

            {visibleGraph.edges.map((edge) => {
              const src = layout.byId.get(edge.source);
              const tgt = layout.byId.get(edge.target);
              if (!src || !tgt) return null;

              const isHighlighted =
                !activeClaimNodeId ||
                edge.source === activeClaimNodeId ||
                edge.target === activeClaimNodeId;
              const x1 = src.x + src.width;
              const y1 = src.y + src.height / 2;
              const x2 = tgt.x;
              const y2 = tgt.y + tgt.height / 2;
              const midX = (x1 + x2) / 2;
              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              const color = edgeColor(edge);
              const showLabel =
                edge.kind === 'evidence' && edge.label && (showAllEdgeLabels || isHighlighted);

              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={edge.kind === 'evidence' ? (isHighlighted ? 2.6 : 1.2) : 1.2}
                    strokeDasharray={edge.kind === 'extracted_from' ? '4 4' : undefined}
                    opacity={isHighlighted ? (edge.kind === 'evidence' ? 0.95 : 0.7) : 0.14}
                  />
                  {showLabel ? (
                    <g>
                      <rect
                        x={midX - 52}
                        y={(y1 + y2) / 2 - 14}
                        width={104}
                        height={18}
                        rx={9}
                        fill="var(--bg-surface)"
                        stroke={color}
                        strokeWidth={1}
                        opacity={0.95}
                      />
                      <text
                        x={midX}
                        y={(y1 + y2) / 2 - 2}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={color}
                      >
                        {edge.label}
                        {typeof edge.score === 'number' ? ` ${Math.round(edge.score * 100)}%` : ''}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {layout.positioned.map(({ node, x, y, width, height }) => {
              const isSelected = node.type === 'claim' && node.id === activeClaimNodeId;
              return (
                <g
                  key={node.id}
                  className="graph-node"
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.type}: ${node.label}`}
                  onClick={() => handleNodeActivate(node)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleNodeActivate(node);
                    }
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={10}
                    fill={isSelected ? 'var(--accent-primary-soft)' : 'var(--bg-elevated)'}
                    stroke={nodeStroke(node, effectiveClaimId)}
                    strokeWidth={isSelected ? 2.5 : 1.2}
                  />
                  <text
                    x={x + 12}
                    y={y + 22}
                    fill="var(--text-muted)"
                    fontSize="10"
                    fontWeight="700"
                  >
                    {node.type.toUpperCase()}
                    {node.type === 'claim' && typeof node.confidence === 'number'
                      ? ` · ${Math.round(node.confidence * 100)}%`
                      : ''}
                    {node.type === 'claim' && node.has_evidence === false ? ' · NO EVIDENCE' : ''}
                  </text>
                  <text
                    x={x + 12}
                    y={y + 44}
                    fill="var(--text-primary)"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {truncate(node.label, node.type === 'document' ? 20 : 25)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="graph-legend">
        <span className="legend-item">
          <span className="legend-swatch entailment" aria-hidden="true" />
          Entailment (supports)
        </span>
        <span className="legend-item">
          <span className="legend-swatch contradiction" aria-hidden="true" />
          Contradiction (refutes)
        </span>
        <span className="legend-item">
          <span className="legend-swatch neutral" aria-hidden="true" />
          Neutral
        </span>
        <span className="text-muted">Drag to pan · Use +/- (25%–400%) or switch Focused / All</span>
      </div>
    </section>
  );
});
