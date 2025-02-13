import { logger } from "../../logger/logger";
import { VideoMediaProcessingStrategy } from "../interfaces/VideoMediaProcessingStrategy";
import { VideoMedia } from "../InstagramExportedPost";
import { MediaProcessResult, VideoMediaProcessResultImpl } from "../MediaProcessResult";
import { getVideoDimensions, getMimeType as getVideoMimeType, validateVideo } from "../../video/video";
import { getMediaBuffer } from "../utils";

const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

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