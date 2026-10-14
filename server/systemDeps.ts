/**
 * System dependency checks (desktop).
 *
 * The processing pipeline shells out to `pdftoppm` from the Poppler suite
 * to render PDF pages to images. That dependency used to be declared
 * nowhere: on a machine without Poppler the pipeline failed mid-flight
 * with a raw "/bin/sh: pdftoppm: command not found" buried in a log.
 * This module is the single place that knows how to detect it and how to
 * describe the fix, so startup and first-use checks report the SAME
 * clear, actionable message.
 */
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const POPPLER_INSTALL_HINT =
  "Install Poppler: macOS `brew install poppler`, Debian/Ubuntu `sudo apt-get install poppler-utils`, Windows: install Poppler and add its bin folder to PATH.";

export const POPPLER_MISSING_MESSAGE =
  `Missing system dependency: pdftoppm (Poppler) is not installed or not on PATH. ` +
  `PdfEzFill needs it to render PDF pages for field detection and page previews. ${POPPLER_INSTALL_HINT}`;

export interface PdftoppmStatus {
  available: boolean;
  /** Present when availability could not be confirmed or it is missing. */
  detail?: string;
}

let cached: { at: number; status: PdftoppmStatus } | null = null;
const CACHE_MS = 30_000;

/** Detect pdftoppm on PATH. Cached briefly; never throws. */
export async function checkPdftoppm(): Promise<PdftoppmStatus> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.status;
  let status: PdftoppmStatus;
  try {
    // pdftoppm prints its version banner to stderr and exits 0 / 99
    // depending on build; what matters is that the binary runs at all.
    await execAsync("pdftoppm -v", { timeout: 5000 });
    status = { available: true };
  } catch (error: any) {
    if (isPdftoppmMissingError(error)) {
      status = { available: false, detail: POPPLER_MISSING_MESSAGE };
    } else {
      // The binary existed and ran (e.g. exited non-zero after printing a
      // version banner). Treat "ran at all" as available.
      status = { available: true };
    }
  }
  cached = { at: now, status };
  return status;
}

/** True when an exec error means the pdftoppm binary itself is absent. */
export function isPdftoppmMissingError(error: any): boolean {
  if (!error) return false;
  if (error.code === "ENOENT") return true;
  const text = `${error.message || ""} ${error.stderr || ""} ${error.stdout || ""}`;
  return /pdftoppm: command not found|pdftoppm: not found|Cannot find .*pdftoppm/i.test(text);
}
