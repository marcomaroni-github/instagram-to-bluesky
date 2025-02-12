import FS from "fs";

import { logger } from "@logger/logger.js";
import { validateVideo } from "@video/video.js";
import { ProcessedPost, ProcessedPostImpl } from "./ProcessedPost.js";
import {
  MediaProcessResult,
  ImageMediaProcessResultImpl,
  VideoMediaProcessResultImpl,
} from "./MediaProcessResult.js";
import {
  ImageMedia,
  InstagramExportedPost,
  Media,
  VideoMedia,
} from "./InstagramExportedPost.js";
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

export class InstagramMediaProcessor
  implements InstagramPostProcessingStrategy
{
  constructor(
    public instagramPosts: InstagramExportedPost[],
    public archiveFolder: string
  ) {}

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
    // Array to hold promises for each processed post
    const processingPosts: Promise<ProcessedPost>[] = [];
    
    // Iterate over each Instagram post
    for (const post of this.instagramPosts) {
      // Create a new date object from the post's creation timestamp
      const postDate = new Date(post.creation_timestamp * 1000);
      
      // Initialize a new ProcessedPostImpl object with the post date and title
      const processingPost = new ProcessedPostImpl(postDate, post.title);
      
      // Declare a promise to hold the processing result for the media
      let processingMedia: Promise<ProcessedPost>;

      // Check if the post contains multiple media items (images)
      if (Array.isArray(post.media)) {
        // Create an image processor for the array of images
        const imageProcessor = new InstagramImageProcessor(post.media, this.archiveFolder);
        
        // Process the images and update the processingPost with the results
        const processingImages: Promise<MediaProcessResult[]> = imageProcessor.process();
        processingMedia = processingImages.then((processedImages) => {
          processingPost.embeddedMedia = processedImages; // Set the embedded media
          return processingPost; // Return the processed post
        });
      } else {
        // If the post contains a single video
        const videoProcessor = new InstagramVideoProcessor(post.media as VideoMedia, this.archiveFolder);
        
        // Process the video and update the processingPost with the result
        const processingVideo: Promise<MediaProcessResult> = videoProcessor.process();
        processingMedia = processingVideo.then((processedVideo) => {
          processingPost.embeddedMedia = processedVideo; // Set the embedded media
          return processingPost; // Return the processed post
        });
      }

      // Add the processing promise to the array
      processingPosts.push(processingMedia);
    }

    // Wait for all processing promises to resolve and return the final array of processed posts
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
