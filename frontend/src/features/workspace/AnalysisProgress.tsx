import { Badge, type BadgeVariant } from '../../components/common/Badge';
import type { JobItem, JobKind, JobStatus } from '../../models/api';

const STAGE_LABELS: Record<JobKind, string> = {
  extract_text: 'Text extraction',
  extract_claims: 'Claim extraction',
  retrieve: 'Dense retrieval',
  nli: 'NLI verification',
};

function statusVariant(status: JobStatus): BadgeVariant {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'info';
  return 'warning';
}

export interface AnalysisProgressProps {
  jobs: JobItem[];
}

export function AnalysisProgress({ jobs }: AnalysisProgressProps) {
  if (jobs.length === 0) return null;

  const latestByKind = new Map<JobKind, JobItem>();
  for (const job of jobs) {
    if (!latestByKind.has(job.kind)) {
      latestByKind.set(job.kind, job);
    }
  }

  const orderedKinds: JobKind[] = ['extract_text', 'extract_claims', 'retrieve', 'nli'];
  const visibleJobs = orderedKinds
    .map((kind) => latestByKind.get(kind))
    .filter((job): job is JobItem => Boolean(job));

  return (
    <section className="surface-card surface-card-compact stack-sm" aria-label="ML pipeline status">
      <h3>Pipeline status</h3>
      <div className="pipeline-steps">
        {visibleJobs.map((job) => (
          <div key={job.id} className="pipeline-step">
            <div className="cluster">
              <strong className="flex-1">{STAGE_LABELS[job.kind]}</strong>
              <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={job.progress_pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${STAGE_LABELS[job.kind]} progress`}
            >
              <div className="progress-fill" style={{ width: `${job.progress_pct}%` }} />
            </div>
            {job.error_message ? <span className="field-error">{job.error_message}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
