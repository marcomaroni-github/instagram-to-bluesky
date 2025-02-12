import FS from "fs";

import { logger } from "../logger/logger";
import { validateVideo } from "../video/video";
import { ProcessedPost, ProcessedPostImpl } from "./ProcessedPost";
import {
  MediaProcessResult,
  ImageMediaProcessResultImpl,
  VideoMediaProcessResultImpl,
} from "./MediaProcessResult";
import {
  ImageMedia,
  InstagramExportedPost,
  Media,
  VideoMedia,
} from "./InstagramExportedPost";
// TODO make a stratgey pattern for video versus image
const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";
const UNSUPPORTED_FILE_TYPE_ERROR = Error(`Unsupported file type`);

/**
 * Strategy pattern interface to allow all medias and posts to share a common method of process.
 */
interface ProcessStrategy<P> {
  /**
   * Processes instagram data into a format easily mapped to Blueskys requirements.
   */
  process(): Promise<P>;
}

interface MIMEType {
  /**
   * Determine the MIME type of the media file.
   */
  getMimeType(fileType: string): string;
}

/**
 * Processes instagram posts with media to embed.
 */
interface InstagramPostProcessingStrategy
  extends ProcessStrategy<ProcessedPost[]> {
  /**
   * Processes instagram post and media data into a format easily mapped to Blueskys requirements.
   */
  process(): Promise<ProcessedPost[]>;
}

/**
 * Processes many images in a post into a normalized MediaProcessResult[].
 */
interface ImageMediaProcessingStrategy
  extends ProcessStrategy<MediaProcessResult[]>,
    MIMEType {}

/**
 * Processes single video post media into a normalized MediaProcessResult.
 */
interface VideoMediaProcessingStrategy
  extends ProcessStrategy<MediaProcessResult>,
    MIMEType {}

export class InstagramMediaProcessor implements InstagramPostProcessingStrategy {
  readonly mediaProcessorFactory: MediaProcessorFactory;

  constructor(
    public instagramPosts: InstagramExportedPost[],
    public archiveFolder: string,
    mediaProcessorFactory?: MediaProcessorFactory
  ) {
    this.mediaProcessorFactory = mediaProcessorFactory || new DefaultMediaProcessorFactory();
  }

  /**
   * Processes Instagram posts and their associated media into a format
   * that can be easily mapped to Bluesky's requirements.
   * 
   * This method iterates over each Instagram post, processes the media 
   * (either images or videos), and returns a Promise that resolves to 
   * an array of ProcessedPost objects once all media processing is complete.
   * 
   * @returns {Promise<ProcessedPost[]>} A promise that resolves to an array of ProcessedPost objects.
   */
  public process(): Promise<ProcessedPost[]> {
    const processingPosts: Promise<ProcessedPost>[] = [];
    
    for (const post of this.instagramPosts) {
      const postDate = new Date(post.creation_timestamp * 1000);
      const processingPost = new ProcessedPostImpl(postDate, post.title);
      
      // Get appropriate strategy from factory
      const mediaProcessor = this.mediaProcessorFactory.createProcessor(
        post.media,
        this.archiveFolder
      );
      
      // Process using the strategy
      const processingMedia = mediaProcessor.process().then(processedMedia => {
        processingPost.embeddedMedia = processedMedia;
        return processingPost;
      });

      processingPosts.push(processingMedia);
    }

    return Promise.all(processingPosts);
  }
}

export class InstagramImageProcessor implements ImageMediaProcessingStrategy {
  constructor(
    public instagramImages: ImageMedia[],
    public archiveFolder: string
  ) {}
  process(): Promise<MediaProcessResult[]> {
    const processingResults: Promise<MediaProcessResult>[] = [];
    // Iterate over each image in the post,
    // adding the process to the promise array.
    for (const media of this.instagramImages) {
      const processedMedia = this.processMedia(media, this.archiveFolder);
      processingResults.push(processedMedia);
    }

    // Return all images being processed as a single promise.
    return Promise.all(processingResults);
  }

  public getMimeType(fileType: string): string {
    switch (fileType.toLowerCase()) {
      case "heic":
        return "image/heic";
      case "webp":
        return "image/webp";
      case "jpg":
        return "image/jpeg";
      default:
        logger.warn(`Unsupported File type ${fileType}`);
        throw UNSUPPORTED_FILE_TYPE_ERROR;
    }
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

    const truncatedText =
      mediaText.length > 100 ? mediaText.substring(0, 100) + "..." : mediaText;

    return new ImageMediaProcessResultImpl(
      truncatedText,
      mimeType,
      mediaBuffer!
    );
  }
}

export class InstagramVideoProcessor implements VideoMediaProcessingStrategy {
  constructor(
    public instagramVideo: VideoMedia,
    public archiveFolder: string
  ) {}
  process(): Promise<MediaProcessResult> {
    const processingVideo = this.processVideoMedia(
      this.instagramVideo,
      this.archiveFolder
    );

    return processingVideo;
  }

  public getMimeType(fileType: string): string {
    switch (fileType.toLowerCase()) {
      case "mp4":
        return "video/mp4";
      case "mov":
        return "video/quicktime";
      default:
        logger.warn(`Unsupported File type ${fileType}`);
        throw UNSUPPORTED_FILE_TYPE_ERROR;
    }
  }

  /**
   * Transforms post content from social media format into the bluesky post format.
   * @param post
   * @param archiveFolder
   * @param bluesky
   * @param simulate
   * @returns Promise<VideoMediaProcessResultImpl>
   */
  private async processVideoMedia(
    media: VideoMedia,
    archiveFolder: string
  ): Promise<VideoMediaProcessResultImpl> {
    const fileType = media.uri.substring(media.uri.lastIndexOf(".") + 1);
    const mimeType = this.getMimeType(fileType);

    const mediaBuffer = getMediaBuffer(archiveFolder, media);

    if(validateVideo(mediaBuffer!)) {
      throw Error('Video too large.')
    }
    
    return new VideoMediaProcessResultImpl(media.title, mimeType, mediaBuffer!);
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

// New factory interface
interface MediaProcessorFactory {
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult | MediaProcessResult[]>;
}

// Default factory implementation
class DefaultMediaProcessorFactory implements MediaProcessorFactory {
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult | MediaProcessResult[]> {
    if (Array.isArray(media)) {
      return new InstagramImageProcessor(media, archiveFolder);
    }
    return new InstagramVideoProcessor(media as VideoMedia, archiveFolder);
  }
}
