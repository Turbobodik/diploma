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

  it('highlights Russian key sentence, collapses neutral context by default, and triggers Read in document', async () => {
    const user = userEvent.setup();
    const onOpenContext = vi.fn();
    const multiClaim: ClaimItem = {
      ...SAMPLE_CLAIM,
      text: 'Удалённая работа повышает продуктивность разработчиков на 16%.',
      evidence: [
        {
          id: 'ev-neutral',
          passage_id: 'p-neutral',
          document_id: 'doc-1',
          document_name: 'study_2024.txt',
          page_no: 1,
          char_start: 0,
          char_end: 120,
          passage_text: 'Выборка составила 420 человек. Анкетирование длилось два квартала.',
          model_name: 'stub-overlap-v1',
          model_label: 'neutral',
          model_score: 0.9,
          user_label: null,
          effective_label: 'neutral',
        },
        {
          id: 'ev-contra',
          passage_id: 'p-contra',
          document_id: 'doc-2',
          document_name: 'study_2025.txt',
          page_no: 2,
          char_start: 200,
          char_end: 450,
          passage_text:
            'Введение к исследованию описывает методологию опроса. Вопреки ранним оценкам, удалённая работа не повышает продуктивность разработчиков в командах. Дополнительные графики приведены в приложении.',
          model_name: 'stub-overlap-v1',
          model_label: 'contradiction',
          model_score: 0.72,
          user_label: null,
          effective_label: 'contradiction',
        },
      ],
    };

    render(
      <ClaimDetailDrawer
        claim={multiClaim}
        overridingEvidenceId={null}
        onOverrideLabel={vi.fn()}
        onOpenContext={onOpenContext}
      />,
    );

    // Only supporting/contradicting passage is visible by default; neutral is collapsed
    const initialArticles = screen.getAllByRole('article');
    expect(initialArticles).toHaveLength(1);
    expect(initialArticles[0]).toHaveTextContent('Refutes');
    expect(initialArticles[0]).toHaveTextContent('Other document');

    // Collapsed by default: hides surrounding intro sentence, shows Russian key sentence
    expect(initialArticles[0]).toHaveTextContent(/удалённая работа не повышает продуктивность/i);
    expect(initialArticles[0]).not.toHaveTextContent(/Введение к исследованию/i);

    // Expand full passage
    const expandBtn = screen.getByRole('button', { name: /Show full passage \(\+2 more\)/i });
    await user.click(expandBtn);
    expect(initialArticles[0]).toHaveTextContent(/Введение к исследованию/i);
    expect(initialArticles[0]).toHaveTextContent(/Дополнительные графики/i);

    // Collapse back
    await user.click(screen.getByRole('button', { name: /Collapse/i }));
    expect(initialArticles[0]).not.toHaveTextContent(/Введение к исследованию/i);

    // Trigger Read in document context modal from evidence card
    const contextBtns = screen.getAllByRole('button', { name: /Read in document/i });
    await user.click(contextBtns[1]);
    expect(onOpenContext).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-2',
        charStart: 200,
        charEnd: 450,
      }),
    );

    // Expand collapsed neutral context disclosure — verify neutral omits confusing 90%
    await user.click(
      screen.getByRole('button', { name: /Checked context without verdict \(1\)/i }),
    );
    const expandedArticles = screen.getAllByRole('article');
    expect(expandedArticles).toHaveLength(2);
    expect(expandedArticles[1]).toHaveTextContent('model: neutral (no verdict)');
    expect(expandedArticles[1]).not.toHaveTextContent('90%');
  });

  it('invokes onClose when used as an overlay drawer', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ClaimDetailDrawer
        claim={SAMPLE_CLAIM}
        overridingEvidenceId={null}
        onOverrideLabel={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close Claim Inspector' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
