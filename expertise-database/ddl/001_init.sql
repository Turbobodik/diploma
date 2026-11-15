-- FactMap Scholar — relational schema (PostgreSQL 16+)
-- System of record for users, projects, documents, jobs, claims, and NLI edges.
-- Apply on an empty database:
--   psql "postgresql://factmap:local-dev-only@localhost:5433/factmap" -v ON_ERROR_STOP=1 -f ddl/001_init.sql

BEGIN;

CREATE TABLE app_user (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         varchar(320) NOT NULL,
    password_hash varchar(255) NOT NULL,
    display_name  varchar(120) NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_app_user_email UNIQUE (email),
    CONSTRAINT ck_app_user_email_lower CHECK (email = lower(email)),
    CONSTRAINT ck_app_user_email_shape CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

COMMENT ON TABLE app_user IS 'Account. password_hash is a password-hashing function output (e.g. Argon2id), never a plaintext password.';
COMMENT ON COLUMN app_user.password_hash IS 'One-way password hash. Do not store passwords, API keys, or tokens in this column.';

CREATE TABLE project (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid         NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    name        varchar(200) NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_project_name_nonempty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX uq_project_owner_name
    ON project (owner_id, lower(name));

CREATE INDEX ix_project_owner
    ON project (owner_id);

COMMENT ON TABLE project IS 'Named analysis workspace. Duplicate names are rejected per owner (US-01). Deleting a project cascades derived rows (US-11).';

CREATE TABLE document (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid         NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    original_name    varchar(500) NOT NULL,
    media_type       varchar(100) NOT NULL,
    size_bytes       integer      NOT NULL,
    sha256           char(64)     NOT NULL,
    object_key       varchar(500) NOT NULL,
    status           varchar(20)  NOT NULL DEFAULT 'queued',
    error_message    text,
    page_count       integer,
    extracted_text   text,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT ck_document_media CHECK (media_type IN ('application/pdf', 'text/plain')),
    CONSTRAINT ck_document_size CHECK (size_bytes > 0 AND size_bytes <= 20971520),
    CONSTRAINT ck_document_status CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
    CONSTRAINT ck_document_sha CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_document_error CHECK (
        (status = 'failed' AND error_message IS NOT NULL)
        OR (status <> 'failed')
    ),
    CONSTRAINT ck_document_pages CHECK (page_count IS NULL OR page_count > 0),
    CONSTRAINT uq_document_object_key UNIQUE (object_key),
    CONSTRAINT uq_document_project_sha UNIQUE (project_id, sha256)
);

CREATE INDEX ix_document_project_status
    ON document (project_id, status);

COMMENT ON TABLE document IS 'Uploaded PDF/TXT. File bytes live in object storage at object_key; this row is metadata plus extracted text (US-02, US-02b).';
COMMENT ON COLUMN document.object_key IS 'Key in object storage. Not a filesystem password and not a credential.';

CREATE TABLE analysis_job (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid        NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    kind          varchar(30) NOT NULL,
    status        varchar(20) NOT NULL DEFAULT 'queued',
    progress_pct  smallint    NOT NULL DEFAULT 0,
    error_message text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    started_at    timestamptz,
    finished_at   timestamptz,
    CONSTRAINT ck_job_kind CHECK (kind IN ('extract_text', 'extract_claims', 'retrieve', 'nli')),
    CONSTRAINT ck_job_status CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    CONSTRAINT ck_job_progress CHECK (progress_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_job_error CHECK (
        (status = 'failed' AND error_message IS NOT NULL)
        OR (status <> 'failed')
    ),
    CONSTRAINT ck_job_times CHECK (
        (started_at IS NULL OR started_at >= created_at)
        AND (finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at))
    )
);

CREATE INDEX ix_analysis_job_project
    ON analysis_job (project_id, created_at DESC);

COMMENT ON TABLE analysis_job IS 'Pipeline run for a project: text extraction, claim extraction, retrieval, or NLI (US-02b, US-03, US-04, US-04b).';

CREATE TABLE passage (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid    NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    ordinal     integer NOT NULL,
    page_no     integer,
    char_start  integer NOT NULL,
    char_end    integer NOT NULL,
    text        text    NOT NULL,
    CONSTRAINT uq_passage_ordinal UNIQUE (document_id, ordinal),
    CONSTRAINT ck_passage_span CHECK (char_start >= 0 AND char_end > char_start),
    CONSTRAINT ck_passage_page CHECK (page_no IS NULL OR page_no > 0),
    CONSTRAINT ck_passage_ordinal CHECK (ordinal > 0),
    CONSTRAINT ck_passage_text CHECK (length(btrim(text)) > 0)
);

CREATE INDEX ix_passage_document
    ON passage (document_id);

COMMENT ON TABLE passage IS 'Retrieval unit (chunk) cut from a document. Evidence edges point here.';

CREATE TABLE passage_embedding (
    passage_id  uuid         NOT NULL REFERENCES passage (id) ON DELETE CASCADE,
    model_name  varchar(200) NOT NULL,
    dimensions  smallint     NOT NULL,
    vector      real[]       NOT NULL,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_passage_embedding PRIMARY KEY (passage_id, model_name),
    CONSTRAINT ck_embedding_dim CHECK (dimensions > 0 AND dimensions = cardinality(vector))
);

COMMENT ON TABLE passage_embedding IS 'Dense vector for one passage and one embedding model (US-04). Stored as float array so the schema does not require pgvector.';

CREATE TABLE claim (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         uuid           NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    source_document_id uuid           NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    char_start         integer        NOT NULL,
    char_end           integer        NOT NULL,
    page_no            integer,
    text               text           NOT NULL,
    confidence         numeric(4, 3)  NOT NULL,
    extractor_name     varchar(200)   NOT NULL,
    created_at         timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT ck_claim_span CHECK (char_start >= 0 AND char_end > char_start),
    CONSTRAINT ck_claim_page CHECK (page_no IS NULL OR page_no > 0),
    CONSTRAINT ck_claim_text CHECK (length(btrim(text)) > 0),
    CONSTRAINT ck_claim_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX ix_claim_project
    ON claim (project_id);

CREATE INDEX ix_claim_source_document
    ON claim (source_document_id);

COMMENT ON TABLE claim IS 'Atomic statement extracted from a source span (US-03). Empty evidence is the absence of non-neutral claim_evidence rows, not a hidden claim.';

CREATE OR REPLACE FUNCTION enforce_claim_same_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    doc_project uuid;
BEGIN
    SELECT project_id INTO doc_project FROM document WHERE id = NEW.source_document_id;
    IF doc_project IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION 'claim.project_id must match the source document project';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_claim_same_project
    BEFORE INSERT OR UPDATE OF project_id, source_document_id ON claim
    FOR EACH ROW
    EXECUTE FUNCTION enforce_claim_same_project();

CREATE OR REPLACE FUNCTION enforce_edge_same_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    claim_project uuid;
    passage_project uuid;
BEGIN
    SELECT c.project_id INTO claim_project FROM claim c WHERE c.id = NEW.claim_id;
    SELECT d.project_id INTO passage_project
      FROM passage p
      JOIN document d ON d.id = p.document_id
     WHERE p.id = NEW.passage_id;
    IF claim_project IS DISTINCT FROM passage_project THEN
        RAISE EXCEPTION 'claim and passage must belong to the same project';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TABLE retrieval_candidate (
    claim_id   uuid          NOT NULL REFERENCES claim (id) ON DELETE CASCADE,
    passage_id uuid          NOT NULL REFERENCES passage (id) ON DELETE CASCADE,
    rank       smallint      NOT NULL,
    score      numeric(6, 5) NOT NULL,
    CONSTRAINT pk_retrieval_candidate PRIMARY KEY (claim_id, passage_id),
    CONSTRAINT uq_retrieval_rank UNIQUE (claim_id, rank),
    CONSTRAINT ck_retrieval_rank CHECK (rank BETWEEN 1 AND 20),
    CONSTRAINT ck_retrieval_score CHECK (score >= 0 AND score <= 1)
);

COMMENT ON TABLE retrieval_candidate IS 'Top-k passages proposed for a claim before NLI. Default product k is 5 (US-04); rank allows up to 20.';

CREATE TABLE claim_evidence (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id    uuid          NOT NULL REFERENCES claim (id) ON DELETE CASCADE,
    passage_id  uuid          NOT NULL REFERENCES passage (id) ON DELETE CASCADE,
    model_name  varchar(200)  NOT NULL,
    model_label varchar(20)   NOT NULL,
    model_score numeric(4, 3) NOT NULL,
    user_label  varchar(20),
    updated_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_claim_evidence_pair UNIQUE (claim_id, passage_id),
    CONSTRAINT ck_evidence_model_label CHECK (model_label IN ('entailment', 'contradiction', 'neutral')),
    CONSTRAINT ck_evidence_user_label CHECK (user_label IS NULL OR user_label IN ('entailment', 'contradiction', 'neutral')),
    CONSTRAINT ck_evidence_score CHECK (model_score >= 0 AND model_score <= 1)
);

CREATE INDEX ix_claim_evidence_claim
    ON claim_evidence (claim_id);

CREATE INDEX ix_claim_evidence_passage
    ON claim_evidence (passage_id);

CREATE INDEX ix_claim_evidence_label
    ON claim_evidence (model_label);

COMMENT ON TABLE claim_evidence IS 'NLI edge: passage is the premise, claim is the hypothesis (US-04b). user_label is an optional human override (US-09) and does not replace model_label.';

CREATE TRIGGER trg_candidate_same_project
    BEFORE INSERT OR UPDATE OF claim_id, passage_id ON retrieval_candidate
    FOR EACH ROW
    EXECUTE FUNCTION enforce_edge_same_project();

CREATE TRIGGER trg_evidence_same_project
    BEFORE INSERT OR UPDATE OF claim_id, passage_id ON claim_evidence
    FOR EACH ROW
    EXECUTE FUNCTION enforce_edge_same_project();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_document_updated_at
    BEFORE UPDATE ON document
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_claim_evidence_updated_at
    BEFORE UPDATE ON claim_evidence
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;
