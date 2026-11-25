import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { workspaceService } from '../../services/workspaceService';
import { QuickVerifyPanel } from './QuickVerifyPanel';

describe('QuickVerifyPanel', () => {
  it('submits custom claim, displays verdict, collapses neutral context, and opens document context', async () => {
    const user = userEvent.setup();
    const onOpenContext = vi.fn();
    const spy = vi.spyOn(workspaceService, 'verifyClaim').mockResolvedValue({
      claim_text: 'Hybrid work improves employee retention in IT companies.',
      verdict: 'supported',
      ml_backend: 'transformers',
      checked_passages: 2,
      evidence: [
        {
          passage_id: 'p-1',
          document_id: 'doc-1',
          document_name: 'remote_2024.txt',
          page_no: 2,
          char_start: 120,
          char_end: 260,
          passage_text: 'Empirical data confirms hybrid work increases retention by 27%.',
          retrieval_score: 0.78,
          model_name: 'cross-encoder/nli-deberta-v3-xsmall',
          model_label: 'entailment',
          model_score: 0.91,
        },
        {
          passage_id: 'p-2',
          document_id: 'doc-2',
          document_name: 'remote_2025.txt',
          page_no: 1,
          char_start: 10,
          char_end: 90,
          passage_text: 'Survey participants included 380 engineers across 14 companies.',
          retrieval_score: 0.32,
          model_name: 'cross-encoder/nli-deberta-v3-xsmall',
          model_label: 'neutral',
          model_score: 0.87,
        },
      ],
    });

    render(<QuickVerifyPanel projectId="proj-1" disabled={false} onOpenContext={onOpenContext} />);

    await user.type(
      screen.getByPlaceholderText(/Type any claim or hypothesis/i),
      'Hybrid work improves employee retention in IT companies.',
    );
    await user.click(screen.getByRole('button', { name: /Verify claim/i }));

    expect(spy).toHaveBeenCalledWith('proj-1', {
      claim_text: 'Hybrid work improves employee retention in IT companies.',
      top_k: 5,
      include_neutral: true,
    });

    expect(await screen.findByText('Supported')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText(/confidence: 91%/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Read in document/i }));
    expect(onOpenContext).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        charStart: 120,
        charEnd: 260,
      }),
    );

    // Expand neutral context and verify confusing 87% is omitted
    await user.click(
      screen.getByRole('button', { name: /Show checked context without verdict \(1\)/i }),
    );
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.queryByText(/87%/)).not.toBeInTheDocument();

    spy.mockRestore();
  });
});
