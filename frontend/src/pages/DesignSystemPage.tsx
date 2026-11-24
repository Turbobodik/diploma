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
            Living component showcase verifying WCAG 2.1 AA contrast, 44px touch targets, and
            consistent semantic states across light and dark themes.
          </p>
        </div>
      </header>

      <section className="surface-card stack-md">
        <h2>Buttons & Interactive States</h2>
        <div className="cluster">
          <Button variant="primary">Primary action</Button>
          <Button variant="secondary">Secondary action</Button>
          <Button variant="ghost">Ghost button</Button>
          <Button variant="danger">Destructive</Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      <section className="surface-card stack-md">
        <h2>Semantic NLI & Status Badges</h2>
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

      <section className="surface-card stack-md">
        <h2>Form Controls & Validation States</h2>
        <div className="grid-2">
          <Input
            id="ds-valid-input"
            label="Publication title"
            hint="Standard input with helper description"
            value={sampleText}
            onChange={(event) => setSampleText(event.target.value)}
          />
          <Input
            id="ds-error-input"
            label="Email address"
            defaultValue="invalid-email"
            error="Enter a valid email address."
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

      <section className="surface-card stack-md">
        <h2>Feedback, Overlays & Loading Skeletons</h2>
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
