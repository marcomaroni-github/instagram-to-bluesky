import {
  BlueskyClient,
} from "../bluesky/bluesky";
import { logger } from "../logger/logger";
import { validateVideo, processVideoPost } from "../video/video";
import FS from "fs";

export interface MediaProcessResult {
  mediaText: string;
  mimeType: string | null;
  mediaBuffer: Buffer | null;
  isVideo: boolean;
}

/**
 * Processed media from instagram post that supports logging.
 */
export class MediaProcessResultImpl implements MediaProcessResult {
  constructor(
    public mediaText: string,
    public mimeType: string | null,
    public mediaBuffer: Buffer | null,
    public isVideo: boolean
  ) {}

  toJSON() {
    return {
      mediaText: this.mediaText,
      mimeType: this.mimeType,
      mediaBuffer: this.mediaBuffer ? "[Buffer length=" + this.mediaBuffer.length + "]" : null,
      isVideo: this.isVideo
    };
  }
}

/**
 * Instagram post thats been processed to be transformed into a Bluesky post.
 */
export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: MediaProcessResult | MediaProcessResult[];
  mediaCount: number;
}

const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

export function getMimeType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
      return "image/jpeg";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      logger.warn("Unsupported file type " + fileType);
      return "";
  }
}

export async function processMedia(
  media: any,
  archiveFolder: string
): Promise<MediaProcessResult> {
  const mediaDate = new Date(media.creation_timestamp * 1000);
  const fileType = media.uri.substring(media.uri.lastIndexOf(".") + 1);
  const mimeType = getMimeType(fileType);
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
  if (media.media_metadata?.photo_metadata?.exif_data?.length > 0) {
    const location = media.media_metadata.photo_metadata.exif_data[0];
    if (location.latitude > 0) {
      mediaText += `\nPhoto taken at these geographical coordinates: geo:${location.latitude},${location.longitude}`;
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

export async function processPost(
  post: any,
  archiveFolder: string,
  bluesky: BlueskyClient | null,
  simulate: boolean
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
