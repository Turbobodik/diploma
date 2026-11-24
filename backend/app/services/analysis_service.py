import threading
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session, sessionmaker

from app.core.constants import PIPELINE_STAGES, ErrorCode, JobStatus
from app.core.exceptions import ConflictError, NotFoundError
from app.db import SessionLocal
from app.ml.pipeline import run_project_pipeline
from app.models.orm import AnalysisJob
from app.models.schemas import AnalyzeStartedOut, JobListOut, JobOut
from app.repositories.claims import ClaimRepository
from app.repositories.documents import DocumentRepository
from app.repositories.projects import ProjectRepository

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="factmap-ml")
_active_lock = threading.Lock()
_active_projects: set[str] = set()


def _to_job_out(job: AnalysisJob) -> JobOut:
    return JobOut(
        id=job.id,
        kind=job.kind,
        status=job.status,
        progress_pct=job.progress_pct,
        error_message=job.error_message,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )


class AnalysisService:
    def __init__(self, db: Session, *, session_factory: sessionmaker = SessionLocal) -> None:
        self._db = db
        self._session_factory = session_factory
        self._projects = ProjectRepository(db)
        self._docs = DocumentRepository(db)
        self._claims = ClaimRepository(db)

    def start_analysis(self, user_id: str, project_id: str, *, sync: bool = False) -> AnalyzeStartedOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")

        ready, in_progress = self._docs.count_status_summary(project_id)
        # Per US-02 / UC-01 A1: failed documents do NOT block analysis of ready documents.
        if ready < 1:
            raise ConflictError(ErrorCode.NOT_READY, "Upload at least one ready document before running analysis")
        if in_progress > 0:
            raise ConflictError(ErrorCode.NOT_READY, "Wait until all queued/processing documents finish extraction")

        with _active_lock:
            if project_id in _active_projects:
                raise ConflictError(ErrorCode.ALREADY_RUNNING, "Analysis is already running for this project")
            _active_projects.add(project_id)

        try:
            job_ids: dict[str, str] = {}
            for kind in PIPELINE_STAGES:
                job = AnalysisJob(
                    project_id=project_id,
                    kind=kind.value,
                    status=JobStatus.QUEUED.value,
                    progress_pct=0,
                )
                self._db.add(job)
                self._db.flush()
                job_ids[kind.value] = job.id
            self._db.commit()
        except Exception:
            with _active_lock:
                _active_projects.discard(project_id)
            raise

        factory = self._session_factory

        def _task() -> None:
            try:
                run_project_pipeline(project_id, job_ids, session_factory=factory)
            except Exception:
                pass
            finally:
                with _active_lock:
                    _active_projects.discard(project_id)

        if sync:
            _task()
        else:
            _executor.submit(_task)

        return AnalyzeStartedOut(
            status=JobStatus.SUCCEEDED.value if sync else JobStatus.QUEUED.value,
            project_id=project_id,
            job_ids=list(job_ids.values()),
        )

    def list_jobs(self, user_id: str, project_id: str) -> JobListOut:
        if self._projects.get_owned(project_id, user_id) is None:
            raise NotFoundError("Project not found")
        jobs = self._claims.list_jobs(project_id)
        return JobListOut(jobs=[_to_job_out(j) for j in jobs])
