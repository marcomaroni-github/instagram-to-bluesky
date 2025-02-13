import FS from "fs";
import { logger } from "../logger/logger";
import { Media } from "./InstagramExportedPost";

/**
 * Decode JSON Data into an Object.
 * @param data
 * @returns
 */
export function decodeUTF8(data: any): any {
  try {
    if (typeof data === "string") {
      const utf8 = new TextEncoder().encode(data);
      return new TextDecoder("utf-8").decode(utf8);
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