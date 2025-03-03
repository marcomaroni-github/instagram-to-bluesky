import { logger } from "../../logger/logger";
import { ProcessedPost, ProcessedPostImpl } from "../ProcessedPost";
import { InstagramExportedPost, Media } from "../InstagramExportedPost";
import { InstagramPostProcessingStrategy } from "../interfaces/InstagramPostProcessingStrategy";
import { MediaProcessorFactory } from "../interfaces/MediaProcessorFactory";
import { DefaultMediaProcessorFactory } from "./DefaultMediaProcessorFactory";

const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";

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