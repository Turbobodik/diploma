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
import { extractKeySentence, labelRank, wrapSvgLines } from '../../utils/evidenceHighlight';

export interface EvidenceMapProps {
  graph: GraphResponse | null;
  selectedClaimId: string | null;
  selectedPassageId?: string | null;
  onSelectClaim: (claimId: string) => void;
  onSelectPassage?: (passageId: string) => void;
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

function edgeColor(edge: GraphEdge): string {
  if (edge.kind === 'extracted_from') return 'var(--border-strong)';
  const label: NliLabel = edge.label ?? 'neutral';
  if (label === 'entailment') return 'var(--nli-entailment)';
  if (label === 'contradiction') return 'var(--nli-contradiction)';
  return 'var(--nli-neutral)';
}

function labelColor(label: NliLabel | null | undefined): string {
  if (label === 'entailment') return 'var(--nli-entailment)';
  if (label === 'contradiction') return 'var(--nli-contradiction)';
  return 'var(--nli-neutral)';
}

function shortLabel(label: NliLabel | null | undefined): string {
  if (label === 'entailment') return 'supports';
  if (label === 'contradiction') return 'refutes';
  return 'neutral';
}

function shortFilename(name: string, maxLen = 22): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

function cubicBezierPoint(
  x1: number,
  y1: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const x = mt ** 3 * x1 + 3 * mt ** 2 * t * cx1 + 3 * mt * t ** 2 * cx2 + t ** 3 * x2;
  const y = mt ** 3 * y1 + 3 * mt ** 2 * t * cy1 + 3 * mt * t ** 2 * cy2 + t ** 3 * y2;
  return { x, y };
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

  // Sort evidence passages by verdict importance (contradiction -> entailment -> neutral), then score desc
  const edgeByPassage = new Map<string, GraphEdge>();
  for (const edge of keepEdges) {
    if (edge.kind !== 'evidence') continue;
    const passageNodeId = edge.source.startsWith('passage:') ? edge.source : edge.target;
    edgeByPassage.set(passageNodeId, edge);
  }

  const keptNodes = graph.nodes.filter((n) => keepNodeIds.has(n.id));
  const docs = keptNodes.filter((n) => n.type === 'document');
  const claimNodes = keptNodes.filter((n) => n.type === 'claim');
  const passages = keptNodes
    .filter((n) => n.type === 'passage')
    .sort((a, b) => {
      const ea = edgeByPassage.get(a.id);
      const eb = edgeByPassage.get(b.id);
      const rankDiff = labelRank(ea?.label) - labelRank(eb?.label);
      if (rankDiff !== 0) return rankDiff;
      return (eb?.score ?? 0) - (ea?.score ?? 0);
    });

  return {
    project_id: graph.project_id,
    nodes: [...docs, ...claimNodes, ...passages],
    edges: keepEdges,
  };
}

function computeLayout(
  graph: GraphResponse,
  focused: boolean,
): {
  positioned: PositionedNode[];
  byId: Map<string, PositionedNode>;
  canvasWidth: number;
  canvasHeight: number;
} {
  const docs = graph.nodes.filter((n) => n.type === 'document');
  const claims = graph.nodes.filter((n) => n.type === 'claim');
  const passages = graph.nodes.filter((n) => n.type === 'passage');

  const positioned: PositionedNode[] = [];
  const colX = { document: 14, claim: 174, passage: 516 };
  const colW = { document: 136, claim: 224, passage: 244 };

  const docH = focused ? 76 : 64;
  const claimH = focused ? 132 : 84;
  const passageH = focused ? 104 : 82;
  const docGap = 18;
  const claimGap = 16;
  const passageGap = 14;

  const stackHeight = (count: number, h: number, gap: number) =>
    count > 0 ? count * h + Math.max(0, count - 1) * gap : 0;

  const passagesTotalH = stackHeight(passages.length, passageH, passageGap);
  const claimsTotalH = stackHeight(claims.length, claimH, claimGap);
  const docsTotalH = stackHeight(docs.length, docH, docGap);
  const maxColH = Math.max(passagesTotalH, claimsTotalH, docsTotalH, 260);

  const placeColumn = (
    nodes: GraphNode[],
    x: number,
    width: number,
    height: number,
    gap: number,
    centerVertically: boolean,
  ) => {
    const colH = stackHeight(nodes.length, height, gap);
    const startY = centerVertically ? 46 + Math.max(0, Math.round((maxColH - colH) / 2)) : 46;
    nodes.forEach((node, idx) => {
      positioned.push({
        node,
        x,
        y: startY + idx * (height + gap),
        width,
        height,
      });
    });
  };

  placeColumn(docs, colX.document, colW.document, docH, docGap, focused);
  placeColumn(claims, colX.claim, colW.claim, claimH, claimGap, focused);
  placeColumn(passages, colX.passage, colW.passage, passageH, passageGap, false);

  const maxY = positioned.reduce((acc, item) => Math.max(acc, item.y + item.height), 340);
  const byId = new Map(positioned.map((item) => [item.node.id, item]));

  return {
    positioned,
    byId,
    canvasWidth: 774,
    canvasHeight: Math.max(400, maxY + 36),
  };
}

export const EvidenceMap = memo(function EvidenceMap({
  graph,
  selectedClaimId,
  selectedPassageId = null,
  onSelectClaim,
  onSelectPassage,
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

  const docNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!graph) return map;
    for (const n of graph.nodes) {
      if (n.type === 'document' && n.document_id) {
        map.set(n.document_id, n.label);
      }
    }
    return map;
  }, [graph]);

