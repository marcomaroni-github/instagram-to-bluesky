import { logger } from "../../logger/logger";
import { ImageMediaProcessingStrategy } from "../interfaces/ImageMediaProcessingStrategy";
import { ImageMedia, Media } from "../InstagramExportedPost";
import { MediaProcessResult, ImageMediaProcessResultImpl } from "../MediaProcessResult";
import { getImageMimeType } from "../../image";
import { getMediaBuffer } from "../utils";

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
    // Iterate over each image in the post,
    // adding the process to the promise array.
    // Limit to MAX_IMAGES_PER_POST
    let limitedImages = this.instagramImages;
    if (this.instagramImages.length > MAX_IMAGES_PER_POST) {
      logger.info(`Limiting images from ${this.instagramImages.length} to ${MAX_IMAGES_PER_POST}`);
      limitedImages = this.instagramImages.slice(0, MAX_IMAGES_PER_POST);
    }
    
    for (const media of limitedImages) {
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
    if (mediaText.length > POST_TEXT_LIMIT  - POST_TEXT_TRUNCATE_SUFFIX.length) {
      logger.info(`Truncating image caption from ${mediaText.length} to ${POST_TEXT_LIMIT} characters`);
      truncatedText = mediaText.substring(0, POST_TEXT_LIMIT) + POST_TEXT_TRUNCATE_SUFFIX;
    }

    return new ImageMediaProcessResultImpl(
      truncatedText,
      mimeType,
      mediaBuffer!
    );
  }
} 