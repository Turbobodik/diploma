import { AlertCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

export type AuthMode = 'login' | 'register';

export interface AuthFormValues {
  mode: AuthMode;
  email: string;
  password: string;
  displayName: string;
}

export interface AuthFormProps {
  loading?: boolean;
  serverError?: string | null;
  onModeChange?: (mode: AuthMode) => void;
  onSubmit: (values: AuthFormValues) => void | Promise<void>;
}

interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateAuthValues(values: AuthFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedEmail = values.email.trim();
  if (!trimmedEmail) {
    errors.email = 'Email address is required.';
  } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!values.password) {
    errors.password = 'Password is required.';
  } else if (values.mode === 'register' && values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  if (values.mode === 'register') {
    const trimmedName = values.displayName.trim();
    if (!trimmedName) {
      errors.displayName = 'Display name is required.';
    } else if (trimmedName.length > 120) {
      errors.displayName = 'Display name must be 120 characters or fewer.';
    }
  }

  return errors;
}

export function AuthForm({
  loading = false,
  serverError = null,
  onModeChange,
  onSubmit,
}: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrors({});
    onModeChange?.(nextMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values: AuthFormValues = {
      mode,
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    };
    const nextErrors = validateAuthValues(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    await onSubmit(values);
  };

  return (
    <div className="surface-card auth-card stack-md">
      <div className="stack-sm">
        <div className="tab-list" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            id="auth-tab-login"
            className="tab-btn"
            aria-selected={mode === 'login'}
            onClick={() => switchMode('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            id="auth-tab-register"
            className="tab-btn"
            aria-selected={mode === 'register'}
            onClick={() => switchMode('register')}
          >
            Create account
          </button>
        </div>
        <h2>{mode === 'login' ? 'Sign in to your workspace' : 'Create researcher account'}</h2>
        <p className="text-muted">
          {mode === 'login'
            ? 'Access your scientific publications, claims, and NLI evidence maps.'
            : 'Credentials are hashed with Argon2id and authenticated via Bearer JWT.'}
        </p>
      </div>

      {serverError ? (
        <div className="alert-banner error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      ) : null}

      <form className="stack-md" onSubmit={handleSubmit} noValidate>
        {mode === 'register' ? (
          <Input
            id="auth-display-name"
            label="Full name"
            placeholder="e.g. Bahdan Kanoplich"
            autoComplete="name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: undefined }));
            }}
            error={errors.displayName}
            required
          />
        ) : null}

        <Input
          id="auth-email"
          type="email"
          label="Email address"
          placeholder="researcher@ehu.lt"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={errors.email}
          required
        />

        <Input
          id="auth-password"
          type="password"
          label="Password"
          placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          hint={mode === 'register' ? 'Use at least 8 characters.' : undefined}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={errors.password}
          required
        />

        <Button type="submit" variant="primary" loading={loading} id="auth-submit-btn">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