  const visibleGraph = useMemo(() => {
    if (!graph) return null;
    if (focusSelected && effectiveClaimId) {
      return filterFocusedSubgraph(graph, effectiveClaimId);
    }
    return graph;
  }, [graph, focusSelected, effectiveClaimId]);

  const layout = useMemo(
    () => (visibleGraph ? computeLayout(visibleGraph, focusSelected) : null),
    [visibleGraph, focusSelected],
  );

  const activeClaimNodeId = effectiveClaimId ? `claim:${effectiveClaimId}` : null;
  const activeClaimNode = useMemo(
    () => (graph && activeClaimNodeId ? graph.nodes.find((n) => n.id === activeClaimNodeId) : null),
    [graph, activeClaimNodeId],
  );

  const activePassageEdgeMap = useMemo(() => {
    const map = new Map<string, GraphEdge>();
    if (!visibleGraph || !activeClaimNodeId) return map;
    for (const e of visibleGraph.edges) {
      if (e.kind !== 'evidence') continue;
      if (e.source === activeClaimNodeId || e.target === activeClaimNodeId) {
        const pId = e.source.startsWith('passage:') ? e.source : e.target;
        map.set(pId, e);
      }
    }
    return map;
  }, [visibleGraph, activeClaimNodeId]);

  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    if (!visibleGraph || !activeClaimNodeId) return set;
    set.add(activeClaimNodeId);
    for (const e of visibleGraph.edges) {
      if (e.source === activeClaimNodeId || e.target === activeClaimNodeId) {
        set.add(e.source);
        set.add(e.target);
      }
    }
    return set;
  }, [visibleGraph, activeClaimNodeId]);

  const activeVerdictSummary = useMemo(() => {
    let refutes = 0;
    let supports = 0;
    let neutral = 0;
    for (const edge of activePassageEdgeMap.values()) {
      if (edge.label === 'contradiction') refutes += 1;
      else if (edge.label === 'entailment') supports += 1;
      else neutral += 1;
    }
    return { refutes, supports, neutral };
  }, [activePassageEdgeMap]);

  if (!graph || graph.nodes.length === 0 || !visibleGraph || !layout) {
    return (
      <EmptyState
        icon={<Network size={22} />}
        title="No evidence map yet"
        description="Upload at least one scientific document and run the analysis pipeline to generate the interactive claim–evidence graph."
      />
    );
  }

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
    const fitted = clampZoom(Math.min(scaleX, scaleY, 1.15));
    const offsetX = Math.max(12, (rect.width - layout.canvasWidth * fitted) / 2);
    setZoom(fitted);
    setPan({ x: offsetX, y: 10 });
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
      const rawPassageId = node.id.replace(/^passage:/, '');
      const linkedToActive = visibleGraph.edges.some(
        (e) =>
          (e.source === node.id && e.target === activeClaimNodeId) ||
          (e.target === node.id && e.source === activeClaimNodeId),
      );
      if (!linkedToActive) {
        const linked = graph.edges.find(
          (e) =>
            (e.target === node.id && e.source.startsWith('claim:')) ||
            (e.source === node.id && e.target.startsWith('claim:')),
        );
        if (linked) {
          const claimId = (
            linked.source.startsWith('claim:') ? linked.source : linked.target
          ).replace(/^claim:/, '');
          onSelectClaim(claimId);
        }
      }
      onSelectPassage?.(rawPassageId);
    }
  };

  // Precompute normalized left->right edge geometries and label positions
  const renderedEdges = visibleGraph.edges
    .map((edge) => {
      const src = layout.byId.get(edge.source);
      const tgt = layout.byId.get(edge.target);
      if (!src || !tgt) return null;

      // Always connect left node's right edge -> right node's left edge
      const [left, right] = src.x <= tgt.x ? [src, tgt] : [tgt, src];
      const x1 = left.x + left.width;
      const y1 = left.y + left.height / 2;
      const x2 = right.x;
      const y2 = right.y + right.height / 2;
      const midX = (x1 + x2) / 2;
      const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

      const isHighlighted =
        !activeClaimNodeId ||
        edge.source === activeClaimNodeId ||
        edge.target === activeClaimNodeId;
      const color = edgeColor(edge);
      const showLabel =
        edge.kind === 'evidence' && Boolean(edge.label) && (showAllEdgeLabels || isHighlighted);

      // Position verdict pill near t=0.68 in the open gutter so fanned-out edges never collide
      const pillPoint = cubicBezierPoint(
        x1,
        y1,
        midX,
        y1,
        midX,
        y2,
        x2,
        y2,
        focusSelected ? 0.68 : 0.52,
      );

      return { edge, path, color, isHighlighted, showLabel, pillX: midX, pillY: pillPoint.y };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

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
          {focusSelected &&
          (activeVerdictSummary.refutes > 0 || activeVerdictSummary.supports > 0) ? (
            <span className="graph-summary-pills">
              {activeVerdictSummary.refutes > 0 ? (
                <span className="graph-pill graph-pill-contradiction">
                  {activeVerdictSummary.refutes} refutes
                </span>
              ) : null}
              {activeVerdictSummary.supports > 0 ? (
                <span className="graph-pill graph-pill-entailment">
                  {activeVerdictSummary.supports} supports
                </span>
              ) : null}
            </span>
          ) : null}
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
            <text x={14} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              SOURCE DOC
            </text>
            <text x={188} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              {focusSelected ? 'SELECTED CLAIM' : 'EXTRACTED CLAIMS'}
            </text>
            <text x={544} y={24} fill="var(--text-muted)" fontSize="11" fontWeight="700">
              EVIDENCE PASSAGES (BY PRIORITY)
            </text>

            {/* Layer 1: Edge paths */}
            {renderedEdges.map(({ edge, path, color, isHighlighted }) => (
              <path
                key={edge.id}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={
                  edge.kind === 'evidence'
                    ? isHighlighted
                      ? edge.label === 'neutral'
                        ? 1.8
                        : 2.8
                      : 1.1
                    : 1.4
                }
                strokeDasharray={edge.kind === 'extracted_from' ? '4 4' : undefined}
                opacity={
                  isHighlighted
                    ? edge.kind === 'evidence'
                      ? edge.label === 'neutral'
                        ? 0.55
                        : 0.95
                      : 0.75
                    : 0.12
                }
              />
            ))}

            {/* Layer 2: Node cards */}
            {layout.positioned.map(({ node, x, y, width, height }) => {
              const isSelectedClaim = node.type === 'claim' && node.id === activeClaimNodeId;
              const isSelectedPassage =
                node.type === 'passage' &&
                selectedPassageId !== null &&
                node.id === `passage:${selectedPassageId}`;
              const isConnected =
                focusSelected || !activeClaimNodeId || connectedNodeIds.has(node.id);
              const linkedEdge =
                node.type === 'passage' ? activePassageEdgeMap.get(node.id) : undefined;
              const accentColor =
                node.type === 'passage' && linkedEdge ? labelColor(linkedEdge.label) : null;

              const isCrossDoc =
                node.type === 'passage' &&
                Boolean(node.document_id && activeClaimNode?.document_id) &&
                node.document_id !== activeClaimNode?.document_id;

              const passageSourceName = node.document_id
                ? docNameById.get(node.document_id)
                : undefined;

              let displayText = node.label;
              if (node.type === 'passage' && activeClaimNode) {
                displayText = extractKeySentence(
                  node.label,
                  activeClaimNode.label,
                  linkedEdge?.label,
                ).keySentence;
              }

              const bodyLines =
                node.type === 'document'
                  ? wrapSvgLines(displayText, 16, 2)
                  : node.type === 'claim'
                    ? wrapSvgLines(displayText, 28, focusSelected ? 4 : 2)
                    : wrapSvgLines(displayText, 31, focusSelected ? 3 : 2);

              const strokeColor =
                isSelectedClaim || isSelectedPassage
                  ? 'var(--accent-primary)'
                  : node.type === 'claim' && node.has_evidence === false
                    ? 'var(--status-warning)'
                    : accentColor && linkedEdge?.label !== 'neutral'
                      ? accentColor
                      : 'var(--border-strong)';

              return (
                <g
                  key={node.id}
                  className="graph-node"
                  opacity={isConnected ? 1 : 0.32}
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
                  <title>{node.label}</title>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={10}
                    fill={
                      isSelectedClaim || isSelectedPassage
                        ? 'var(--accent-primary-soft)'
                        : 'var(--bg-elevated)'
                    }
                    stroke={strokeColor}
                    strokeWidth={isSelectedClaim || isSelectedPassage ? 2.4 : 1.3}
                  />

                  {accentColor ? (
                    <rect
                      x={x + 1}
                      y={y + 8}
                      width={4}
                      height={height - 16}
                      rx={2}
                      fill={accentColor}
                    />
                  ) : null}

                  <text
                    x={x + 13}
                    y={y + 20}
                    fill={
                      accentColor && linkedEdge?.label !== 'neutral'
                        ? accentColor
                        : 'var(--text-muted)'
                    }
                    fontSize="10"
                    fontWeight="700"
                  >
                    {node.type === 'passage' && linkedEdge?.label
                      ? `${shortLabel(linkedEdge.label).toUpperCase()}${
                          typeof linkedEdge.score === 'number'
                            ? ` · ${Math.round(linkedEdge.score * 100)}%`
                            : ''
                        }${isCrossDoc ? ' · ДРУГОЙ ФАЙЛ' : ''}`
                      : `${node.type.toUpperCase()}${
                          node.type === 'claim' && typeof node.confidence === 'number'
                            ? ` · ${Math.round(node.confidence * 100)}%`
                            : ''
                        }${node.type === 'claim' && node.has_evidence === false ? ' · NO EVIDENCE' : ''}`}
                  </text>

                  <text
                    x={x + 13}
                    y={y + 38}
                    fill="var(--text-primary)"
                    fontSize="11.5"
                    fontWeight="500"
                  >
                    {bodyLines.map((line, idx) => (
                      <tspan key={idx} x={x + 13} dy={idx === 0 ? 0 : 15}>
                        {line}
                      </tspan>
                    ))}
                  </text>

                  {focusSelected && node.type === 'passage' && passageSourceName ? (
                    <text
                      x={x + 13}
                      y={y + height - 10}
                      fill="var(--text-muted)"
                      fontSize="9.5"
                      fontWeight="500"
                    >
                      {shortFilename(passageSourceName, 32)}
                      {node.page_no ? ` · p.${node.page_no}` : ''}
                    </text>
                  ) : null}

                  {focusSelected && node.type === 'claim' && node.document_id ? (
                    <text
                      x={x + 13}
                      y={y + height - 10}
                      fill="var(--text-muted)"
                      fontSize="9.5"
                      fontWeight="500"
                    >
                      {shortFilename(docNameById.get(node.document_id) ?? '', 28)}
                      {node.page_no ? ` · p.${node.page_no}` : ''}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Layer 3: Edge verdict pills rendered cleanly on top in the gutter */}
            {renderedEdges
              .filter((item) => item.showLabel)
              .map(({ edge, color, pillX, pillY }) => {
                const pillText = `${shortLabel(edge.label)}${
                  typeof edge.score === 'number' ? ` ${Math.round(edge.score * 100)}%` : ''
                }`;
                return (
                  <g key={`pill:${edge.id}`} pointerEvents="none">
                    <rect
                      x={pillX - 50}
                      y={pillY - 10}
                      width={100}
                      height={20}
                      rx={10}
                      fill="var(--bg-surface)"
                      stroke={color}
                      strokeWidth={1.2}
                    />
                    <text
                      x={pillX}
                      y={pillY + 3.5}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill={color}
                    >
                      {pillText}
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
        <span className="text-muted">
          Click a passage to jump to it · Hover any card for full text · Use &lt;/&gt; to step
          claims
        </span>
      </div>
    </section>
  );
});
