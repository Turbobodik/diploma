import { AlertCircle, FileUp } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { Button } from '../../components/common/Button';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.txt'];

export interface DocumentUploaderProps {
  uploading: boolean;
  onUpload: (file: File) => void | Promise<void>;
}

function validateUploadFile(file: File): string | null {
  if (file.size === 0) {
    return 'File is empty. Select a non-empty PDF or TXT publication.';
  }
  if (file.size > MAX_BYTES) {
    return 'File exceeds the 20 MB limit.';
  }
  const lower = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const hasAllowedMime =
    file.type === 'application/pdf' || file.type === 'text/plain' || file.type === '';
  if (!hasAllowedExt || !hasAllowedMime) {
    return 'Unsupported format. Only PDF (.pdf) and plain text (.txt) files are allowed.';
  }
  return null;
}

export function DocumentUploader({ uploading, onUpload }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    const error = validateUploadFile(file);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    await onUpload(file);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void processFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void processFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="stack-sm">
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload scientific PDF or TXT document"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <FileUp size={24} aria-hidden="true" />
        <strong>Drop a scientific PDF or TXT paper here</strong>
        <span className="text-muted">Max 20 MB · SHA-256 deduplicated per project</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
          id="choose-file-btn"
        >
          Choose file
        </Button>
        <input
          ref={inputRef}
          id="document-file-input"
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </div>

      {validationError ? (
        <div className="alert-banner error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{validationError}</span>
        </div>
      ) : null}
    </div>
  );
}
