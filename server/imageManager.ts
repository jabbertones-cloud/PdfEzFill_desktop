
import { uploadPageImage } from "./objectStorageService";
import https from "https";
import http from "http";

// Free stock image sources that allow commercial use
const STOCK_IMAGE_APIS = {
  unsplash: (query: string, width = 800, height = 600) => 
    `https://source.unsplash.com/${width}x${height}/?${encodeURIComponent(query)}`,
  picsum: (width = 800, height = 600) => 
    `https://picsum.photos/${width}/${height}`,
};

export interface StockImageResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
}

export async function downloadAndStoreStockImage(
  query: string,
  filename: string,
  width = 800,
  height = 600
): Promise<StockImageResult> {
  try {
    const imageUrl = STOCK_IMAGE_APIS.unsplash(query, width, height);
    console.log(`[images] Downloading stock image: ${query} from ${imageUrl}`);
    
    const buffer = await downloadImage(imageUrl);
    if (!buffer) {
      return { success: false, error: "Failed to download image" };
    }

    const sanitizedFilename = `${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}.jpg`;
    const result = await uploadPageImage(buffer, `blog-images-${Date.now()}`, 0);
    
    if (result.success) {
      console.log(`[images] Stored image at: ${result.path}`);
      return { 
        success: true, 
        path: result.path,
        url: `/api/images/${result.path}`
      };
    }

    return { success: false, error: result.error };
  } catch (error) {
    console.error('[images] Error downloading/storing image:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

function downloadImage(url: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        console.error(`[images] HTTP ${response.statusCode} for ${url}`);
        resolve(null);
        return;
      }

      const chunks: Uint8Array[] = [];
      
      response.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer);
      });
      
      response.on('error', (err) => {
        console.error('[images] Download error:', err);
        resolve(null);
      });
    }).on('error', (err) => {
      console.error('[images] Request error:', err);
      resolve(null);
    });
  });
}

// Suggested stock images for each blog post
export const BLOG_IMAGE_SUGGESTIONS = {
  "fill-scanned-pdf-forms-online": [
    { query: "document scanning office", alt: "Person scanning documents in modern office", filename: "scanning-documents" },
    { query: "paperwork desk organized", alt: "Organized desk with paperwork and laptop", filename: "paperwork-desk" },
    { query: "digital signature tablet", alt: "Hand signing document on digital tablet", filename: "digital-signature" }
  ],
  "convert-non-fillable-pdf-to-fillable": [
    { query: "pdf document conversion", alt: "PDF documents being converted digitally", filename: "pdf-conversion" },
    { query: "form filling computer", alt: "Person filling out forms on computer", filename: "form-filling" },
    { query: "automation technology office", alt: "Modern office with automation technology", filename: "automation-tech" }
  ],
  "hr-onboarding-form-automation": [
    { query: "hr onboarding meeting", alt: "HR professional conducting onboarding meeting", filename: "hr-onboarding" },
    { query: "employee paperwork stack", alt: "Stack of employee paperwork and forms", filename: "employee-paperwork" },
    { query: "digital transformation office", alt: "Modern office showcasing digital transformation", filename: "digital-office" }
  ]
};

export async function downloadBlogImages() {
  console.log('[images] Starting blog image download process...');
  
  for (const [slug, images] of Object.entries(BLOG_IMAGE_SUGGESTIONS)) {
    console.log(`[images] Processing images for ${slug}...`);
    
    for (const image of images) {
      const result = await downloadAndStoreStockImage(
        image.query, 
        `${slug}-${image.filename}`,
        1200, 
        800
      );
      
      if (result.success) {
        console.log(`[images] ✓ Downloaded: ${image.filename}`);
      } else {
        console.log(`[images] ✗ Failed: ${image.filename} - ${result.error}`);
      }
      
      // Rate limiting - wait 1 second between downloads
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('[images] Blog image download process complete');
}
