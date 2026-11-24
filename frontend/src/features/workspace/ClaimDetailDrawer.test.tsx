import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ClaimItem } from '../../models/api';
import { ClaimDetailDrawer } from './ClaimDetailDrawer';

const SAMPLE_CLAIM: ClaimItem = {
  id: 'claim-1',
  source_document_id: 'doc-1',
  source_name: 'scifact_2020.pdf',
  page_no: 2,
  char_start: 100,
  char_end: 185,
  text: 'Aspirin reduces cardiovascular mortality in high-risk adult patients.',
  confidence: 0.89,
  extractor_name: 'local-hybrid-claim-v1',
  has_evidence: true,
  evidence: [
    {
      id: 'ev-1',
      passage_id: 'p-1',
      document_id: 'doc-2',
      document_name: 'clinical_trial_2021.pdf',
      page_no: 4,
      char_start: 420,
      char_end: 580,
      passage_text: 'Daily low-dose aspirin significantly lowered vascular death rates.',
      model_name: 'cross-encoder/nli-deberta-v3-xsmall',
      model_label: 'entailment',
      model_score: 0.84,
      user_label: null,
      effective_label: 'entailment',
    },
  ],
};

describe('ClaimDetailDrawer', () => {
  it('renders selection prompt when no claim is selected', () => {
    render(
      <ClaimDetailDrawer claim={null} overridingEvidenceId={null} onOverrideLabel={vi.fn()} />,
    );
    expect(screen.getByText('Select a claim to inspect')).toBeInTheDocument();
  });

  it('displays explicit empty-evidence warning when has_evidence is false', () => {
    render(
      <ClaimDetailDrawer
        claim={{ ...SAMPLE_CLAIM, has_evidence: false, evidence: [] }}
        overridingEvidenceId={null}
        onOverrideLabel={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/No supporting or contradicting evidence was found/i),
    ).toBeInTheDocument();
  });

  it('preserves model_label text and emits override changes', async () => {
    const user = userEvent.setup();
    const onOverride = vi.fn();
    render(
      <ClaimDetailDrawer
        claim={SAMPLE_CLAIM}
        overridingEvidenceId={null}
        onOverrideLabel={onOverride}
      />,
    );

    expect(screen.getByText(/model: entailment \(84%\)/i)).toBeInTheDocument();

    const select = screen.getByLabelText(/Researcher label override/i);
    await user.selectOptions(select, 'contradiction');
    expect(onOverride).toHaveBeenCalledWith('ev-1', 'contradiction');
  });
});
