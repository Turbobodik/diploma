import { BookOpen, CheckCircle2, FileText, Network } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthForm, type AuthFormValues } from '../features/auth/AuthForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { clearAuthError, loginUser, registerUser } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status, error } = useAppSelector((state) => state.auth);

  const from = (location.state as { from?: string } | null)?.from || '/projects';

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const handleSubmit = async (values: AuthFormValues) => {
    if (values.mode === 'register') {
      await dispatch(
        registerUser({
          email: values.email,
          password: values.password,
          display_name: values.displayName,
        }),
      );
    } else {
      await dispatch(
        loginUser({
          email: values.email,
          password: values.password,
        }),
      );
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero" aria-label="FactMap Scholar overview">
        <div className="brand-mark">
          <span className="brand-icon" aria-hidden="true">
            <BookOpen size={20} />
          </span>
          <div>
            <div className="brand-title">FactMap Scholar</div>
            <div className="brand-subtitle">Scientific NLI Evidence Verification</div>
          </div>
        </div>

        <div className="auth-hero-copy">
          <h1>Verify scientific claims across papers with traceable NLI evidence.</h1>
          <p className="text-secondary">
            Upload PDF or plain-text publications, extract atomic claims with exact character spans,
            retrieve cross-document passages, and inspect entailment and contradiction graphs.
          </p>
          <ul className="auth-feature-list">
            <li>
              <FileText size={18} aria-hidden="true" />
              <span>Exact span claim extraction from multi-document research corpora.</span>
            </li>
            <li>
              <Network size={18} aria-hidden="true" />
              <span>
                Interactive evidence map linking claims, passages, and calibrated NLI scores.
              </span>
            </li>
            <li>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>
                Researcher label overrides preserving original model predictions for auditability.
              </span>
            </li>
          </ul>
        </div>

        <p className="text-muted">EHU Diploma Project · React + TypeScript + FastAPI + NLI</p>
      </section>

      <main className="auth-form-column">
        <AuthForm
          loading={status === 'loading'}
          serverError={error}
          onModeChange={() => dispatch(clearAuthError())}
          onSubmit={handleSubmit}
        />
      </main>
    </div>
  );
}
