from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ARRAY, REAL
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.constants import DocumentStatus, JobStatus
from app.db import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid_str() -> str:
    return str(uuid4())


class FloatVectorType(TypeDecorator):
    """Stores embedding vectors as PostgreSQL `real[]` and JSON text in SQLite tests."""

    impl = Text
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(ARRAY(REAL))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return [float(x) for x in value]
        return json.dumps([float(x) for x in value])

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return [float(x) for x in value]
        return [float(x) for x in json.loads(value)]


class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    projects: Mapped[list[Project]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "project"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    owner_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("app_user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    owner: Mapped[AppUser] = relationship(back_populates="projects")
    documents: Mapped[list[Document]] = relationship(back_populates="project", cascade="all, delete-orphan")
    jobs: Mapped[list[AnalysisJob]] = relationship(back_populates="project", cascade="all, delete-orphan")
    claims: Mapped[list[Claim]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "document"
    __table_args__ = (
        UniqueConstraint("project_id", "sha256", name="uq_document_project_sha"),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 20971520", name="ck_document_size"),
    )

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=DocumentStatus.QUEUED.value)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    project: Mapped[Project] = relationship(back_populates="documents")
    passages: Mapped[list[Passage]] = relationship(back_populates="document", cascade="all, delete-orphan")
    claims: Mapped[list[Claim]] = relationship(back_populates="source_document", cascade="all, delete-orphan")


class AnalysisJob(Base):
    __tablename__ = "analysis_job"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=JobStatus.QUEUED.value)
    progress_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship(back_populates="jobs")


class Passage(Base):
    __tablename__ = "passage"
    __table_args__ = (UniqueConstraint("document_id", "ordinal", name="uq_passage_ordinal"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    document_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("document.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_start: Mapped[int] = mapped_column(Integer, nullable=False)
    char_end: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    document: Mapped[Document] = relationship(back_populates="passages")
    embeddings: Mapped[list[PassageEmbedding]] = relationship(
        back_populates="passage", cascade="all, delete-orphan"
    )


class PassageEmbedding(Base):
    __tablename__ = "passage_embedding"

    passage_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("passage.id", ondelete="CASCADE"), primary_key=True
    )
    model_name: Mapped[str] = mapped_column(String(200), primary_key=True)
    dimensions: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    vector: Mapped[list[float]] = mapped_column(FloatVectorType(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    passage: Mapped[Passage] = relationship(back_populates="embeddings")


class Claim(Base):
    __tablename__ = "claim"

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    project_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_document_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("document.id", ondelete="CASCADE"), nullable=False, index=True
    )
    char_start: Mapped[int] = mapped_column(Integer, nullable=False)
    char_end: Mapped[int] = mapped_column(Integer, nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    extractor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    project: Mapped[Project] = relationship(back_populates="claims")
    source_document: Mapped[Document] = relationship(back_populates="claims")
    evidence_edges: Mapped[list[ClaimEvidence]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )
    candidates: Mapped[list[RetrievalCandidate]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class RetrievalCandidate(Base):
    __tablename__ = "retrieval_candidate"
    __table_args__ = (UniqueConstraint("claim_id", "rank", name="uq_retrieval_rank"),)

    claim_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("claim.id", ondelete="CASCADE"), primary_key=True
    )
    passage_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("passage.id", ondelete="CASCADE"), primary_key=True
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(6, 5), nullable=False)

    claim: Mapped[Claim] = relationship(back_populates="candidates")


class ClaimEvidence(Base):
    __tablename__ = "claim_evidence"
    __table_args__ = (UniqueConstraint("claim_id", "passage_id", name="uq_claim_evidence_pair"),)

    id: Mapped[str] = mapped_column(Uuid(as_uuid=False), primary_key=True, default=_uuid_str)
    claim_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("claim.id", ondelete="CASCADE"), nullable=False, index=True
    )
    passage_id: Mapped[str] = mapped_column(
        Uuid(as_uuid=False), ForeignKey("passage.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_name: Mapped[str] = mapped_column(String(200), nullable=False)
    model_label: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    model_score: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    user_label: Mapped[str | None] = mapped_column(String(20), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    claim: Mapped[Claim] = relationship(back_populates="evidence_edges")
    passage: Mapped[Passage] = relationship()
