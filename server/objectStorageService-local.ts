/**
 * Local filesystem storage — drop-in replacement for objectStorageService.ts
 *
 * Replaces @replit/object-storage with local file system.
 * Files are stored in $LOCAL_STORAGE_PATH (set by Electron main process).
 * Default: ~/Library/Application Support/PdfEzFill/storage/
 *
 * Re-export all the same function signatures so server/routes.ts needs zero changes.
 */

import * as fs from 'fs';
import * as path from 'path';

function getStorageRoot(): string {
  const root = process.env.LOCAL_STORAGE_PATH || path.join(process.cwd(), 'local-storage');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function storageFilePath(key: string): string {
  const full = path.join(getStorageRoot(), key);
  // Ensure parent dir exists
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return full;
}

export interface StorageResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

// ─── Upload (write to local disk) ─────────────────────────────────────────
export async function uploadPdf(
  buffer: Buffer,
  filename: string,
  formId: string,
  type: 'original' | 'generated'
): Promise<StorageResult> {
  try {
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `forms/${formId}/${type}_${sanitized}`;
    const filePath = storageFilePath(key);

    fs.writeFileSync(filePath, buffer);
    console.log(`[storage] Wrote ${type} PDF → ${filePath} (${buffer.length} bytes)`);
    return { success: true, path: key };
  } catch (err) {
    console.error('[storage] uploadPdf failed:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Download (read from local disk) ──────────────────────────────────────
export async function downloadPdf(storagePath: string): Promise<Buffer | null> {
  try {
    const filePath = storageFilePath(storagePath);
    if (!fs.existsSync(filePath)) {
      console.warn(`[storage] File not found: ${filePath}`);
      return null;
    }
    const buf = fs.readFileSync(filePath);
    console.log(`[storage] Read PDF from ${filePath} (${buf.length} bytes)`);
    return buf;
  } catch (err) {
    console.error('[storage] downloadPdf failed:', err);
    return null;
  }
}

// ─── Page image upload/download ───────────────────────────────────────────
export async function uploadPageImage(
  buffer: Buffer,
  formId: string,
  pageNum: number
): Promise<StorageResult> {
  try {
    const key = `forms/${formId}/page_${pageNum}.png`;
    const filePath = storageFilePath(key);
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: key };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function downloadPageImage(formId: string, pageNum: number): Promise<Buffer | null> {
  const key = `forms/${formId}/page_${pageNum}.png`;
  return downloadPdf(key); // same read logic
}

// ─── Delete a form's storage folder ───────────────────────────────────────
export async function deleteFormStorage(formId: string): Promise<void> {
  try {
    const dir = path.join(getStorageRoot(), 'forms', formId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[storage] Deleted form storage: ${dir}`);
    }
  } catch (err) {
    console.error('[storage] deleteFormStorage failed:', err);
  }
}

// ─── Batch fill ZIP output ────────────────────────────────────────────────
export async function saveBatchZip(
  buffer: Buffer,
  jobId: string
): Promise<StorageResult> {
  try {
    const key = `batch/${jobId}/output.zip`;
    const filePath = storageFilePath(key);
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath }; // return full path for direct file serve
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getBatchZipPath(jobId: string): Promise<string | null> {
  const key = `batch/${jobId}/output.zip`;
  const filePath = storageFilePath(key);
  return fs.existsSync(filePath) ? filePath : null;
}
