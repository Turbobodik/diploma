import type { GraphEdge, GraphNode, GraphResponse, NliLabel } from '../../models/api';
import { labelRank } from '../../utils/evidenceHighlight';

export type MapLayoutMode = 'clusters' | 'balance' | 'constellation';
export type ClaimVerdict = 'supported' | 'refuted' | 'conflicting' | 'unverified';
export type ZoneTone = 'contradiction' | 'entailment' | 'neutral';

export interface LayoutZone {
  id: string;
  title: string;
  subtitle?: string;
  tone: ZoneTone;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutCard {
  key: string;
  node: GraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  verdict?: ClaimVerdict;
  verdictCounts?: { supports: number; refutes: number; neutral: number };
  linkedEdge?: GraphEdge;
  isCrossDoc?: boolean;
  sourceName?: string;
  claimTextForSnippet?: string;
  compact?: boolean;
}

export interface LayoutEdge {
  key: string;
  edge: GraphEdge;
  path: string;
  color: string;
  pillX: number;
  pillY: number;
  claimNodeId: string | null;
  passageNodeId: string | null;
  sourceKey: string;
  targetKey: string;
}

export interface LayoutOverflowPill {
  key: string;
  claimNodeId: string;
  hiddenCount: number;
  x: number;
  y: number;
  width: number;
}

export interface ComputedMapLayout {
  zones: LayoutZone[];
  cards: LayoutCard[];
  edges: LayoutEdge[];
  overflowPills?: LayoutOverflowPill[];
  canvasWidth: number;
  canvasHeight: number;
}

export function edgeColor(edge: GraphEdge): string {
  if (edge.kind === 'extracted_from') return 'var(--border-strong)';
  return labelColor(edge.label);
}

export function labelColor(label: NliLabel | null | undefined): string {
  if (label === 'entailment') return 'var(--nli-entailment)';
  if (label === 'contradiction') return 'var(--nli-contradiction)';
  return 'var(--nli-neutral)';
}

export function verdictColor(verdict: ClaimVerdict): string {
  if (verdict === 'supported') return 'var(--nli-entailment)';
  if (verdict === 'refuted') return 'var(--nli-contradiction)';
  if (verdict === 'conflicting') return 'var(--status-warning)';
  return 'var(--border-strong)';
}

export function verdictBg(verdict: ClaimVerdict): string {
  if (verdict === 'supported') return 'var(--nli-entailment-bg)';
  if (verdict === 'refuted') return 'var(--nli-contradiction-bg)';
  if (verdict === 'conflicting') return 'var(--status-warning-bg)';
  return 'var(--bg-elevated)';
}

export function verdictText(verdict: ClaimVerdict): string {
  if (verdict === 'supported') return 'SUPPORTED';
  if (verdict === 'refuted') return 'REFUTED';
  if (verdict === 'conflicting') return 'CONFLICTING';
  return 'NO VERDICT';
}

export function shortVerdictEdgeLabel(label: NliLabel | null | undefined): string {
  if (label === 'entailment') return 'Supports';
  if (label === 'contradiction') return 'Refutes';
  return 'Context';
}

export function computeClaimVerdict(edges: GraphEdge[]): {
  verdict: ClaimVerdict;
  counts: { supports: number; refutes: number; neutral: number };
} {
  let supports = 0;
  let refutes = 0;
  let neutral = 0;
  for (const e of edges) {
    if (e.kind !== 'evidence') continue;
    if (e.label === 'entailment') supports += 1;
    else if (e.label === 'contradiction') refutes += 1;
    else neutral += 1;
  }
  let verdict: ClaimVerdict = 'unverified';
  if (supports > 0 && refutes > 0) verdict = 'conflicting';
  else if (refutes > 0) verdict = 'refuted';
  else if (supports > 0) verdict = 'supported';
  return { verdict, counts: { supports, refutes, neutral } };
}

function cubicPoint(
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
  return {
    x: mt ** 3 * x1 + 3 * mt ** 2 * t * cx1 + 3 * mt * t ** 2 * cx2 + t ** 3 * x2,
    y: mt ** 3 * y1 + 3 * mt ** 2 * t * cy1 + 3 * mt * t ** 2 * cy2 + t ** 3 * y2,
  };
}

function buildGraphIndexes(graph: GraphResponse) {
  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const docNameById = new Map<string, string>();
  const evidenceByClaim = new Map<string, Array<{ edge: GraphEdge; passage: GraphNode }>>();
  const docEdgeByClaim = new Map<string, { edge: GraphEdge; doc: GraphNode }>();

  for (const n of graph.nodes) {
    if (n.type === 'document' && n.document_id) {
      docNameById.set(n.document_id, n.label);
    }
  }

  for (const edge of graph.edges) {
    if (edge.kind === 'extracted_from') {
      const claimId = edge.source.startsWith('claim:') ? edge.source : edge.target;
      const docId = edge.source.startsWith('doc:') ? edge.source : edge.target;
      const docNode = nodeById.get(docId);
      if (docNode) {
        docEdgeByClaim.set(claimId, { edge, doc: docNode });
      }
      continue;
    }
    if (edge.kind === 'evidence') {
      const claimId = edge.source.startsWith('claim:') ? edge.source : edge.target;
      const passageId = edge.source.startsWith('passage:') ? edge.source : edge.target;
      const passageNode = nodeById.get(passageId);
      if (!passageNode) continue;
      const list = evidenceByClaim.get(claimId) ?? [];
      list.push({ edge, passage: passageNode });
      evidenceByClaim.set(claimId, list);
    }
  }

  for (const [claimId, list] of evidenceByClaim.entries()) {
    const claimDocId = nodeById.get(claimId)?.document_id;
    list.sort((a, b) => {
      const diff = labelRank(a.edge.label) - labelRank(b.edge.label);
      if (diff !== 0) return diff;
      const aCross = claimDocId && a.passage.document_id !== claimDocId ? 1 : 0;
      const bCross = claimDocId && b.passage.document_id !== claimDocId ? 1 : 0;
      if (aCross !== bCross) return bCross - aCross;
      return (b.edge.score ?? 0) - (a.edge.score ?? 0);
    });
  }

  return { nodeById, docNameById, evidenceByClaim, docEdgeByClaim };
}

/**
 * Mode 1: Verdict Islands ("Islands")
 * Groups claims into semantic color-coded zones (Conflicts/Refuted -> Supported -> Unverified)
 * with each claim's evidence placed directly beside it (zero spaghetti crossings).
 */
export function computeClustersLayout(
  graph: GraphResponse,
  options: { showUnverified: boolean },
): ComputedMapLayout {
  const { docNameById, evidenceByClaim } = buildGraphIndexes(graph);
  const claims = graph.nodes.filter((n) => n.type === 'claim');

  const refutedGroup: GraphNode[] = [];
  const supportedGroup: GraphNode[] = [];
  const unverifiedGroup: GraphNode[] = [];
  const metaByClaim = new Map<
    string,
    { verdict: ClaimVerdict; counts: { supports: number; refutes: number; neutral: number } }
  >();

  for (const c of claims) {
    const evList = evidenceByClaim.get(c.id) ?? [];
    const meta = computeClaimVerdict(evList.map((item) => item.edge));
    metaByClaim.set(c.id, meta);
    if (meta.verdict === 'refuted' || meta.verdict === 'conflicting') {
      refutedGroup.push(c);
    } else if (meta.verdict === 'supported') {
      supportedGroup.push(c);
    } else {
      unverifiedGroup.push(c);
    }
  }

  const zones: LayoutZone[] = [];
  const cards: LayoutCard[] = [];
  const edges: LayoutEdge[] = [];
  const overflowPills: LayoutOverflowPill[] = [];

  const zoneX = 16;
  const zoneWidth = 824;
  const claimX = zoneX + 18;
  const claimW = 286;
  const passageX = claimX + claimW + 144;
  const passageW = 358;
  const claimH = 104;
  const passageH = 92;
  const passageGap = 12;
  const overflowPillH = 26;
  const rowGap = 20;

  let cursorY = 16;

  const renderEvidenceZone = (
    zoneId: string,
    title: string,
    subtitle: string,
    tone: ZoneTone,
    groupClaims: GraphNode[],
  ) => {
    if (groupClaims.length === 0) return;
    const zoneTop = cursorY;
    let innerY = zoneTop + 48;

    for (const claim of groupClaims) {
      const evList = evidenceByClaim.get(claim.id) ?? [];
      const meta = metaByClaim.get(claim.id)!;
      const visibleEv = evList.slice(0, 4);
      const hiddenCount = Math.max(0, evList.length - visibleEv.length);
      const passagesStackH =
        visibleEv.length > 0
          ? visibleEv.length * passageH +
            Math.max(0, visibleEv.length - 1) * passageGap +
            (hiddenCount > 0 ? passageGap + overflowPillH : 0)
          : claimH;
      const rowH = Math.max(claimH, passagesStackH);
      const claimY = innerY + Math.round((rowH - claimH) / 2);
      const claimKey = `cluster:${claim.id}`;

      cards.push({
        key: claimKey,
        node: claim,
        x: claimX,
        y: claimY,
        width: claimW,
        height: claimH,
        verdict: meta.verdict,
        verdictCounts: meta.counts,
        sourceName: claim.document_id ? docNameById.get(claim.document_id) : undefined,
      });

      const x1 = claimX + claimW;
      const y1 = claimY + claimH / 2;

      visibleEv.forEach(({ edge, passage }, idx) => {
        const py = innerY + idx * (passageH + passageGap);
        const passageKey = `cluster:${claim.id}:${passage.id}:${idx}`;
        const isCrossDoc = Boolean(
          claim.document_id && passage.document_id && claim.document_id !== passage.document_id,
        );

        cards.push({
          key: passageKey,
          node: passage,
          x: passageX,
          y: py,
          width: passageW,
          height: passageH,
          linkedEdge: edge,
          isCrossDoc,
          sourceName: passage.document_id ? docNameById.get(passage.document_id) : undefined,
          claimTextForSnippet: claim.label,
        });

        const x2 = passageX;
        const y2 = py + passageH / 2;
        const midX = (x1 + x2) / 2;
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        const pt = cubicPoint(x1, y1, midX, y1, midX, y2, x2, y2, 0.62);

        edges.push({
          key: `cedge:${edge.id}:${idx}`,
          edge,
          path,
          color: edgeColor(edge),
          pillX: midX,
          pillY: pt.y,
          claimNodeId: claim.id,
          passageNodeId: passage.id,
          sourceKey: claimKey,
          targetKey: passageKey,
        });
      });

      if (hiddenCount > 0) {
        const pillY = innerY + visibleEv.length * (passageH + passageGap);
        overflowPills.push({
          key: `overflow:${claim.id}`,
          claimNodeId: claim.id,
          hiddenCount,
          x: passageX,
          y: pillY,
          width: passageW,
        });
      }

      innerY += rowH + rowGap;
    }

    const zoneHeight = innerY - zoneTop + 4;
    zones.push({
      id: zoneId,
      title,
      subtitle,
      tone,
      x: zoneX,
      y: zoneTop,
      width: zoneWidth,
      height: zoneHeight,
    });
    cursorY = zoneTop + zoneHeight + 20;
  };

  renderEvidenceZone(
    'zone-refuted',
    `CONTRADICTIONS & DISPUTES (${refutedGroup.length})`,
    'Claims refuted or contested by passages in the corpus',
    'contradiction',
    refutedGroup,
  );

  renderEvidenceZone(
    'zone-supported',
    `SUPPORTED CLAIMS (${supportedGroup.length})`,
    'Claims backed by direct supporting passages in the corpus',
    'entailment',
    supportedGroup,
  );

  if (unverifiedGroup.length > 0 && options.showUnverified) {
    const zoneTop = cursorY;
    const cols = 3;
    const gap = 12;
    const cardW = Math.floor((zoneWidth - 36 - gap * (cols - 1)) / cols);
    const cardH = 74;
    const startY = zoneTop + 48;

    unverifiedGroup.forEach((claim, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = zoneX + 18 + col * (cardW + gap);
      const cy = startY + row * (cardH + gap);
      const meta = metaByClaim.get(claim.id)!;

      cards.push({
        key: `cluster:${claim.id}`,
        node: claim,
        x: cx,
        y: cy,
        width: cardW,
        height: cardH,
        verdict: meta.verdict,
        verdictCounts: meta.counts,
        sourceName: claim.document_id ? docNameById.get(claim.document_id) : undefined,
        compact: true,
      });
    });

    const rowsCount = Math.ceil(unverifiedGroup.length / cols);
    const zoneHeight = 48 + rowsCount * cardH + Math.max(0, rowsCount - 1) * gap + 18;
    zones.push({
      id: 'zone-unverified',
      title: `UNVERIFIED CLAIMS (${unverifiedGroup.length})`,
      subtitle: 'Claims with no supporting or contradicting passages yet',
      tone: 'neutral',
      x: zoneX,
      y: zoneTop,
      width: zoneWidth,
      height: zoneHeight,
    });
    cursorY = zoneTop + zoneHeight + 20;
  }

  return {
    zones,
    cards,
    edges,
    overflowPills,
    canvasWidth: zoneWidth + 32,
    canvasHeight: Math.max(420, cursorY + 12),
  };
}

/**
 * Mode 2: Argument Scales ("Scales")
 * Selected claim sits at the center with source doc above, REFUTES on the left wing,
 * SUPPORTS on the right wing, and checked neutral context passages neatly below.
 */
export function computeBalanceLayout(
  graph: GraphResponse,
  activeClaimNodeId: string | null,
): ComputedMapLayout {
  const { nodeById, docNameById, evidenceByClaim, docEdgeByClaim } = buildGraphIndexes(graph);
  const claims = graph.nodes.filter((n) => n.type === 'claim');
  const claim =
    (activeClaimNodeId ? nodeById.get(activeClaimNodeId) : undefined) ?? claims[0] ?? null;

  if (!claim) {
    return { zones: [], cards: [], edges: [], canvasWidth: 920, canvasHeight: 420 };
  }

  const evList = evidenceByClaim.get(claim.id) ?? [];
  const meta = computeClaimVerdict(evList.map((item) => item.edge));
  const refutes = evList.filter((item) => item.edge.label === 'contradiction');
  const supports = evList.filter((item) => item.edge.label === 'entailment');
  const neutrals = evList.filter((item) => item.edge.label === 'neutral');

  const zones: LayoutZone[] = [];
  const cards: LayoutCard[] = [];
  const edges: LayoutEdge[] = [];

  const canvasWidth = 960;
  const wingW = 264;
  const leftX = 20;
  const centerW = 248;
  const centerX = Math.round((canvasWidth - centerW) / 2);
  const rightX = canvasWidth - wingW - 20;

  const docEntry = docEdgeByClaim.get(claim.id);
  const docW = 216;
  const docH = 54;
  const docX = Math.round((canvasWidth - docW) / 2);
  const docY = 16;

  const wingHeaderY = docEntry ? 92 : 24;
  const passageH = 104;
  const passageGap = 14;
  const maxWingCount = Math.max(refutes.length, supports.length, 1);
  const wingStackH = maxWingCount * passageH + Math.max(0, maxWingCount - 1) * passageGap;
  const wingZoneH = Math.max(152, wingStackH + 56);

  // Left (Refutes) & Right (Supports) backdrop zones
  zones.push({
    id: 'balance-left',
    title: `REFUTES / CONTRADICTS (${refutes.length})`,
    tone: 'contradiction',
    x: leftX - 8,
    y: wingHeaderY,
    width: wingW + 16,
    height: wingZoneH,
  });

  zones.push({
    id: 'balance-right',
    title: `SUPPORTS / ENTAILS (${supports.length})`,
    tone: 'entailment',
    x: rightX - 8,
    y: wingHeaderY,
    width: wingW + 16,
    height: wingZoneH,
  });

  // Central Claim card
  const claimH = 148;
  const claimY = wingHeaderY + Math.max(24, Math.round((wingZoneH - claimH) / 2));
  const claimKey = `bal:${claim.id}`;
  cards.push({
    key: claimKey,
    node: claim,
    x: centerX,
    y: claimY,
    width: centerW,
    height: claimH,
    verdict: meta.verdict,
    verdictCounts: meta.counts,
    sourceName: claim.document_id ? docNameById.get(claim.document_id) : undefined,
  });

  // Top Source Doc card
  if (docEntry) {
    const docKey = `bal:${docEntry.doc.id}`;
    cards.push({
      key: docKey,
      node: docEntry.doc,
      x: docX,
      y: docY,
      width: docW,
      height: docH,
      compact: true,
    });
    const dx = docX + docW / 2;
    const dy1 = docY + docH;
    const dy2 = claimY;
    edges.push({
      key: `bal-src:${docEntry.edge.id}`,
      edge: docEntry.edge,
      path: `M ${dx} ${dy1} C ${dx} ${(dy1 + dy2) / 2}, ${dx} ${(dy1 + dy2) / 2}, ${dx} ${dy2}`,
      color: 'var(--border-strong)',
      pillX: dx,
      pillY: (dy1 + dy2) / 2,
      claimNodeId: claim.id,
      passageNodeId: null,
      sourceKey: docKey,
      targetKey: claimKey,
    });
  }

  const claimMidY = claimY + claimH / 2;

  // Refuting passages on the LEFT wing (curves go from left of claim -> right of left card)
  refutes.forEach(({ edge, passage }, idx) => {
    const py = wingHeaderY + 42 + idx * (passageH + passageGap);
    const pKey = `bal:left:${passage.id}:${idx}`;
    const isCrossDoc = Boolean(
      claim.document_id && passage.document_id && claim.document_id !== passage.document_id,
    );
    cards.push({
      key: pKey,
      node: passage,
      x: leftX,
      y: py,
      width: wingW,
      height: passageH,
      linkedEdge: edge,
      isCrossDoc,
      sourceName: passage.document_id ? docNameById.get(passage.document_id) : undefined,
      claimTextForSnippet: claim.label,
    });

    const x1 = leftX + wingW;
    const y1 = py + passageH / 2;
    const x2 = centerX;
    const y2 = claimMidY;
    const midX = (x1 + x2) / 2;
    const pt = cubicPoint(x1, y1, midX, y1, midX, y2, x2, y2, 0.36);

    edges.push({
      key: `bal-ev:${edge.id}`,
      edge,
      path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      color: edgeColor(edge),
      pillX: midX,
      pillY: pt.y,
      claimNodeId: claim.id,
      passageNodeId: passage.id,
      sourceKey: claimKey,
      targetKey: pKey,
    });
  });

  // Supporting passages on the RIGHT wing
  supports.forEach(({ edge, passage }, idx) => {
    const py = wingHeaderY + 42 + idx * (passageH + passageGap);
    const pKey = `bal:right:${passage.id}:${idx}`;
    const isCrossDoc = Boolean(
      claim.document_id && passage.document_id && claim.document_id !== passage.document_id,
    );
    cards.push({
      key: pKey,
      node: passage,
      x: rightX,
      y: py,
      width: wingW,
      height: passageH,
      linkedEdge: edge,
      isCrossDoc,
      sourceName: passage.document_id ? docNameById.get(passage.document_id) : undefined,
      claimTextForSnippet: claim.label,
    });

    const x1 = centerX + centerW;
    const y1 = claimMidY;
    const x2 = rightX;
    const y2 = py + passageH / 2;
    const midX = (x1 + x2) / 2;
    const pt = cubicPoint(x1, y1, midX, y1, midX, y2, x2, y2, 0.64);

    edges.push({
      key: `bal-ev:${edge.id}`,
      edge,
      path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      color: edgeColor(edge),
      pillX: midX,
      pillY: pt.y,
      claimNodeId: claim.id,
      passageNodeId: passage.id,
      sourceKey: claimKey,
      targetKey: pKey,
    });
  });

  let totalH = wingHeaderY + wingZoneH + 24;

  // Neutral passages neatly underneath
  if (neutrals.length > 0) {
    const nZoneY = totalH + 6;
    const nCols = Math.min(3, neutrals.length);
    const nGap = 14;
    const nCardW = Math.floor((canvasWidth - 48 - nGap * (nCols - 1)) / nCols);
    const nCardH = 88;
    const nRows = Math.ceil(neutrals.length / nCols);
    const nZoneH = 44 + nRows * nCardH + Math.max(0, nRows - 1) * nGap + 14;

    zones.push({
      id: 'balance-neutral',
      title: `CHECKED CONTEXT — NO VERDICT (${neutrals.length})`,
      tone: 'neutral',
      x: 12,
      y: nZoneY,
      width: canvasWidth - 24,
      height: nZoneH,
    });

    neutrals.forEach(({ edge, passage }, idx) => {
      const col = idx % nCols;
      const row = Math.floor(idx / nCols);
      const nx = 24 + col * (nCardW + nGap);
      const ny = nZoneY + 42 + row * (nCardH + nGap);
      const pKey = `bal:neutral:${passage.id}:${idx}`;
      const isCrossDoc = Boolean(
        claim.document_id && passage.document_id && claim.document_id !== passage.document_id,
      );

      cards.push({
        key: pKey,
        node: passage,
        x: nx,
        y: ny,
        width: nCardW,
        height: nCardH,
        linkedEdge: edge,
        isCrossDoc,
        sourceName: passage.document_id ? docNameById.get(passage.document_id) : undefined,
        claimTextForSnippet: claim.label,
        compact: true,
      });

      const cx = centerX + centerW / 2;
      const cy1 = claimY + claimH;
      const tx = nx + nCardW / 2;
      const ty2 = ny;
      const midY = (cy1 + ty2) / 2;
      edges.push({
        key: `bal-ev:${edge.id}`,
        edge,
        path: `M ${cx} ${cy1} C ${cx} ${midY}, ${tx} ${midY}, ${tx} ${ty2}`,
        color: edgeColor(edge),
        pillX: (cx + tx) / 2,
        pillY: midY,
        claimNodeId: claim.id,
        passageNodeId: passage.id,
        sourceKey: claimKey,
        targetKey: pKey,
      });
    });

    totalH = nZoneY + nZoneH + 18;
  }

  return {
    zones,
    cards,
    edges,
    canvasWidth,
    canvasHeight: Math.max(420, totalH),
  };
}

/**
 * Mode 3: Constellation Network ("Constellation")
 * Places documents as anchor hubs at the top, verdict-colored claims on a central arc,
 * and evidence passages orbiting their linked claims.
 */
export function computeConstellationLayout(
  graph: GraphResponse,
  options: { showUnverified: boolean },
): ComputedMapLayout {
  const { docNameById, evidenceByClaim, docEdgeByClaim } = buildGraphIndexes(graph);
  const docs = graph.nodes.filter((n) => n.type === 'document');
  const allClaims = graph.nodes.filter((n) => n.type === 'claim');

  const claimMetas = allClaims.map((c) => {
    const ev = evidenceByClaim.get(c.id) ?? [];
    return { claim: c, ev, ...computeClaimVerdict(ev.map((i) => i.edge)) };
  });

  const visibleClaims = options.showUnverified
    ? claimMetas
    : claimMetas.filter((m) => m.verdict !== 'unverified');
  const activeClaims = visibleClaims.length > 0 ? visibleClaims : claimMetas;

  // Order claims: refuted/conflicting left, supported right, unverified center-bottom
  activeClaims.sort((a, b) => {
    const order: Record<ClaimVerdict, number> = {
      refuted: 0,
      conflicting: 1,
      supported: 2,
      unverified: 3,
    };
    return order[a.verdict] - order[b.verdict];
  });

  const cards: LayoutCard[] = [];
  const edges: LayoutEdge[] = [];
  const docCardPos = new Map<string, { x: number; y: number; w: number; h: number; key: string }>();

  const cols = Math.min(3, Math.max(1, activeClaims.length));
  const cellW = 310;
  const cellH = 260;
  const canvasWidth = Math.max(860, cols * cellW + 48);

  // Place document anchor hubs evenly across the top
  const docW = 200;
  const docH = 54;
  const docSpacing = canvasWidth / Math.max(1, docs.length);
  docs.forEach((doc, idx) => {
    const dx = Math.round(docSpacing * idx + (docSpacing - docW) / 2);
    const dy = 18;
    const key = `const:${doc.id}`;
    cards.push({ key, node: doc, x: dx, y: dy, width: docW, height: docH, compact: true });
    docCardPos.set(doc.id, { x: dx, y: dy, w: docW, h: docH, key });
  });

  const startY = 112;
  const claimW = 236;
  const claimH = 92;
  const satW = 224;
  const satH = 74;

  activeClaims.forEach(({ claim, ev, verdict, counts }, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellCenterX = Math.round((canvasWidth / cols) * col + canvasWidth / (cols * 2));
    const cx = Math.round(cellCenterX - claimW / 2);
    const cy = startY + row * cellH;
    const claimKey = `const:${claim.id}`;

    cards.push({
      key: claimKey,
      node: claim,
      x: cx,
      y: cy,
      width: claimW,
      height: claimH,
      verdict,
      verdictCounts: counts,
      sourceName: claim.document_id ? docNameById.get(claim.document_id) : undefined,
    });

    const docEdge = docEdgeByClaim.get(claim.id);
    const docPos = docEdge ? docCardPos.get(docEdge.doc.id) : undefined;
    if (docEdge && docPos) {
      const x1 = docPos.x + docPos.w / 2;
      const y1 = docPos.y + docPos.h;
      const x2 = cx + claimW / 2;
      const y2 = cy;
      edges.push({
        key: `const-src:${docEdge.edge.id}`,
        edge: docEdge.edge,
        path: `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`,
        color: 'var(--border-strong)',
        pillX: (x1 + x2) / 2,
        pillY: (y1 + y2) / 2,
        claimNodeId: claim.id,
        passageNodeId: null,
        sourceKey: docPos.key,
        targetKey: claimKey,
      });
    }

    // Orbit up to 2 top evidence passages directly underneath/offset from the claim
    const topEv = ev.filter((item) => item.edge.label !== 'neutral').slice(0, 2);
    const sats = topEv.length > 0 ? topEv : ev.slice(0, 1);
    sats.forEach(({ edge, passage }, sIdx) => {
      const offset = sats.length === 1 ? 0 : sIdx === 0 ? -56 : 56;
      const px = Math.max(
        14,
        Math.min(canvasWidth - satW - 14, Math.round(cellCenterX - satW / 2 + offset)),
      );
      const py = cy + claimH + 46 + (sats.length > 1 && sIdx === 1 ? 18 : 0);
      const pKey = `const:${claim.id}:${passage.id}:${sIdx}`;
      const isCrossDoc = Boolean(
        claim.document_id && passage.document_id && claim.document_id !== passage.document_id,
      );

      cards.push({
        key: pKey,
        node: passage,
        x: px,
        y: py,
        width: satW,
        height: satH,
        linkedEdge: edge,
        isCrossDoc,
        sourceName: passage.document_id ? docNameById.get(passage.document_id) : undefined,
        claimTextForSnippet: claim.label,
        compact: true,
      });

      const x1 = cx + claimW / 2;
      const y1 = cy + claimH;
      const x2 = px + satW / 2;
      const y2 = py;
      const midY = (y1 + y2) / 2;
      edges.push({
        key: `const-ev:${edge.id}:${sIdx}`,
        edge,
        path: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
        color: edgeColor(edge),
        pillX: (x1 + x2) / 2,
        pillY: midY,
        claimNodeId: claim.id,
        passageNodeId: passage.id,
        sourceKey: claimKey,
        targetKey: pKey,
      });
    });
  });

  const rowsCount = Math.ceil(activeClaims.length / cols);
  return {
    zones: [],
    cards,
    edges,
    canvasWidth,
    canvasHeight: Math.max(460, startY + rowsCount * cellH + 40),
  };
}
