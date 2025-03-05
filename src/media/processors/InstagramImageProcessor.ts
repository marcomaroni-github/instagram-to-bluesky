import { logger } from "../../logger/logger";
import { ImageMediaProcessingStrategy } from "../interfaces/ImageMediaProcessingStrategy";
import { ImageMedia, Media } from "../InstagramExportedPost";
import { MediaProcessResult, ImageMediaProcessResultImpl } from "../MediaProcessResult";
import { getImageMimeType, getImageSize } from "../../image";
import { getMediaBuffer } from "../utils";

/**
 * @link https://docs.bsky.app/docs/advanced-guides/posts#:~:text=Each%20post%20contains%20up%20to,alt%20text%20and%20aspect%20ratio.
 * "Each post contains up to four images, and each image can have its own alt text and aspect ratio."
 */
const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

export class InstagramImageProcessor implements ImageMediaProcessingStrategy {
  constructor(
    public instagramImages: ImageMedia[],
    public archiveFolder: string
  ) {}

  process(): Promise<MediaProcessResult[]> {
    const processingResults: Promise<MediaProcessResult>[] = [];
    
    // Process each image in the array (no need to limit here as that's handled by InstagramMediaProcessor)
    for (const media of this.instagramImages) {
      const processedMedia = this.processMedia(media, this.archiveFolder);
      processingResults.push(processedMedia);
    }

    // Return all images being processed as a single promise.
    return Promise.all(processingResults);
  }

  public getMimeType(fileType: string): string {
    return getImageMimeType(fileType);
  }

  /**
   * Transforms image from instragrams export to a normalized processed result.
   * @param media
   * @param archiveFolder
   * @returns Promise<MediaProcessResult>
   */
  private async processMedia(
    media: Media,
    archiveFolder: string
  ): Promise<ImageMediaProcessResultImpl> {
    const fileType = media.uri.substring(media.uri.lastIndexOf(".") + 1);
    const mimeType = this.getMimeType(fileType);
    const mediaBuffer = getMediaBuffer(archiveFolder, media);
    const aspectRatio = await getImageSize(`${archiveFolder}/${media.uri}`);

    let mediaText = media.title ?? "";
    if (
      media.media_metadata?.photo_metadata?.exif_data &&
      media.media_metadata.photo_metadata.exif_data.length > 0
    ) {
      const location = media.media_metadata.photo_metadata.exif_data[0];
      const { latitude, longitude } = location || {};
      if (latitude && latitude > 0) {
        mediaText += `\nPhoto taken at these geographical coordinates: geo:${latitude},${longitude}`;
      }
    }

    let truncatedText = mediaText;
    if (mediaText.length > POST_TEXT_LIMIT) {
      logger.info(`Truncating image caption from ${mediaText.length} to ${POST_TEXT_LIMIT} characters`);
      truncatedText = mediaText.substring(0, POST_TEXT_LIMIT- POST_TEXT_TRUNCATE_SUFFIX.length) + POST_TEXT_TRUNCATE_SUFFIX;
    }

    return new ImageMediaProcessResultImpl(
      truncatedText,
      mimeType,
      mediaBuffer!,
      aspectRatio!
    );
  }
} 