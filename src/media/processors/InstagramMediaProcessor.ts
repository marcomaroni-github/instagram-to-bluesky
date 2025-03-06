import { logger } from "../../logger/logger";
import { InstagramExportedPost, Media, ImageMedia, VideoMedia } from "../InstagramExportedPost";
import { DefaultMediaProcessorFactory } from "./DefaultMediaProcessorFactory";
import { InstagramPostProcessingStrategy } from "../interfaces/InstagramPostProcessingStrategy";
import { MediaProcessorFactory } from "../interfaces/MediaProcessorFactory";
import { ProcessedPost, ProcessedPostImpl } from "../ProcessedPost";

/**
 * @link https://docs.bsky.app/docs/advanced-guides/posts#:~:text=Each%20post%20contains%20up%20to,alt%20text%20and%20aspect%20ratio.
 * "Each post contains up to four images, and each image can have its own alt text and aspect ratio."
 */
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

  private isVideoMedia(media: Media): media is VideoMedia {
    return 'dubbing_info' in media;
  }

  private splitMediaByType(media: Media[]): { images: ImageMedia[], videos: VideoMedia[] } {
    logger.debug(`Starting to split ${media.length} media items by type`);
    
    const result = media.reduce((acc, curr) => {
      if (this.isVideoMedia(curr)) {
        acc.videos.push(curr);
      } else {
        acc.images.push(curr as ImageMedia);
      }
      return acc;
    }, { images: [] as ImageMedia[], videos: [] as VideoMedia[] });

    logger.debug({
      totalMedia: media.length,
      images: result.images.length,
      videos: result.videos.length
    }, 'Media split complete');

    return result;
  }

  private async createPostsFromMedia(
    originalPost: InstagramExportedPost,
    images: ImageMedia[],
    videos: VideoMedia[]
  ): Promise<ProcessedPost[]> {
    const postTitle = originalPost.title || originalPost.media[0]?.title || 'Untitled post';
    logger.debug({
      title: postTitle,
      imageCount: images.length,
      videoCount: videos.length,
      firstMediaUri: originalPost.media[0]?.uri
    }, 'Starting to create posts from media');

    const posts: ProcessedPost[] = [];
    const timestamp = originalPost.creation_timestamp || originalPost.media[0].creation_timestamp;
    const basePostDate = new Date(timestamp * 1000);
    
    // Split images into chunks of MAX_IMAGES_PER_POST
    const imageChunks: ImageMedia[][] = [];
    for (let i = 0; i < images.length; i += MAX_IMAGES_PER_POST) {
      imageChunks.push(images.slice(i, i + MAX_IMAGES_PER_POST));
    }

    // Calculate total number of posts
    const totalPosts = imageChunks.length + videos.length;
    logger.debug({
      title: postTitle,
      imageChunks: imageChunks.length,
      totalPosts,
      firstMediaUri: originalPost.media[0]?.uri
    }, 'Calculated post distribution');

    let currentPostNumber = 1;

    // Create posts for image chunks
    for (const imageChunk of imageChunks) {
      let title = originalPost.title ?? originalPost.media[0].title ?? "";
      
      // Calculate the suffix that will be added
      const suffix = totalPosts > 1 ? ` (Part ${currentPostNumber}/${totalPosts})` : "";
      
      // If we need to truncate, we need to account for the length of the suffix
      if (title.length + suffix.length > POST_TEXT_LIMIT) {
        const maxTitleLength = POST_TEXT_LIMIT - suffix.length - POST_TEXT_TRUNCATE_SUFFIX.length;
        title = title.substring(0, maxTitleLength) + POST_TEXT_TRUNCATE_SUFFIX;
      }
      
      // Add the suffix after truncation
      if (totalPosts > 1) {
        title += suffix;
      }

      // Add a small time offset for each post (1 second)
      const postDate = new Date(basePostDate.getTime() + (currentPostNumber - 1) * 1000);
      const post = new ProcessedPostImpl(postDate, title);
      const mediaProcessor = this.mediaProcessorFactory.createProcessor(
        imageChunk as ImageMedia[],
        this.archiveFolder
      );
      
      // Process media for this post
      post.embeddedMedia = await mediaProcessor.process();
      posts.push(post);

      logger.debug({
        title: postTitle,
        postNumber: currentPostNumber,
        totalPosts,
        type: 'image',
        imageCount: imageChunk.length,
        postDate: postDate.toISOString(),
        mediaUris: imageChunk.map(img => img.uri)
      }, 'Created image post');

      currentPostNumber++;
    }

    // Create individual posts for each video
    for (const video of videos) {
      let title = originalPost.title ?? video.title ?? "";
      
      // Calculate the suffix that will be added
      const suffix = totalPosts > 1 ? ` (Part ${currentPostNumber}/${totalPosts})` : "";
      
      // If we need to truncate, we need to account for the length of the suffix
      if (title.length + suffix.length > POST_TEXT_LIMIT) {
        const maxTitleLength = POST_TEXT_LIMIT - suffix.length - POST_TEXT_TRUNCATE_SUFFIX.length;
        title = title.substring(0, maxTitleLength) + POST_TEXT_TRUNCATE_SUFFIX;
      }
      
      // Add the suffix after truncation
      if (totalPosts > 1) {
        title += suffix;
      }

      // Add a small time offset for each post (1 second)
      const postDate = new Date(basePostDate.getTime() + (currentPostNumber - 1) * 1000);
      const post = new ProcessedPostImpl(postDate, title);
      const mediaProcessor = this.mediaProcessorFactory.createProcessor(
        [video] as VideoMedia[],
        this.archiveFolder
      );
      
      // Process media for this post
      post.embeddedMedia = await mediaProcessor.process();
      posts.push(post);

      logger.debug({
        title: postTitle,
        postNumber: currentPostNumber,
        totalPosts,
        type: 'video',
        postDate: postDate.toISOString(),
        mediaUri: video.uri
      }, 'Created video post');

      currentPostNumber++;
    }

    logger.debug({
      title: postTitle,
      totalPostsCreated: posts.length,
      firstMediaUri: originalPost.media[0]?.uri
    }, 'Finished creating all posts for media');

    return posts;
  }

  /**
   * Processes Instagram posts and their associated media into a format
   * that can be easily mapped to Bluesky's requirements.
   * 
   * This method splits posts with mixed media into separate posts:
   * - Images are grouped into posts of up to 4 images
   * - Each video gets its own post
   * - Posts are numbered when split (e.g. "Title (1/4)")
   * 
   * @returns {Promise<ProcessedPost[]>} A promise that resolves to an array of ProcessedPost objects.
   */
  public async process(): Promise<ProcessedPost[]> {
    const allProcessedPosts: ProcessedPost[] = [];
    
    logger.debug(`Starting to process ${this.instagramPosts.length} Instagram posts`);
    
    for (const post of this.instagramPosts) {
      const postTitle = post.title || post.media[0]?.title || 'Untitled post';
      // Log the start of processing for this specific post
      logger.debug({
        title: postTitle,
        timestamp: post.creation_timestamp,
        mediaCount: Array.isArray(post.media) ? post.media.length : 1,
        firstMediaUri: post.media[0]?.uri
      }, 'Processing Instagram post');

      // Ensure media is always an array
      const mediaArray = Array.isArray(post.media) ? post.media : [post.media];
      
      // Split media by type
      const { images, videos } = this.splitMediaByType(mediaArray);
      
      // Create posts based on the split media
      const posts = await this.createPostsFromMedia(post, images, videos);
      allProcessedPosts.push(...posts);

      // Log completion of this post's processing
      logger.debug({
        title: postTitle,
        resultingPosts: posts.length,
        imageCount: images.length,
        videoCount: videos.length,
        firstMediaUri: post.media[0]?.uri
      }, 'Finished processing Instagram post');
    }

    logger.debug({
      totalInputPosts: this.instagramPosts.length,
      totalOutputPosts: allProcessedPosts.length
    }, 'Completed processing all Instagram posts');

    return allProcessedPosts;
  }
} 