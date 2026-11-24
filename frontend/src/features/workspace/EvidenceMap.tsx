import { Maximize2, Network, ZoomIn, ZoomOut } from 'lucide-react';
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
  const colX = { document: 32, claim: 320, passage: 650 };
  const colW = { document: 210, claim: 255, passage: 245 };

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
        y: 36 + idx * (height + gap),
        width,
        height,
      });
    });
  };

  placeColumn(docs, colX.document, colW.document, 54, 24);
  placeColumn(claims, colX.claim, colW.claim, 64, 22);
  placeColumn(passages, colX.passage, colW.passage, 58, 18);

  const maxY = positioned.reduce((acc, item) => Math.max(acc, item.y + item.height), 320);
  const byId = new Map(positioned.map((item) => [item.node.id, item]));

  return {
    positioned,
    byId,
    canvasWidth: 940,
    canvasHeight: Math.max(360, maxY + 40),
  };
}

export const EvidenceMap = memo(function EvidenceMap({
  graph,
  selectedClaimId,
  onSelectClaim,
}: EvidenceMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const layout = useMemo(() => (graph ? computeLayout(graph) : null), [graph]);

  if (!graph || graph.nodes.length === 0 || !layout) {
    return (
      <EmptyState
        icon={<Network size={22} />}
        title="No evidence map yet"
        description="Upload at least one scientific document and run the analysis pipeline to generate the interactive claim–evidence graph."
      />
    );
  }

  const handleZoomIn = () => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.12 : -0.12;
    setZoom((z) => Math.min(2.2, Math.max(0.5, Number((z + delta).toFixed(2)))));
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
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </span>
        </div>
        <div className="cluster">
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
        className="graph-viewport"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <svg
          className="graph-svg"
          viewBox={`0 0 ${layout.canvasWidth} ${layout.canvasHeight}`}
          role="img"
          aria-label="Graph connecting source documents, extracted claims, and NLI-verified passages"
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <text x={32} y={20} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              DOCUMENTS
            </text>
            <text x={320} y={20} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              EXTRACTED CLAIMS
            </text>
            <text x={650} y={20} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              EVIDENCE PASSAGES
            </text>

            {graph.edges.map((edge) => {
              const src = layout.byId.get(edge.source);
              const tgt = layout.byId.get(edge.target);
              if (!src || !tgt) return null;

              const x1 = src.x + src.width;
              const y1 = src.y + src.height / 2;
              const x2 = tgt.x;
              const y2 = tgt.y + tgt.height / 2;
              const midX = (x1 + x2) / 2;
              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              const color = edgeColor(edge);

              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={edge.kind === 'evidence' ? 2.2 : 1.2}
                    strokeDasharray={edge.kind === 'extracted_from' ? '4 4' : undefined}
                    opacity={edge.kind === 'evidence' ? 0.9 : 0.55}
                  />
                  {edge.kind === 'evidence' && edge.label ? (
                    <text
                      x={midX}
                      y={(y1 + y2) / 2 - 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={color}
                    >
                      {edge.label}
                      {typeof edge.score === 'number' ? ` ${Math.round(edge.score * 100)}%` : ''}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {layout.positioned.map(({ node, x, y, width, height }) => {
              const isSelected = node.type === 'claim' && node.id === `claim:${selectedClaimId}`;
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
                    stroke={nodeStroke(node, selectedClaimId)}
                    strokeWidth={isSelected ? 2.5 : 1.2}
                  />
                  <text
                    x={x + 12}
                    y={y + 20}
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
                    y={y + 40}
                    fill="var(--text-primary)"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {truncate(node.label, node.type === 'document' ? 24 : 30)}
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
      </div>
    </section>
  );
});
