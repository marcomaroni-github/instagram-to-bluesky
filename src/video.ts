import ffmpeg from 'fluent-ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { logger } from './logger'

// Configure ffmpeg to use ffprobe
ffmpeg.setFfprobePath(ffprobe.path);

/**
 * Validates video size is not greater than Blueskys max.
 * @returns boolean
 */
export function validateVideo(buffer: Buffer): boolean {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  logger.debug(`Validating video size: ${Math.round(buffer.length / 1024 / 1024)}MB`);
  if (buffer.length > MAX_SIZE) {
    logger.warn(`Video file too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_SIZE / 1024 / 1024}MB)`);
    return false;
  }
  return true;
}

/**
 * Uses FFMpeg to resolve the video dimensions.
 * @returns Promise<{width: number, height: number}>
 */
export async function getVideoDimensions(filePath: string): Promise<{width: number, height: number}> {
  logger.debug(`Getting video dimensions for: ${filePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error, metadata) => {
      if (err) {
        logger.error(`FFprobe error: ${err.message}`);
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        logger.error('No video stream found in file');
        reject(new Error('No video stream found'));
        return;
      }

      const dimensions = {
        width: videoStream.width || 640,
        height: videoStream.height || 640
      };
      logger.debug(`Video dimensions: ${dimensions.width}x${dimensions.height}`);
      resolve(dimensions);
    });
  });
}

/**
 * Prepares video for Bluesky upload by creating required metadata
 * @returns Promise<{ref: string, mimeType: string, size: number, dimensions: {width: number, height: number}}>
 */
export async function prepareVideoUpload(filePath: string, buffer: Buffer): Promise<{
  ref: string,
  mimeType: string,
  size: number,
  dimensions: {width: number, height: number}
}> {
  // Validate video size
  if (!validateVideo(buffer)) {
    throw new Error('Video validation failed');
  }

  // Get video dimensions
  const dimensions = await getVideoDimensions(filePath);

  // Return video metadata in Bluesky format
  return {
    ref: '', // This will be filled by the upload process with the CID
    mimeType: 'video/mp4',
    size: buffer.length,
    dimensions
  };
}

/**
 * Creates the video embed structure for Bluesky post
 */
export function createVideoEmbed(videoData: {
  ref: string,
  mimeType: string,
  size: number,
  dimensions: {width: number, height: number}
}) {
  return {
    $type: "app.bsky.embed.video",
    video: {
      $type: "blob",
      ref: {
        $link: videoData.ref
      },
      mimeType: videoData.mimeType,
      size: videoData.size
    },
    aspectRatio: {
      width: videoData.dimensions.width,
      height: videoData.dimensions.height
    }
  };
} 