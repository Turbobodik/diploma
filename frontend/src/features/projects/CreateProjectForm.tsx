import { AlertCircle, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

export interface CreateProjectFormProps {
  loading?: boolean;
  serverError?: string | null;
  onSubmit: (name: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
}

export function CreateProjectForm({
  loading = false,
  serverError = null,
  onSubmit,
  onCancel,
}: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>(undefined);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError('Project name is required.');
      return;
    }
    if (trimmed.length < 2) {
      setValidationError('Project name must be at least 2 characters.');
      return;
    }
    if (trimmed.length > 200) {
      setValidationError('Project name must be 200 characters or fewer.');
      return;
    }
    setValidationError(undefined);
    const ok = await onSubmit(trimmed);
    if (ok) {
      setName('');
    }
  };

  return (
    <form className="stack-md" onSubmit={handleSubmit} noValidate>
      {serverError ? (
        <div className="alert-banner error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      ) : null}

      <Input
        id="project-name-input"
        label="Project name"
        placeholder="e.g. Biomedical NLI Literature Review"
        hint="Project names must be unique within your account (2–200 characters)."
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          if (validationError) setValidationError(undefined);
        }}
        error={validationError}
        required
      />

      <div className="cluster">
        <Button type="submit" variant="primary" loading={loading} id="create-project-submit-btn">
          <Plus size={16} aria-hidden="true" />
          Create project
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
