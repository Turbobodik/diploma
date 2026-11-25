from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.orm import Claim, Document, Project


class ProjectRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_owned(self, project_id: str, owner_id: str) -> Project | None:
        stmt = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        return self._db.scalar(stmt)

    def get_owned_with_counts(self, project_id: str, owner_id: str) -> tuple[Project, int, int] | None:
        project = self.get_owned(project_id, owner_id)
        if project is None:
            return None
        doc_cnt = int(
            self._db.scalar(select(func.count()).select_from(Document).where(Document.project_id == project.id)) or 0
        )
        claim_cnt = int(
            self._db.scalar(select(func.count()).select_from(Claim).where(Claim.project_id == project.id)) or 0
        )
        return project, doc_cnt, claim_cnt

    def exists_name_for_owner(
        self, owner_id: str, name: str, *, exclude_project_id: str | None = None
    ) -> bool:
        target = name.casefold()
        stmt = select(Project.id, Project.name).where(Project.owner_id == owner_id)
        rows = self._db.execute(stmt).all()
        return any(
            str(pid) != exclude_project_id and str(existing).casefold() == target
            for pid, existing in rows
        )

    def list_by_owner(self, owner_id: str, *, limit: int, offset: int) -> tuple[list[tuple[Project, int, int]], int]:
        total = int(
            self._db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == owner_id)) or 0
        )
        doc_counts = (
            select(Document.project_id, func.count(Document.id).label("doc_cnt"))
            .group_by(Document.project_id)
            .subquery()
        )
        claim_counts = (
            select(Claim.project_id, func.count(Claim.id).label("claim_cnt"))
            .group_by(Claim.project_id)
            .subquery()
        )
        stmt = (
            select(
                Project,
                func.coalesce(doc_counts.c.doc_cnt, 0),
                func.coalesce(claim_counts.c.claim_cnt, 0),
            )
            .outerjoin(doc_counts, doc_counts.c.project_id == Project.id)
            .outerjoin(claim_counts, claim_counts.c.project_id == Project.id)
            .where(Project.owner_id == owner_id)
            .order_by(Project.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = [(proj, int(dc), int(cc)) for proj, dc, cc in self._db.execute(stmt).all()]
        return rows, total

    def create(self, *, owner_id: str, name: str) -> Project:
        project = Project(owner_id=owner_id, name=name)
        self._db.add(project)
        self._db.commit()
        self._db.refresh(project)
        return project

    def rename(self, project: Project, new_name: str) -> Project:
        project.name = new_name
        self._db.commit()
        self._db.refresh(project)
        return project

    def delete(self, project: Project) -> None:
        self._db.delete(project)
        self._db.commit()
