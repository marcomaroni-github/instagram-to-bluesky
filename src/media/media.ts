import FS from "fs";

import { logger } from "@logger/logger.js";
import { validateVideo } from "@video/video.js";
import { ProcessedPost } from "./ProcessedPost.js";
import { MediaProcessResult, MediaProcessResultImpl } from "./MediaProcessResult.js";
import { InstagramExportedPost, Media } from "./InstagramExportedPost.js";
// TODO make a stratgey pattern for video versus image
const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

interface MediaProcessingStrategy {
  /**
   * Processes instagram post and media data into a format easily mapped to Blueskys requirements.
   */
  process(): Promise<ProcessedPost>;
  /**
   * Determine the MIME type of the media file.
   */
  getMimeType(fileType: string): string;
}


export class InstagramMediaProcessor implements MediaProcessingStrategy {

  constructor(public instagramPosts: InstagramExportedPost[]){}

  public process(): Promise<ProcessedPost> {
    throw Error('Unimplemented strategy pattern.');
  }

  public getMimeType(fileType: string): string {
    switch (fileType.toLowerCase()) {
      // TODO move image formats into a the image layer.
      case "heic":
        return "image/heic";
      case "webp":
        return "image/webp";
      case "jpg":
        return "image/jpeg";
      // TODO move video formats into the video layer.
      case "mp4":
        return "video/mp4";
      case "mov":
        return "video/quicktime";
      default:
        throw Error(`Unsupported file type: ${fileType}`);
    }
  }
}

/**
 * Transforms media (image(s)/video) from social media format to a object that can be uploaded to bluesky to become embedded media.
 * @param media 
 * @param archiveFolder 
 * @returns 
 */
export async function processMedia(
  media: Media,
  archiveFolder: string
): Promise<MediaProcessResult> {
  const mediaDate = new Date(media.creation_timestamp * 1000);
  const fileType = media.uri.substring(media.uri.lastIndexOf(".") + 1);
  const mimeType = new InstagramMediaProcessor({}).getMimeType(fileType);
  const mediaFilename = `${archiveFolder}/${media.uri}`;

  let mediaBuffer;
  try {
    mediaBuffer = FS.readFileSync(mediaFilename);
  } catch (error) {
    logger.error({
      message: `Failed to read media file: ${mediaFilename}`,
      error,
    });
    return new MediaProcessResultImpl("", null, null, false);
  }

  let mediaText = media.title ?? "";
  if (media.media_metadata?.photo_metadata?.exif_data && media.media_metadata.photo_metadata.exif_data.length > 0) {
    const location = media.media_metadata.photo_metadata.exif_data[0];
    const { latitude, longitude } = location || {};
    if (latitude && latitude > 0) {
      mediaText += `\nPhoto taken at these geographical coordinates: geo:${latitude},${longitude}`;
    }
  }

  const truncatedText =
    mediaText.length > 100 ? mediaText.substring(0, 100) + "..." : mediaText;

  const isVideo = mimeType.startsWith("video/");

  logger.debug({
    message: "Instagram Source Media",
    mimeType,
    mediaFilename,
    Created: `${mediaDate.toISOString()}`,
    Text: truncatedText.replace(/[\r\n]+/g, " ") || "No title",
    Type: isVideo ? "Video" : "Image",
  });

  return new MediaProcessResultImpl(truncatedText, mimeType, mediaBuffer, isVideo);
}

/**
 * Transforms post content from social media format into the bluesky post format.
 * @param post 
 * @param archiveFolder 
 * @param bluesky 
 * @param simulate 
 * @returns 
 */ 
export async function processPost(
  post: any,
  archiveFolder: string
): Promise<ProcessedPost> {
  let postDate = post.creation_timestamp
    ? new Date(post.creation_timestamp * 1000)
    : undefined;
  let postText = post.title ?? "";

  if (postText.length > POST_TEXT_LIMIT) {
    postText =
      postText.substring(
        0,
        POST_TEXT_LIMIT - POST_TEXT_TRUNCATE_SUFFIX.length
      ) + POST_TEXT_TRUNCATE_SUFFIX;
  }

  if (!post.media?.length) {
    return {
      postDate: postDate || null,
      postText,
      embeddedMedia: [],
      mediaCount: 0,
    };
  }

  if (post.media.length === 1) {
    postText = postText || post.media[0].title;
    postDate = postDate || new Date(post.media[0].creation_timestamp * 1000);
  }

  let embeddedMedia: MediaProcessResult[] = [];
  let mediaCount = 0;

  // If first media is video, process only that
  const firstMedia = await processMedia(post.media[0], archiveFolder);
  if (firstMedia.isVideo) {
    let embeddedVideo: MediaProcessResult;
    if (
      firstMedia.mimeType &&
      firstMedia.mediaBuffer &&
      validateVideo(firstMedia.mediaBuffer)
    ) {
      embeddedVideo = new MediaProcessResultImpl(
        firstMedia.mediaText,
        firstMedia.mimeType,
        firstMedia.mediaBuffer,
        true
      );
      mediaCount = 1;
      // Handle video if present
      try {
        const videoEmbed = await processVideoPost(
          post.media[0].uri,
          firstMedia.mediaBuffer,
          bluesky,
          simulate
        );

        embeddedVideo = videoEmbed as MediaProcessResult;
        logger.debug({
          message: "Video processing complete",
          hasVideoEmbed: !!videoEmbed,
        });
      } catch (error) {
        logger.error("Failed to process video:", error);
      }
      return {
        postDate: postDate || null,
        postText,
        embeddedMedia: embeddedVideo,
        mediaCount,
      };
    }
  }

  // Otherwise process images
  for (let j = 0; j < post.media.length; j++) {
    if (j >= MAX_IMAGES_PER_POST) {
      logger.warn(
        "Bluesky does not support more than 4 images per post, excess images will be discarded."
      );
      break;
    }

    const { mediaText, mimeType, mediaBuffer, isVideo } = await processMedia(
      post.media[j],
      archiveFolder
    );

    if (!mimeType || !mediaBuffer || isVideo) continue;

    embeddedMedia.push(
      new MediaProcessResultImpl(
        mediaText,
        mimeType,
        mediaBuffer,
        false
      )
    );
    mediaCount++;
  }

  return {
    postDate: postDate || null,
    postText,
    embeddedMedia,
    mediaCount,
  };
}



/**
 * Processes a video file for posting to Bluesky.
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
): ProcessedPost {
  try {
    if (!buffer) {
      throw new Error("Video buffer is undefined");
    }
    logger.debug({
      message: "Processing video",
      fileSize: buffer.length,
      filePath,
    });

    // 
    if (!validateVideo(buffer)) {
      throw new Error('Video validation failed');
    }



  } catch (error) {
    logger.error("Failed to process video:", error);
    throw error;
  }
}

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