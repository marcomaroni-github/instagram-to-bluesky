import FS from "fs";

import { InstagramExportedPost, Media } from "./InstagramExportedPost";
import { logger } from "../logger/logger";

/**
 * Decode JSON Data into an Object.
 * @param data
 * @returns
 */
export function decodeUTF8(data: any): any {
  try {
    if (typeof data === "string") {
      const bytes: number[] = handleUTF16Emojis(data);
      return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
    }

    if (Array.isArray(data)) {
      return data.map(decodeUTF8);
    }

    if (typeof data === "object" && data !== null) {
      const obj: { [key: string]: any } = {};
      Object.entries(data).forEach(([key, value]) => {
        obj[key] = decodeUTF8(value);
      });
      return obj;
    }

    return data;
  } catch (error) {
    logger.error({ message: "Error decoding UTF-8 data", error });
    return data;
  }

  /**
   * Instagram encodes its emojis into UTF-16 we need to process them into UTF-8
   * @param data
   * @returns 
   */
  function handleUTF16Emojis(data: string) {
    // Handle Instagram's UTF-8 bytes encoded as UTF-16
    const bytes: number[] = [];
    for (let i = 0; i < data.length;) {
      if (data[i] === '\\' && data[i + 1] === 'u') {
        const hex = data.slice(i + 2, i + 6);
        bytes.push(parseInt(hex, 16));
        i += 6;
      } else {
        bytes.push(data.charCodeAt(i));
        i++;
      }
    }

    return bytes;
  }
}

/**
 * Reads the instagram media file from the archive folder and media file name in export data.
 * @param archiveFolder
 * @param media
 * @returns
 */
export function getMediaBuffer(
  archiveFolder: string,
  media: Media
): Buffer | undefined {
  const mediaFilename = `${archiveFolder}/${media.uri}`;

  let mediaBuffer;
  try {
    mediaBuffer = FS.readFileSync(mediaFilename);
  } catch (error) {
    logger.error({
      message: `Failed to read media file: ${mediaFilename}`,
      error,
    });
  }

  return mediaBuffer;
}

/**
 * Reads and parses a JSON file from the specified path.
 *
 * If the file does not exist, logs an informational message and returns the provided fallback value.
 * If the file exists but cannot be parsed as JSON, logs a warning and returns the fallback value.
 *
 * @param filePath - The path to the JSON file to read.
 * @param missingFileMessage - Optional message to log if the file is not found. Defaults to 'File not found.'.
 * @param fallback - Optional fallback value to return if the file is missing or cannot be parsed. Defaults to an empty array.
 * @returns The parsed JSON content as an array, or the fallback value if the file is missing or invalid.
 */
export function readJsonFile(filePath: string, missingFileMessage: string = 'File not found.', fallback: any[] = []): any[] {
  if (!FS.existsSync(filePath)) {
    logger.info(missingFileMessage)
    return fallback;
  }

  try {
    const buffer = FS.readFileSync(filePath);
    return JSON.parse(buffer.toString());
  } catch (error) {
    logger.warn(`Failed to parse ${filePath}: ${(error as Error)?.message}`);
    return fallback;
  }
};

/**
 * Sorts Instagram posts by their creation time.
 * @param a - The first post to compare.
 * @param b - The second post to compare.
 * @returns A negative number if `a` should come before `b`, a positive number if `a` should come after `b`, or 0 if they are equal.
 */
export function sortPostsByCreationTime(a: InstagramExportedPost, b: InstagramExportedPost): number {
  // Get the first posts media and compare timestamps.
  const firstMedia = a.media[0];
  const secondMedia = b.media[0];

  // If the first post has no media or creation timestamp, we skip it.
  if (!firstMedia || firstMedia.creation_timestamp === undefined) {
    logger.warn("No media or creation timestamp, sorting to bottom", a);
    return 1; // Move this post to the end of the array
  }
  // If the second post has no media or creation timestamp, we skip it.
  if (!secondMedia || secondMedia.creation_timestamp === undefined) {
    logger.warn("No media or creation timestamp, sorting to bottom", b);
    return -1; // Move this post to the end of the array
  }

  const ad = firstMedia.creation_timestamp;
  const bd = secondMedia.creation_timestamp;

  // Sort by creation timestamp, ascending order.
  return ad - bd;
}