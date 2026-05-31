export interface ScannedFile {
  path: string;
  relativePath: string;
  contents: string;
  lastModified: string;
  sizeBytes: number;
}

export interface ProjectScanResult {
  root: string;
  scannedAt: string;
  files: ScannedFile[];
}

export interface ReadResult {
  path: string;
  contents: string;
  lastModified: string;
  sizeBytes: number;
}

export interface WriteResult {
  path: string;
  lastModified: string;
  sizeBytes: number;
}

export interface FileChangedEvent {
  path: string;
  lastModified: string;
}
