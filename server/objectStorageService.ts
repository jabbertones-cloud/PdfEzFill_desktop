import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.join(__dirname, "..", "test-storage");

// Ensure storage directory exists
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

export interface StorageResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

export async function uploadPdf(
  buffer: Buffer,
  filename: string,
  formId: string,
  type: "original" | "generated"
): Promise<StorageResult> {
  try {
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `forms/${formId}/${type}_${sanitizedFilename}.b64`;
    
    const filePath = path.join(storageDir, key);
    const dirPath = path.dirname(filePath);
    
    // Create directory structure
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const base64Data = buffer.toString("base64");
    fs.writeFileSync(filePath, base64Data);
    
    console.log(`[storage] Uploaded ${type} PDF to ${key} (${buffer.length} bytes)`);
    return { success: true, path: key };
  } catch (error) {
    console.error(`[storage] Failed to upload PDF:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed"
    };
  }
}

export async function downloadPdf(path_str: string): Promise<Buffer | null> {
  try {
    const filePath = path.join(storageDir, path_str);
    if (!fs.existsSync(filePath)) {
      console.error(`[storage] File not found: ${path_str}`);
      return null;
    }
    
    const base64Data = fs.readFileSync(filePath, "utf-8");
    const buffer = Buffer.from(base64Data, "base64");
    console.log(`[storage] Downloaded PDF from ${path_str} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error(`[storage] Error downloading PDF:`, error);
    return null;
  }
}

export async function uploadPageImage(
  buffer: Buffer,
  formId: string,
  pageNum: number
): Promise<StorageResult> {
  try {
    const key = `forms/${formId}/page_${pageNum}.png.b64`;
    
    const filePath = path.join(storageDir, key);
    const dirPath = path.dirname(filePath);
    
    // Create directory structure
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    const base64Data = buffer.toString("base64");
    fs.writeFileSync(filePath, base64Data);
    
    console.log(`[storage] Uploaded page ${pageNum} image to ${key} (${buffer.length} bytes)`);
    return { success: true, path: key };
  } catch (error) {
    console.error(`[storage] Failed to upload page image:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed"
    };
  }
}

export async function downloadPageImage(path_str: string): Promise<Buffer | null> {
  try {
    const filePath = path.join(storageDir, path_str);
    if (!fs.existsSync(filePath)) {
      console.error(`[storage] File not found: ${path_str}`);
      return null;
    }

    const base64Data = fs.readFileSync(filePath, "utf-8");
    const buffer = Buffer.from(base64Data, "base64");
    console.log(`[storage] Downloaded image from ${path_str} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error(`[storage] Error downloading image:`, error);
    return null;
  }
}

export async function deleteFormFiles(formId: string): Promise<boolean> {
  try {
    const formPath = path.join(storageDir, `forms/${formId}`);
    if (fs.existsSync(formPath)) {
      fs.rmSync(formPath, { recursive: true, force: true });
      console.log(`[storage] Deleted form files for ${formId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[storage] Error deleting form files:`, error);
    return false;
  }
}
