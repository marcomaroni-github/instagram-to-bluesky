import ffmpeg from 'fluent-ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { logger } from '../logger/logger'
import { BlueskyClient, VideoEmbed } from '../bluesky/bluesky';
import { BlobRef } from '@atproto/api';

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

export interface VideoUploadData {
  ref: BlobRef | undefined;
  mimeType: string;
  size: number;
  dimensions: {
    width: number;
    height: number;
  };
}

export class VideoUploadDataImpl implements VideoUploadData {
  constructor(
    public ref: BlobRef | undefined,
    public mimeType: string,
    public size: number,
    public dimensions: {
      width: number;
      height: number;
    }
  ) {}

  static createDefault(buffer: Buffer): VideoUploadDataImpl {
    return new VideoUploadDataImpl(
      undefined, // empty ref to be filled later
      'video/mp4',
      buffer.length,
      { width: 640, height: 640 }
    );
  }
}

// TODO not setting a blobref screams the wrong place blobref is for bluesky not video processing.
export async function prepareVideoUpload(filePath: string, buffer: Buffer): Promise<VideoUploadData> {
  if (!validateVideo(buffer)) {
    throw new Error('Video validation failed');
  }

  return VideoUploadDataImpl.createDefault(buffer);
}

export interface VideoEmbedOutput {
  $type: "app.bsky.embed.video";
  video: {
    $type: string;
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
  aspectRatio: {
    width: number;
    height: number;
  };
}

export class VideoEmbedOutputImpl implements VideoEmbedOutput {
  readonly $type = "app.bsky.embed.video";
  readonly video: {
    $type: string;
    ref: { $link: string };
    mimeType: string;
    size: number;
  };
  readonly aspectRatio: {
    width: number;
    height: number;
  };

  constructor(
    ref: string,
    mimeType: string,
    size: number,
    dimensions: { width: number; height: number }
  ) {
    this.video = {
      $type: "blob",
      ref: { $link: ref },
      mimeType,
      size
    };
    this.aspectRatio = dimensions;
  }
}

/**
 * Creates the video embed structure for Bluesky post
 */
export function createVideoEmbed(videoData: {
  ref: string,
  mimeType: string,
  size: number,
  dimensions: {width: number, height: number}
}): VideoEmbedOutput {
  return new VideoEmbedOutputImpl(
    videoData.ref,
    videoData.mimeType,
    videoData.size,
    videoData.dimensions
  );
}

/**
 * Processes a video file for posting to Bluesky, including metadata preparation and upload
 * 
 * @param filePath - The path to the video file being processed
 * @param buffer - The video file contents as a Buffer
 * @param bluesky - BlueskyClient instance for uploading, or null if not uploading
 * @param simulate - If true, skips the actual upload to Bluesky
 * 
 * @returns A video embed structure ready for posting to Bluesky
 * @throws {Error} If video buffer is undefined or upload fails
 */
export async function processVideoPost(
  filePath: string,
  buffer: Buffer,
  bluesky: BlueskyClient | null,
  simulate: boolean
) {
  try {
    if (!buffer) {
      throw new Error("Video buffer is undefined");
    }

    logger.debug({
      message: "Processing video",
      fileSize: buffer.length,
      filePath,
    });

    // Prepare video metadata
    const videoData = await prepareVideoUpload(filePath, buffer);

    // Upload video to get CID
    if (!simulate && bluesky) {

      // TODO isolate this logic and remove it only being placed into the media directory.
      const blob = await bluesky.uploadVideo(buffer);
      if (!blob?.ref) {
        throw new Error("Failed to get video upload reference");
      }
      videoData.ref.$link = blob.ref.$link;
    }

    // Create video embed structure
    const videoEmbed = createVideoEmbed(videoData);

    return videoEmbed;
  } catch (error) {
    logger.error("Failed to process video:", error);
    throw error;
  }
}