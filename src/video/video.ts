import ffmpeg from 'fluent-ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { logger } from '@logger/logger.js'
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

export interface VideoEmbedOutput {
  $type: "app.bsky.embed.video";
  video: BlobRef;
  aspectRatio: {
    width: number;
    height: number;
  };
}

export class VideoEmbedOutputImpl implements VideoEmbedOutput {
  readonly $type = "app.bsky.embed.video";
  readonly video: BlobRef;
  readonly aspectRatio: {
    width: number;
    height: number;
  };

  constructor(
    ref: BlobRef,
    mimeType: string,
    size: number,
    dimensions: { width: number; height: number }
  ) {
    this.video = ref;
    this.aspectRatio = dimensions;
  }
}

/**
 * 
 *       // Handle image uploads if present
      if (Array.isArray(embeddedMedia) && AppBskyEmbedImages.isImage(embeddedMedia[0])) {
        const imagesMedia: ImageEmbed[] = embeddedMedia;
        const uploadedImages = await Promise.all(
          imagesMedia.map(async (media) => {
            const blob = await this.uploadImage(
              media.image,
              media.mimeType
            );
            return new ImageEmbedImpl(
              media.alt,
              blob,
              media.mimeType,
              media.uploadData
            );
          })
        );

        embeddedMedia = new ImagesEmbedImpl(uploadedImages);
      } else if (AppBskyEmbedVideo.isMain(embeddedMedia)) {
        // Upload video first
        const videoBlobRef = await this.uploadVideo(
          embeddedMedia.buffer,
          embeddedMedia.mimeType
        );
        // Now transform the embed
        embeddedMedia = new VideoEmbedImpl(
          "",
          embeddedMedia.buffer,
          embeddedMedia.mimeType,
          embeddedMedia.size,
          videoBlobRef,
          embeddedMedia.aspectRatio,
          embeddedMedia.captions
        );
      }
 * 
 */