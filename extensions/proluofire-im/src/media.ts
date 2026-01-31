import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { ProluofireImAttachment } from "./types.js";

// Temporary file tracking for cleanup
const tempFiles = new Set<string>();

/**
 * Upload media file to proluofire-im
 *
 * TODO: Implement actual media upload using proluofire-im API
 * - Check proluofire-im's media upload endpoint
 * - Handle authentication for upload
 * - Use streaming for large files
 * - Return attachment reference
 */
export async function uploadMedia(params: {
  filePath: string;
  mimeType?: string;
  maxSizeMb?: number;
}): Promise<ProluofireImAttachment> {
  const { filePath, mimeType, maxSizeMb = 50 } = params;

  try {
    // Check file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file stats
    const stats = fs.statSync(filePath);
    const fileSizeMb = stats.size / (1024 * 1024);

    // Check size limit
    if (fileSizeMb > maxSizeMb) {
      throw new Error(`File size ${fileSizeMb.toFixed(2)}MB exceeds limit of ${maxSizeMb}MB`);
    }

    // Detect MIME type if not provided
    const detectedMimeType = mimeType || (await detectMimeType(filePath));

    // Validate media type
    validateMediaType(detectedMimeType);

    console.log(`[proluofire-im] Uploading media: ${path.basename(filePath)} (${fileSizeMb.toFixed(2)}MB)`);

    // TODO: Implement actual upload
    // For large files (>10MB), use streaming:
    // const stream = createReadStream(filePath);
    // const uploadResponse = await client.uploadMediaStream(stream, {
    //   mimeType: detectedMimeType,
    //   filename: path.basename(filePath),
    //   size: stats.size
    // });

    // Stub: return mock attachment
    const attachment: ProluofireImAttachment = {
      id: `media_${Date.now()}`,
      type: detectedMimeType,
      url: `https://example.com/media/${Date.now()}`, // TODO: Replace with actual URL
      filename: path.basename(filePath),
      size: stats.size,
      mimeType: detectedMimeType,
    };

    return attachment;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to upload media: ${errorMsg}`);
  }
}

/**
 * Download media from proluofire-im
 *
 * TODO: Implement actual media download using proluofire-im API
 * - Fetch media from URL or ID
 * - Use streaming for large files
 * - Save to temporary file
 * - Return file path
 */
export async function downloadMedia(params: {
  attachment: ProluofireImAttachment;
  maxSizeMb?: number;
}): Promise<string> {
  const { attachment, maxSizeMb = 50 } = params;

  try {
    // Check size limit
    if (attachment.size) {
      const sizeMb = attachment.size / (1024 * 1024);
      if (sizeMb > maxSizeMb) {
        throw new Error(`Media size ${sizeMb.toFixed(2)}MB exceeds limit of ${maxSizeMb}MB`);
      }
    }

    // Create temporary file
    const tempDir = os.tmpdir();
    const filename = attachment.filename || `download_${Date.now()}`;
    const tempPath = path.join(tempDir, `proluofire_im_${filename}`);

    console.log(`[proluofire-im] Downloading media: ${attachment.id} to ${tempPath}`);

    // TODO: Implement actual download
    // For large files, use streaming:
    // const response = await client.downloadMediaStream(attachment.id);
    // await pipeline(response.stream, createWriteStream(tempPath));

    // Stub: create empty file
    fs.writeFileSync(tempPath, "");

    // Track for cleanup
    tempFiles.add(tempPath);

    return tempPath;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to download media: ${errorMsg}`);
  }
}

/**
 * Detect MIME type from file
 *
 * TODO: Use a proper MIME type detection library (e.g., file-type, mime-types)
 */
async function detectMimeType(filePath: string): Promise<string> {
  // Simple extension-based detection (replace with proper library)
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".json": "application/json",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Validate media type is supported
 *
 * TODO: Customize based on proluofire-im's supported media types
 */
function validateMediaType(mimeType: string): void {
  // Define supported types (customize based on proluofire-im)
  const supportedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "audio/mpeg",
    "audio/wav",
    "application/pdf",
    "text/plain",
  ];

  if (!supportedTypes.includes(mimeType)) {
    console.warn(`[proluofire-im] Media type ${mimeType} may not be supported`);
  }
}

/**
 * Clean up temporary files
 */
export function cleanupTempFiles(): void {
  for (const filePath of tempFiles) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[proluofire-im] Cleaned up temp file: ${filePath}`);
      }
      tempFiles.delete(filePath);
    } catch (error) {
      console.error(`[proluofire-im] Failed to cleanup temp file ${filePath}:`, error);
    }
  }
}

/**
 * Clean up a specific temporary file
 */
export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[proluofire-im] Cleaned up temp file: ${filePath}`);
    }
    tempFiles.delete(filePath);
  } catch (error) {
    console.error(`[proluofire-im] Failed to cleanup temp file ${filePath}:`, error);
  }
}

/**
 * Convert media format if needed
 *
 * TODO: Implement format conversion if proluofire-im requires specific formats
 * - Use ffmpeg or similar tool for video/audio conversion
 * - Use sharp or similar for image conversion
 */
export async function convertMediaFormat(params: {
  inputPath: string;
  targetFormat: string;
}): Promise<string> {
  const { inputPath, targetFormat } = params;

  // TODO: Implement actual conversion
  // Example with ffmpeg:
  // const outputPath = inputPath.replace(/\.[^.]+$/, `.${targetFormat}`);
  // await execAsync(`ffmpeg -i "${inputPath}" "${outputPath}"`);
  // return outputPath;

  console.log(`[proluofire-im] Format conversion not implemented: ${inputPath} -> ${targetFormat}`);
  return inputPath;
}

/**
 * Extract media metadata
 *
 * TODO: Implement metadata extraction
 * - Use ffprobe for video/audio metadata
 * - Use sharp or image-size for image dimensions
 */
export async function extractMediaMetadata(filePath: string): Promise<{
  width?: number;
  height?: number;
  duration?: number;
  mimeType: string;
}> {
  const mimeType = await detectMimeType(filePath);

  // TODO: Extract actual metadata based on file type
  // For images:
  // const { width, height } = await sharp(filePath).metadata();
  //
  // For videos:
  // const metadata = await ffprobe(filePath);
  // const duration = metadata.format.duration;

  return {
    mimeType,
    // width, height, duration would be extracted here
  };
}

/**
 * Check if file should use streaming based on size
 */
export function shouldUseStreaming(fileSizeBytes: number): boolean {
  const STREAMING_THRESHOLD_MB = 10;
  const sizeMb = fileSizeBytes / (1024 * 1024);
  return sizeMb > STREAMING_THRESHOLD_MB;
}
