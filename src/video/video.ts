import ffprobe from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

import { logger } from "../logger/logger";
import { Ratio } from "../media";
// Configure ffmpeg to use ffprobe
ffmpeg.setFfprobePath(ffprobe.path);

/**
 * Validates video size is not greater than max size.
 * @returns boolean
 */
export function validateVideo(buffer: Buffer): boolean {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  logger.debug(
    `Validating video size: ${Math.round(buffer.length / 1024 / 1024)}MB`
  );
  if (buffer.length > MAX_SIZE) {
    logger.warn(
      `Video file too large: ${Math.round(
        buffer.length / 1024 / 1024
      )}MB (max ${MAX_SIZE / 1024 / 1024}MB)`
    );
    return false;
  }
  return true;
}

/**
 * Uses FFMpeg to resolve the video dimensions.
 * @returns Promise<{width: number, height: number}>
 */
export async function getVideoDimensions(
  filePath: string
): Promise<Ratio> {
  logger.debug(`Getting video dimensions for: ${filePath}`);
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error, metadata) => {
      if (err) {
        logger.error(`FFprobe error: ${err.message}`);
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(
        (s) => s.codec_type === "video"
      );
      if (!videoStream) {
        logger.error("No video stream found in file");
        reject(new Error("No video stream found"));
        return;
      }

      const dimensions = {
        width: videoStream.width || 640,
        height: videoStream.height || 640,
      };
      logger.debug(
        `Video dimensions: ${dimensions.width}x${dimensions.height}`
      );
      resolve(dimensions);
    });
  });
}

export function getMimeType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      return "";
  }
}
