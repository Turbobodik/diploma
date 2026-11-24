import { useState } from 'react';

import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Select } from '../components/common/Select';
import { Skeleton } from '../components/common/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAppDispatch } from '../store/hooks';
import { pushToast } from '../store/uiSlice';

export default function DesignSystemPage() {
  useDocumentTitle('Design System');
  const dispatch = useAppDispatch();
  const [modalOpen, setModalOpen] = useState(false);
  const [sampleText, setSampleText] = useState('Attention Is All You Need');

  return (
    <div className="stack-lg">
      <header className="page-header">
        <div className="page-header-copy">
          <h1>FactMap Design System</h1>
          <p className="text-secondary">
            Reusable component library verifying WCAG 2.1 AA contrast (&gt;= 4.5:1), 44px minimum
            touch targets, relative rem/clamp() typography, and all interactive states across light
            and dark themes.
          </p>
        </div>
      </header>

      <section className="surface-card stack-md" aria-label="Color palette and WCAG contrast">
        <h2>Color Palette &amp; WCAG 2.1 AA Contrast</h2>
        <div className="swatch-grid">
          <div className="swatch-card">
            <div className="swatch-bar swatch-primary" />
            <strong>Primary Accent</strong>
            <span className="mono text-muted">#0F625C / #2DD4BF · 7.1:1</span>
          </div>
          <div className="swatch-card">
            <div className="swatch-bar swatch-entailment" />
            <strong>NLI Entailment</strong>
            <span className="mono text-muted">#116944 / #4ADE80 · 6.5:1</span>
          </div>
          <div className="swatch-card">
            <div className="swatch-bar swatch-contradiction" />
            <strong>NLI Contradiction</strong>
            <span className="mono text-muted">#B42318 / #F87171 · 6.1:1</span>
          </div>
          <div className="swatch-card">
            <div className="swatch-bar swatch-neutral" />
            <strong>NLI Neutral</strong>
            <span className="mono text-muted">#475467 / #CBD5E1 · 7.5:1</span>
          </div>
          <div className="swatch-card">
            <div className="swatch-bar swatch-canvas" />
            <strong>Paper Canvas</strong>
            <span className="mono text-muted">#F7F6F2 / #121417</span>
          </div>
          <div className="swatch-card">
            <div className="swatch-bar swatch-ink" />
            <strong>Primary Ink</strong>
            <span className="mono text-muted">#18181B / #F2F4F7 · 16.4:1</span>
          </div>
        </div>
      </section>

      <section className="surface-card stack-md" aria-label="Button interactive states">
        <h2>Buttons — Variants &amp; Interactive States</h2>
        <div className="cluster">
          <Button variant="primary">Default</Button>
          <Button variant="primary" className="state-preview-hover">
            Hover
          </Button>
          <Button variant="primary" className="state-preview-focus">
            Focus
          </Button>
          <Button variant="primary" className="state-preview-active">
            Active
          </Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="cluster">
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Error / Destructive</Button>
        </div>
      </section>

      <section className="surface-card stack-md" aria-label="Semantic badges">
        <h2>Semantic NLI &amp; Status Badges</h2>
        <div className="cluster">
          <Badge variant="entailment">entailment</Badge>
          <Badge variant="contradiction">contradiction</Badge>
          <Badge variant="neutral">neutral</Badge>
          <Badge variant="success">ready</Badge>
          <Badge variant="info">running</Badge>
          <Badge variant="warning">no evidence</Badge>
          <Badge variant="error">failed</Badge>
        </div>
      </section>

      <section className="surface-card stack-md" aria-label="Form control states">
        <h2>Form Controls &amp; Validation States</h2>
        <div className="grid-2">
          <Input
            id="ds-valid-input"
            label="Default / Filled input"
            hint="Standard input with helper description"
            value={sampleText}
            onChange={(event) => setSampleText(event.target.value)}
          />
          <Input
            id="ds-error-input"
            label="Error validation state"
            defaultValue="invalid-email"
            error="Enter a valid email address."
          />
          <Input
            id="ds-disabled-input"
            label="Disabled input"
            defaultValue="Read-only archived workspace"
            disabled
          />
          <Select
            id="ds-select"
            label="NLI relation filter"
            options={[
              { value: 'entailment', label: 'Entailment' },
              { value: 'contradiction', label: 'Contradiction' },
              { value: 'neutral', label: 'Neutral' },
            ]}
          />
        </div>
      </section>

      <section className="surface-card stack-md" aria-label="Feedback and loading skeletons">
        <h2>Feedback, Overlays &amp; Loading Skeletons</h2>
        <div className="cluster">
          <Button
            variant="secondary"
            onClick={() =>
              dispatch(
                pushToast({
                  variant: 'success',
                  title: 'Toast preview',
                  description: 'Global notification queue working smoothly.',
                }),
              )
            }
          >
            Trigger success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              dispatch(
                pushToast({
                  variant: 'error',
                  title: 'Simulated API error',
                  description: 'HTTP 500 handled by global interceptor.',
                }),
              )
            }
          >
            Trigger error toast
          </Button>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open dialog modal
          </Button>
        </div>

        <Skeleton variant="title" />
        <Skeleton variant="line" count={2} />
      </section>

      <Modal open={modalOpen} title="Accessible Modal Preview" onClose={() => setModalOpen(false)}>
        <p className="text-secondary">
          Press Escape, click outside, or use the close button to dismiss this dialog.
        </p>
        <div className="cluster">
          <Button variant="primary" onClick={() => setModalOpen(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
