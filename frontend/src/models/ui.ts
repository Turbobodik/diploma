export type ThemeMode = 'light' | 'dark';

export type DisplayScale = '0.9' | '1' | '1.12' | '1.25';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

export type BreakpointTier = 'mobile' | 'tablet' | 'desktop' | 'ultrawide';

export type DeviceOrientation = 'portrait' | 'landscape';

export interface DeviceProfile {
  width: number;
  height: number;
  breakpoint: BreakpointTier;
  orientation: DeviceOrientation;
  pixelRatio: number;
  aspectRatio: string;
  isTouch: boolean;
}

export type ProjectSortField = 'created_at' | 'name' | 'document_count' | 'claim_count';

export type ClaimSortField = 'confidence' | 'evidence_count' | 'source_name';

export type SortDirection = 'asc' | 'desc';
