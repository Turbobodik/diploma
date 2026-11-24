import shutil

from sqlalchemy.orm import Session

from app.core.cache import project_cache
from app.core.config import settings
from app.core.constants import ErrorCode
from app.core.exceptions import ConflictError, NotFoundError, UnprocessableError
from app.models.schemas import DeleteOut, ProjectIn, ProjectListOut, ProjectOut
from app.repositories.projects import ProjectRepository


class ProjectService:
    def __init__(self, db: Session) -> None:
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
