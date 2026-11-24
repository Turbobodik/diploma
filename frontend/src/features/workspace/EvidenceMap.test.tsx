import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GraphResponse } from '../../models/api';
import { EvidenceMap } from './EvidenceMap';

const SAMPLE_GRAPH: GraphResponse = {
  project_id: 'proj-1',
  nodes: [
    {
      id: 'doc:d1',
      type: 'document',
      label: 'paper_a.txt',
      document_id: 'd1',
      page_no: null,
      has_evidence: null,
      confidence: null,
    },
    {
      id: 'claim:c1',
      type: 'claim',
      label: 'Dense retrieval improves recall on scientific claims.',
      document_id: 'd1',
      page_no: 1,
      has_evidence: true,
      confidence: 0.91,
    },
    {
      id: 'passage:p1',
      type: 'passage',
      label: 'Our benchmarks confirm higher recall with dense embeddings.',
      document_id: 'd1',
      page_no: 2,
      has_evidence: null,
      confidence: null,
    },
  ],
  edges: [
    {
      id: 'src:c1',
      source: 'doc:d1',
      target: 'claim:c1',
      kind: 'extracted_from',
      label: null,
      model_label: null,
      user_label: null,
      score: null,
    },
    {
      id: 'ev:e1',
      source: 'claim:c1',
      target: 'passage:p1',
      kind: 'evidence',
      label: 'entailment',
      model_label: 'entailment',
      user_label: null,
      score: 0.87,
    },
  ],
};

describe('EvidenceMap', () => {
  it('shows empty state when graph has no nodes', () => {
    render(<EvidenceMap graph={null} selectedClaimId={null} onSelectClaim={vi.fn()} />);
    expect(screen.getByText('No evidence map yet')).toBeInTheDocument();
  });

  it('supports zoom controls and selects claim nodes on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EvidenceMap graph={SAMPLE_GRAPH} selectedClaimId={null} onSelectClaim={onSelect} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Zoom in evidence map'));
    expect(screen.getByText('120%')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Reset evidence map zoom and pan'));
    expect(screen.getByText('100%')).toBeInTheDocument();

    const claimNode = screen.getByRole('button', {
      name: /claim: Dense retrieval improves recall/i,
    });
    await user.click(claimNode);
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('auto-focuses large graphs and allows zooming up to 400%', async () => {
    const user = userEvent.setup();
    const nodes: GraphResponse['nodes'] = [
      {
        id: 'doc:d1',
        type: 'document',
        label: 'large_paper.pdf',
        document_id: 'd1',
        page_no: null,
        has_evidence: null,
        confidence: null,
      },
    ];
    const edges: GraphResponse['edges'] = [];
    for (let i = 1; i <= 15; i += 1) {
      nodes.push(
        {
          id: `claim:c${i}`,
          type: 'claim',
          label: `Claim number ${i}`,
          document_id: 'd1',
          page_no: i,
          has_evidence: true,
          confidence: 0.9,
        },
        {
          id: `passage:p${i}`,
          type: 'passage',
          label: `Evidence passage ${i}`,
          document_id: 'd1',
          page_no: i,
          has_evidence: null,
          confidence: null,
        },
      );
      edges.push(
        {
          id: `src:c${i}`,
          source: 'doc:d1',
          target: `claim:c${i}`,
          kind: 'extracted_from',
          label: null,
          model_label: null,
          user_label: null,
          score: null,
        },
        {
          id: `ev:e${i}`,
          source: `claim:c${i}`,
          target: `passage:p${i}`,
          kind: 'evidence',
          label: 'entailment',
          model_label: 'entailment',
          user_label: null,
          score: 0.85,
        },
      );
    }

    const onSelect = vi.fn();
    render(
      <EvidenceMap
        graph={{ project_id: 'p1', nodes, edges }}
        selectedClaimId="c1"
        onSelectClaim={onSelect}
      />,
    );

    expect(screen.getByRole('button', { name: 'Focused' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Claim 1\/15/)).toBeInTheDocument();

    const zoomIn = screen.getByLabelText('Zoom in evidence map');
    for (let k = 0; k < 8; k += 1) {
      await user.click(zoomIn);
    }
    expect(screen.getByText('260%')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Next claim'));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });
});
