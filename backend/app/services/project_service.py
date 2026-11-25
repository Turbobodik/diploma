import shutil

from sqlalchemy.orm import Session, sessionmaker

from app.core.cache import project_cache
from app.core.config import settings
from app.core.constants import ErrorCode
from app.core.exceptions import ConflictError, NotFoundError, UnprocessableError
from app.demo_corpora import DEFAULT_DEMO_PRESET_ID, DEMO_PRESETS
from app.models.schemas import DeleteOut, ProjectIn, ProjectListOut, ProjectOut
from app.repositories.claims import ClaimRepository
from app.repositories.projects import ProjectRepository
from app.services import analysis_service as analysis_mod
from app.services.document_service import DocumentService


class ProjectService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._projects = ProjectRepository(db)

    def list_projects(self, user_id: str, *, limit: int, offset: int) -> ProjectListOut:
        rows, total = self._projects.list_by_owner(user_id, limit=limit, offset=offset)
        items = [
            ProjectOut(
                id=proj.id,
                name=proj.name,
                document_count=doc_cnt,
                claim_count=claim_cnt,
                created_at=proj.created_at.isoformat(),
            )
            for proj, doc_cnt, claim_cnt in rows
        ]
        return ProjectListOut(projects=items, total=total, limit=limit, offset=offset)

    def create_project(self, user_id: str, body: ProjectIn) -> ProjectOut:
        name = body.name.strip()
        if not name:
            raise UnprocessableError(ErrorCode.EMPTY_NAME, "Project name is empty")
        if self._projects.exists_name_for_owner(user_id, name):
            raise ConflictError(ErrorCode.DUPLICATE_NAME, "You already have a project with this name")
        proj = self._projects.create(owner_id=user_id, name=name)
        return ProjectOut(
            id=proj.id,
            name=proj.name,
            document_count=0,
            claim_count=0,
            created_at=proj.created_at.isoformat(),
        )

    def create_demo_project(
        self,
        user_id: str,
        *,
        preset_id: str = DEFAULT_DEMO_PRESET_ID,
        sync: bool | None = None,
        session_factory: sessionmaker | None = None,
    ) -> ProjectOut:
        preset = DEMO_PRESETS.get(preset_id)
        if preset is None:
            raise NotFoundError(f"Unknown demo preset: {preset_id}")

        base_name = preset.default_project_name
        candidate_name = base_name
        suffix = 2
        while self._projects.exists_name_for_owner(user_id, candidate_name):
            candidate_name = f"{base_name} #{suffix}"
            suffix += 1

        proj = self._projects.create(owner_id=user_id, name=candidate_name)

        doc_service = DocumentService(self._db)
        for doc in preset.documents:
            doc_service.upload_document(
                user_id,
                proj.id,
                filename=doc.filename,
                media_type=doc.media_type,
                payload=doc.content.encode("utf-8"),
            )

        run_sync = (settings.ml_backend == "stub") if sync is None else sync
        factory = session_factory or analysis_mod.SessionLocal
        analysis_mod.AnalysisService(self._db, session_factory=factory).start_analysis(
            user_id,
            proj.id,
            sync=run_sync,
        )

        claim_total = len(ClaimRepository(self._db).list_claims_with_source(proj.id))
        return ProjectOut(
            id=proj.id,
            name=proj.name,
            document_count=len(preset.documents),
            claim_count=claim_total,
            created_at=proj.created_at.isoformat(),
        )

    def get_project(self, user_id: str, project_id: str) -> ProjectOut:
        found = self._projects.get_owned_with_counts(project_id, user_id)
        if found is None:
            raise NotFoundError("Project not found")
        proj, doc_cnt, claim_cnt = found
        return ProjectOut(
            id=proj.id,
            name=proj.name,
            document_count=doc_cnt,
            claim_count=claim_cnt,
            created_at=proj.created_at.isoformat(),
        )

    def rename_project(self, user_id: str, project_id: str, body: ProjectIn) -> ProjectOut:
        name = body.name.strip()
        if not name:
            raise UnprocessableError(ErrorCode.EMPTY_NAME, "Project name is empty")
        found = self._projects.get_owned_with_counts(project_id, user_id)
        if found is None:
            raise NotFoundError("Project not found")
        proj, doc_cnt, claim_cnt = found
        if self._projects.exists_name_for_owner(user_id, name, exclude_project_id=proj.id):
            raise ConflictError(ErrorCode.DUPLICATE_NAME, "You already have a project with this name")
        updated = self._projects.rename(proj, name)
        return ProjectOut(
            id=updated.id,
            name=updated.name,
            document_count=doc_cnt,
            claim_count=claim_cnt,
            created_at=updated.created_at.isoformat(),
        )

    def delete_project(self, user_id: str, project_id: str) -> DeleteOut:
        project = self._projects.get_owned(project_id, user_id)
        if project is None:
            raise NotFoundError("Project not found")
        self._projects.delete(project)
        project_cache.invalidate_prefix(f"project:{project_id}:")
        folder = settings.storage_dir / project_id
        if folder.exists():
            shutil.rmtree(folder)
        return DeleteOut(deleted=project_id)
