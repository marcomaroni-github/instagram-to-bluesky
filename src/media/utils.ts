import FS from "fs";

import { Media } from "./InstagramExportedPost";
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