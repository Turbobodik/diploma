import {
  ChevronLeft,
  ChevronRight,
  Focus,
  LayoutGrid,
  Maximize2,
  Network,
  Scale,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { memo, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';

import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import type { GraphNode, GraphResponse } from '../../models/api';
import { extractKeySentence, wrapSvgLines } from '../../utils/evidenceHighlight';
import {
  computeBalanceLayout,
  computeClustersLayout,
  computeConstellationLayout,
  labelColor,
  shortVerdictEdgeLabel,
  verdictBg,
  verdictColor,
  verdictText,
  type LayoutZone,
  type MapLayoutMode,
} from './evidenceMapLayouts';

export interface EvidenceMapProps {
  graph: GraphResponse | null;
  selectedClaimId: string | null;
  selectedPassageId?: string | null;
  onSelectClaim: (claimId: string) => void;
  onSelectPassage?: (passageId: string) => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const AUTO_FOCUS_THRESHOLD = 24;

function shortFilename(name: string, maxLen = 26): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

function zoneColors(tone: LayoutZone['tone']): { bg: string; border: string; title: string } {
  if (tone === 'contradiction') {
    return {
      bg: 'var(--nli-contradiction-bg)',
      border: 'var(--nli-contradiction)',
      title: 'var(--nli-contradiction)',
    };
  }
  if (tone === 'entailment') {
    return {
      bg: 'var(--nli-entailment-bg)',
      border: 'var(--nli-entailment)',
      title: 'var(--nli-entailment)',
    };
  }
  return {
    bg: 'var(--bg-subtle)',
    border: 'var(--border-strong)',
    title: 'var(--text-muted)',
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

  const [layoutOverride, setLayoutOverride] = useState<MapLayoutMode | null>(null);
  const layoutMode: MapLayoutMode = layoutOverride ?? (focusSelected ? 'balance' : 'clusters');

  const [showUnverified, setShowUnverified] = useState(false);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);

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

  const activeClaimNodeId = effectiveClaimId ? `claim:${effectiveClaimId}` : null;

  const unverifiedCount = useMemo(() => {
    if (!graph) return 0;
    return graph.nodes.filter((n) => n.type === 'claim' && n.has_evidence === false).length;
  }, [graph]);

  const effectiveShowUnverified =
    showUnverified || (allClaimIds.length > 0 && unverifiedCount === allClaimIds.length);

  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null;
    if (layoutMode === 'balance') {
      return computeBalanceLayout(graph, activeClaimNodeId);
    }
    if (layoutMode === 'constellation') {
      return computeConstellationLayout(graph, { showUnverified: effectiveShowUnverified });
    }
    return computeClustersLayout(graph, { showUnverified: effectiveShowUnverified });
  }, [graph, layoutMode, activeClaimNodeId, effectiveShowUnverified]);

  if (!graph || graph.nodes.length === 0 || !layout) {
    return (
      <EmptyState
        icon={<Network size={22} />}
        title="No evidence map yet"
        description="Upload at least one scientific document and run the analysis pipeline to generate the interactive claim–evidence graph."
      />
    );
  }

  const activeClaimIdx = effectiveClaimId ? allClaimIds.indexOf(effectiveClaimId) : -1;

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

  const handleSelectLayout = (next: MapLayoutMode) => {
    setLayoutOverride(next);
    setFocusOverride(next === 'balance');
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleStepClaim = (delta: -1 | 1) => {
    if (allClaimIds.length === 0) return;
    const nextIdx = (Math.max(0, activeClaimIdx) + delta + allClaimIds.length) % allClaimIds.length;
    onSelectClaim(allClaimIds[nextIdx]);
    setPan({ x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey || layoutMode === 'balance') {
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
    if ((event.target as HTMLElement).closest('.graph-node, .graph-edge-hit')) return;
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

  const handleNodeActivate = (node: GraphNode, claimNodeId?: string | null) => {
    if (node.type === 'claim') {
      onSelectClaim(node.id.replace(/^claim:/, ''));
      return;
    }
    if (node.type === 'passage') {
      const rawPassageId = node.id.replace(/^passage:/, '');
      if (claimNodeId) {
        onSelectClaim(claimNodeId.replace(/^claim:/, ''));
      } else {
        const linked = graph.edges.find(
          (e) =>
            (e.target === node.id && e.source.startsWith('claim:')) ||
            (e.source === node.id && e.target.startsWith('claim:')),
        );
        if (linked) {
          const cid = (linked.source.startsWith('claim:') ? linked.source : linked.target).replace(
            /^claim:/,
            '',
          );
          onSelectClaim(cid);
        }
      }
      onSelectPassage?.(rawPassageId);
    }
  };

  const isEdgeHighlighted = (item: (typeof layout.edges)[number]): boolean => {
    if (hoveredEdgeKey) return item.key === hoveredEdgeKey;
    if (hoveredCardKey) {
      return item.sourceKey === hoveredCardKey || item.targetKey === hoveredCardKey;
    }
    if (layoutMode === 'balance') return true;
    return Boolean(activeClaimNodeId && item.claimNodeId === activeClaimNodeId);
  };

  const isCardActive = (card: (typeof layout.cards)[number]): boolean => {
    if (hoveredCardKey) {
      if (card.key === hoveredCardKey) return true;
      return layout.edges.some(
        (e) =>
          (e.sourceKey === hoveredCardKey && e.targetKey === card.key) ||
          (e.targetKey === hoveredCardKey && e.sourceKey === card.key),
      );
    }
    if (hoveredEdgeKey) {
      const edge = layout.edges.find((e) => e.key === hoveredEdgeKey);
      return Boolean(edge && (edge.sourceKey === card.key || edge.targetKey === card.key));
    }
    if (layoutMode === 'balance') return true;
    if (!activeClaimNodeId) return true;
    if (card.node.id === activeClaimNodeId) return true;
    return layout.edges.some(
      (e) =>
        e.claimNodeId === activeClaimNodeId &&
        (e.sourceKey === card.key || e.targetKey === card.key),
    );
  };

  // Render non-highlighted edge pills first, highlighted pills strictly on top
  const evidenceEdges = layout.edges.filter(
    (item) => item.edge.kind === 'evidence' && Boolean(item.edge.label),
  );
  const dimPills = evidenceEdges.filter((item) => !isEdgeHighlighted(item));
  const brightPills = evidenceEdges.filter((item) => isEdgeHighlighted(item));

  return (
    <section className="graph-container" aria-label="Interactive evidence map">
      <div className="graph-toolbar">
        <div className="cluster">
          <strong>Evidence Map</strong>
          <span className="text-muted">
            {layoutMode === 'balance'
              ? `Claim ${activeClaimIdx + 1}/${allClaimIds.length}`
              : `${graph.nodes.length} nodes · ${graph.edges.length} edges`}
          </span>

          <div className="graph-mode-switcher" role="group" aria-label="Evidence map layout mode">
            <button
              type="button"
              className={`graph-mode-btn${layoutMode === 'clusters' ? ' is-active' : ''}`}
              aria-pressed={layoutMode === 'clusters'}
              onClick={() => handleSelectLayout('clusters')}
              id="graph-mode-clusters"
            >
              <LayoutGrid size={14} aria-hidden="true" />
              Острова
            </button>
            <button
              type="button"
              className={`graph-mode-btn${layoutMode === 'balance' ? ' is-active' : ''}`}
              aria-pressed={layoutMode === 'balance'}
              onClick={() => handleSelectLayout('balance')}
              id="graph-mode-balance"
            >
              <Scale size={14} aria-hidden="true" />
              Весы
            </button>
            <button
              type="button"
              className={`graph-mode-btn${layoutMode === 'constellation' ? ' is-active' : ''}`}
              aria-pressed={layoutMode === 'constellation'}
              onClick={() => handleSelectLayout('constellation')}
              id="graph-mode-constellation"
            >
              <Sparkles size={14} aria-hidden="true" />
              Созвездие
            </button>
          </div>
        </div>

        <div className="cluster">
          {layoutMode !== 'balance' &&
          unverifiedCount > 0 &&
          unverifiedCount < allClaimIds.length ? (
            <Button
              variant={showUnverified ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setShowUnverified((prev) => !prev)}
              aria-pressed={showUnverified}
              id="graph-toggle-unverified"
            >
              Без доказательств ({unverifiedCount})
            </Button>
          ) : null}

          {allClaimIds.length > 1 ? (
            <>
              <Button
                variant={focusSelected ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  const nextFocused = !focusSelected;
                  setFocusOverride(nextFocused);
                  setLayoutOverride(nextFocused ? 'balance' : 'clusters');
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
            {/* Layer 0: Semantic verdict backdrop zones */}
            {layout.zones.map((zone) => {
              const palette = zoneColors(zone.tone);
              return (
                <g key={zone.id}>
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.width}
                    height={zone.height}
                    rx={14}
                    fill={palette.bg}
                    fillOpacity={zone.tone === 'neutral' ? 0.55 : 0.35}
                    stroke={palette.border}
                    strokeOpacity={0.35}
                    strokeWidth={1.2}
                  />
                  <text
                    x={zone.x + 16}
                    y={zone.y + 22}
                    fill={palette.title}
                    fontSize="11"
                    fontWeight="800"
                    letterSpacing="0.04em"
                  >
                    {zone.title}
                  </text>
                  {zone.subtitle ? (
                    <text
                      x={zone.x + 16}
                      y={zone.y + 37}
                      fill="var(--text-muted)"
                      fontSize="10.5"
                      fontWeight="500"
                    >
                      {zone.subtitle}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Layer 1: Edge curves (hoverable & clickable) */}
            {layout.edges.map((item) => {
              const highlighted = isEdgeHighlighted(item);
              const isHovered = hoveredEdgeKey === item.key;
              return (
                <g
                  key={item.key}
                  className="graph-edge-hit"
                  onMouseEnter={() => setHoveredEdgeKey(item.key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                  onClick={() => {
                    if (item.claimNodeId) {
                      onSelectClaim(item.claimNodeId.replace(/^claim:/, ''));
                    }
                    if (item.passageNodeId) {
                      onSelectPassage?.(item.passageNodeId.replace(/^passage:/, ''));
                    }
                  }}
                >
                  {/* Invisible wider hit target for effortless edge hover */}
                  <path d={item.path} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={item.path}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={
                      item.edge.kind === 'evidence'
                        ? isHovered
                          ? 4
                          : highlighted
                            ? item.edge.label === 'neutral'
                              ? 2
                              : 3
                            : 1.3
                        : 1.4
                    }
                    strokeDasharray={item.edge.kind === 'extracted_from' ? '4 4' : undefined}
                    opacity={
                      highlighted
                        ? item.edge.kind === 'evidence'
                          ? item.edge.label === 'neutral'
                            ? 0.72
                            : 1
                          : 0.75
                        : 0.16
                    }
                  />
                </g>
              );
            })}

            {/* Layer 2: Dimmed edge pills (behind cards/highlighted pills so zero visual clash) */}
            {dimPills.map((item) => {
              const pillText = `${shortVerdictEdgeLabel(item.edge.label)}${
                typeof item.edge.score === 'number' ? ` ${Math.round(item.edge.score * 100)}%` : ''
              }`;
              const pillW = Math.max(96, pillText.length * 6.4 + 16);
              return (
                <g
                  key={`dim-pill:${item.key}`}
                  className="graph-edge-hit"
                  opacity={0.28}
                  onMouseEnter={() => setHoveredEdgeKey(item.key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                  onClick={() => {
                    if (item.claimNodeId) onSelectClaim(item.claimNodeId.replace(/^claim:/, ''));
                    if (item.passageNodeId) {
                      onSelectPassage?.(item.passageNodeId.replace(/^passage:/, ''));
                    }
                  }}
                >
                  <rect
                    x={item.pillX - pillW / 2}
                    y={item.pillY - 10}
                    width={pillW}
                    height={20}
                    rx={10}
                    fill="var(--bg-surface)"
                    stroke={item.color}
                    strokeWidth={1}
                  />
                  <text
                    x={item.pillX}
                    y={item.pillY + 3.5}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight="600"
                    fill={item.color}
                  >
                    {pillText}
                  </text>
                </g>
              );
            })}

            {/* Layer 3: Node cards */}
            {layout.cards.map((card) => {
              const { node, x, y, width, height } = card;
              const isSelectedClaim = node.type === 'claim' && node.id === activeClaimNodeId;
              const isSelectedPassage =
                node.type === 'passage' &&
                selectedPassageId !== null &&
                node.id === `passage:${selectedPassageId}`;
              const active = isCardActive(card);

              const accent =
                node.type === 'claim' && card.verdict
                  ? verdictColor(card.verdict)
                  : node.type === 'passage' && card.linkedEdge
                    ? labelColor(card.linkedEdge.label)
                    : null;

              const fill =
                isSelectedClaim || isSelectedPassage
                  ? 'var(--accent-primary-soft)'
                  : node.type === 'claim' && card.verdict && card.verdict !== 'unverified'
                    ? verdictBg(card.verdict)
                    : 'var(--bg-elevated)';

              const stroke =
                isSelectedClaim || isSelectedPassage
                  ? 'var(--accent-primary)'
                  : (accent ?? 'var(--border-strong)');

              let displayText = node.label;
              if (node.type === 'passage' && card.claimTextForSnippet) {
                displayText = extractKeySentence(
                  node.label,
                  card.claimTextForSnippet,
                  card.linkedEdge?.label,
                ).keySentence;
              }

              const charsPerLine = Math.max(16, Math.floor((width - 26) / 6.7));
              const maxLines = card.compact ? 2 : height >= 120 ? 4 : 3;
              const bodyLines = wrapSvgLines(displayText, charsPerLine, maxLines);

              const linkedClaimId =
                node.type === 'passage'
                  ? (layout.edges.find((e) => e.targetKey === card.key)?.claimNodeId ?? null)
                  : null;

              return (
                <g
                  key={card.key}
                  className="graph-node"
                  opacity={active ? 1 : 0.34}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.type}: ${node.label}`}
                  onMouseEnter={() => setHoveredCardKey(card.key)}
                  onMouseLeave={() => setHoveredCardKey(null)}
                  onClick={() => handleNodeActivate(node, linkedClaimId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleNodeActivate(node, linkedClaimId);
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
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelectedClaim || isSelectedPassage ? 2.4 : 1.3}
                  />

                  {accent && card.verdict !== 'unverified' ? (
                    <rect x={x + 1} y={y + 8} width={4} height={height - 16} rx={2} fill={accent} />
                  ) : null}

                  <text
                    x={x + 13}
                    y={y + 19}
                    fill={
                      node.type === 'claim' && card.verdict && card.verdict !== 'unverified'
                        ? verdictColor(card.verdict)
                        : node.type === 'passage' &&
                            card.linkedEdge &&
                            card.linkedEdge.label !== 'neutral'
                          ? labelColor(card.linkedEdge.label)
                          : 'var(--text-muted)'
                    }
                    fontSize="9.8"
                    fontWeight="800"
                  >
                    {node.type === 'claim' && card.verdict
                      ? `${verdictText(card.verdict)}${
                          typeof node.confidence === 'number'
                            ? ` · ${Math.round(node.confidence * 100)}%`
                            : ''
                        }`
                      : node.type === 'passage' && card.linkedEdge?.label
                        ? `${shortVerdictEdgeLabel(card.linkedEdge.label).toUpperCase()}${
                            typeof card.linkedEdge.score === 'number'
                              ? ` · ${Math.round(card.linkedEdge.score * 100)}%`
                              : ''
                          }${card.isCrossDoc ? ' · ДРУГОЙ ФАЙЛ' : ''}`
                        : 'ИСТОЧНИК'}
                  </text>

                  <text
                    x={x + 13}
                    y={y + 36}
                    fill="var(--text-primary)"
                    fontSize="11.2"
                    fontWeight="500"
                  >
                    {bodyLines.map((line, idx) => (
                      <tspan key={idx} x={x + 13} dy={idx === 0 ? 0 : 14.5}>
                        {line}
                      </tspan>
                    ))}
                  </text>

                  {!card.compact && card.sourceName ? (
                    <text
                      x={x + 13}
                      y={y + height - 9}
                      fill="var(--text-muted)"
                      fontSize="9.3"
                      fontWeight="500"
                    >
                      {shortFilename(card.sourceName, Math.max(18, charsPerLine - 2))}
                      {node.page_no ? ` · стр. ${node.page_no}` : ''}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* Layer 4: Highlighted edge verdict pills — brightly illuminated on selection/hover */}
            {brightPills.map((item) => {
              const pillText = `${shortVerdictEdgeLabel(item.edge.label)}${
                typeof item.edge.score === 'number' ? ` ${Math.round(item.edge.score * 100)}%` : ''
              }`;
              const isHovered = hoveredEdgeKey === item.key;
              const pillW = Math.max(108, pillText.length * 6.8 + 20);
              const isNeutral = item.edge.label === 'neutral';

              return (
                <g
                  key={`bright-pill:${item.key}`}
                  className="graph-edge-hit graph-edge-pill-active"
                  onMouseEnter={() => setHoveredEdgeKey(item.key)}
                  onMouseLeave={() => setHoveredEdgeKey(null)}
                  onClick={() => {
                    if (item.claimNodeId) onSelectClaim(item.claimNodeId.replace(/^claim:/, ''));
                    if (item.passageNodeId) {
                      onSelectPassage?.(item.passageNodeId.replace(/^passage:/, ''));
                    }
                  }}
                >
                  <rect
                    x={item.pillX - pillW / 2}
                    y={item.pillY - 11.5}
                    width={pillW}
                    height={23}
                    rx={11.5}
                    fill={isNeutral ? 'var(--bg-surface)' : item.color}
                    stroke={isHovered ? 'var(--text-primary)' : item.color}
                    strokeWidth={isHovered ? 2 : 1.5}
                  />
                  <text
                    x={item.pillX}
                    y={item.pillY + 4}
                    textAnchor="middle"
                    fontSize="10.2"
                    fontWeight="800"
                    fill={isNeutral ? 'var(--text-primary)' : 'var(--text-inverse)'}
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
          Доказано / Подтверждает
        </span>
        <span className="legend-item">
          <span className="legend-swatch contradiction" aria-hidden="true" />
          Опровергнуто / Противоречит
        </span>
        <span className="legend-item">
          <span className="legend-swatch neutral" aria-hidden="true" />
          Нейтрально
        </span>
        <span className="text-muted">
          Наведите на ребро или карточку для подсветки · Переключайте виды: Острова / Весы /
          Созвездие
        </span>
      </div>
    </section>
  );
});
