import FS from 'fs';

import { getImageMimeType } from '../image';
import { logger } from '../logger/logger';
import { getMimeType as getVideoMimeType, getVideoDimensions, validateVideo } from '../video/video';
import { ImageMedia, InstagramExportedPost, Media, VideoMedia } from './InstagramExportedPost';
import {
    ImageMediaProcessResultImpl, MediaProcessResult, VideoMediaProcessResultImpl
} from './MediaProcessResult';
import { ProcessedPost, ProcessedPostImpl } from './ProcessedPost';

const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

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
  extends ProcessStrategy<MediaProcessResult[]>,
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
      const timestamp = post.creation_timestamp || post.media[0].creation_timestamp;
      const postDate = new Date(timestamp * 1000);
      
      // Truncate post title if it exceeds the limit
      let title = post.title ?? post.media[0].title;
      if (title && title.length > POST_TEXT_LIMIT) {
        logger.info(`Truncating post title from ${title.length} to ${POST_TEXT_LIMIT} characters`);
        title = title.substring(0, POST_TEXT_LIMIT) + POST_TEXT_TRUNCATE_SUFFIX;
      }
        
      const processingPost = new ProcessedPostImpl(postDate, title);
      
      // Limit media to MAX_IMAGES_PER_POST
      let limitedMedia = post.media;
      if (Array.isArray(post.media) && post.media.length > MAX_IMAGES_PER_POST) {
        logger.info(`Limiting post media from ${post.media.length} to ${MAX_IMAGES_PER_POST} items`);
        limitedMedia = post.media.slice(0, MAX_IMAGES_PER_POST);
      }
      
      // Get appropriate strategy from factory
      const mediaProcessor = this.mediaProcessorFactory.createProcessor(
        limitedMedia,
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
    if (mediaText.length > POST_TEXT_LIMIT) {
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

export class InstagramVideoProcessor implements VideoMediaProcessingStrategy {
  constructor(
    public instagramVideos: VideoMedia[],
    public archiveFolder: string
  ) {}
  process(): Promise<MediaProcessResult[]> {
    const processingResults: Promise<MediaProcessResult>[] = [];
    // Iterate over each video in the post,
    // adding the process to the promise array.
    for (const media of this.instagramVideos) {
      const processingVideo = this.processVideoMedia(
        media,
        this.archiveFolder
      );        
      processingResults.push(processingVideo);
    }
    // Return all video(s) being processed as a single promise.
    return Promise.all(processingResults);
  }

  public getMimeType(fileType: string): string {
    return getVideoMimeType(fileType);
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
    const aspectRatio = await getVideoDimensions(`${archiveFolder}/${media.uri}`);

    if(!validateVideo(mediaBuffer!)) {
      throw Error('Video too large.')
    }
    
    let title = media.title;
    if (title && title.length > POST_TEXT_LIMIT) {
      logger.info(`Truncating video title from ${title.length} to ${POST_TEXT_LIMIT} characters`);
      title = title.substring(0, POST_TEXT_LIMIT) + POST_TEXT_TRUNCATE_SUFFIX;
    }
    
    return new VideoMediaProcessResultImpl(title, mimeType, mediaBuffer!, aspectRatio);
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
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]>;
  
  /**
   * returns if any of the media is a video.
   * @param media 
   */
  hasVideo(media: Media[])
}

/**
 * Processor factory that handles images and video.
 */
class DefaultMediaProcessorFactory implements MediaProcessorFactory {
  createProcessor(media: Media | Media[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]> {
    if (Array.isArray(media) && !this.hasVideo(media)) {
      return new InstagramImageProcessor(media, archiveFolder);
    }
    return new InstagramVideoProcessor(media as VideoMedia[], archiveFolder);
  }

  hasVideo(media: Media[]) {
    let hasVideo = false;
    for(const file of media) {
      const fileType: string = file.uri.substring(file.uri.lastIndexOf(".") + 1);
      const mimeType = getVideoMimeType(fileType);
      hasVideo = mimeType.includes('video/');
    }

    return hasVideo;
  }
}
