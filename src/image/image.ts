import sharp from "sharp";
import byteSize from "byte-size";
import { logger } from "../logger/logger";
import { Ratio } from "src/media";

/**
 * Image lexicon maxSize 1mb
 * @link https://github.com/bluesky-social/atproto/blob/f90eedc865136f50a9daee72c52b275d26310aa3/lexicons/app/bsky/embed/images.json#L24
 */
export const API_LIMIT_IMAGE_UPLOAD_SIZE = 976000;
const IMAGE_LENGTH_LIMIT = 1920;

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function getImageMimeType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return "";
  }
}

/**
 * Checks if the buffer size exceeds Bluesky's upload limit
 */
export function isImageTooLarge(buffer: Buffer): boolean {
  return buffer.length > API_LIMIT_IMAGE_UPLOAD_SIZE;
}

/**
 * Validates and resizes image if needed to meet Bluesky's upload requirements
 * @returns Buffer | null
 */
export async function processImageBuffer(mediaBuffer: Buffer, filename: string): Promise<Buffer | null> {
  if (!isImageTooLarge(mediaBuffer)) {
    return mediaBuffer;
  }

  logger.warn({
    message: `Image size (${byteSize(mediaBuffer.length)}) is larger than upload limit (${byteSize(
      API_LIMIT_IMAGE_UPLOAD_SIZE
    )}). Will attempt to resize buffer ${filename}`,
  });

  try {
    const sharpImage = sharp(mediaBuffer);
    const imageMeta = await sharpImage.metadata();

    if (!imageMeta.width || !imageMeta.height) {
      logger.error({
        message: `Image width or height meta data is missing, image buffer cannot be resized.`,
      });
      return null;
    }

    let width: number | undefined =
      imageMeta.width > imageMeta.height ? IMAGE_LENGTH_LIMIT : undefined;
    const height: number | undefined =
      imageMeta.height > imageMeta.width ? IMAGE_LENGTH_LIMIT : undefined;

    // both will be undefined if the image is square, so set the width.
    if (!width && !height) {
      width = IMAGE_LENGTH_LIMIT;
    }

    const bufferResized = await sharp(mediaBuffer)
      .resize({ width: width, height: height, withoutEnlargement: true })
      .toBuffer();

    const metaResized = await sharp(bufferResized).metadata();

    logger.info({
      message: `before: w${imageMeta.width} h${imageMeta.height} | after: w${metaResized.width} h${metaResized.height}`,
    });

    if (bufferResized.length > API_LIMIT_IMAGE_UPLOAD_SIZE) {
      logger.error({
        message: `Resized image size (${byteSize(bufferResized.length)}) is larger than image upload limit (${byteSize(
          API_LIMIT_IMAGE_UPLOAD_SIZE
        )})`,
      });
      return null;
    }

    logger.info({
      message: `Image successfully resized (${byteSize(bufferResized.length)}) to be less than upload limit (${byteSize(
        API_LIMIT_IMAGE_UPLOAD_SIZE
      )}). This does not change the original image on disk.`,
    });

    return bufferResized;
  } catch (error) {
    logger.error({
      message: `Failed to process image: ${filename}`,
      error,
    });
    return null;
  }
}

export async function getImageSize(filePath: string): Promise<Ratio | null> {
  let ratio: Ratio | null = null;
  try {
    let image = sharp(filePath);
    const metadata = await image.metadata();
    if( metadata.width != undefined && metadata.height != undefined)
      ratio = { width: metadata.width, height: metadata.height };
  } catch (error) {
    logger.error(`Failed to get image aspect ratio; image path: ${filePath}, error: ${error}`)
  }

  return ratio;
}