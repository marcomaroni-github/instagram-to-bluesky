import FS from 'fs';
import path from 'path';

import { BlobRef } from '@atproto/api';

import { BlueskyClient } from './bluesky/bluesky';
import {
    EmbeddedMedia, ImageEmbed, ImageEmbedImpl, ImagesEmbedImpl, VideoEmbedImpl
} from './bluesky/index';
import { AppConfig } from './config';
import { logger } from './logger/logger';
import { MediaProcessResult, VideoMediaProcessResultImpl } from './media';
import { InstagramExportedPost } from './media/InstagramExportedPost';
import { decodeUTF8, InstagramMediaProcessor } from './media/media';


const API_RATE_LIMIT_DELAY = 3000; // https://docs.bsky.app/docs/advanced-guides/rate-limits

export function formatDuration(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hours and ${remainingMinutes} minutes`;
}

export function calculateEstimatedTime(importedMedia: number): string {
  const estimatedMilliseconds = importedMedia * API_RATE_LIMIT_DELAY * 1.1;
  return formatDuration(estimatedMilliseconds);
}

/**
 * Uploads media files to Bluesky and creates appropriate embed objects
 * 
 * This function processes an array of media files of the same type (either all images or all videos)
 * and uploads them to Bluesky's servers. For images, it collects them into a single ImagesEmbed object.
 * For videos, it creates a VideoEmbed object. If mixed media types are provided, only the first type
 * encountered will be processed.
 * 
 * @param postText - The text content of the post to be associated with the media
 * @param embeddedMedia - Array of media objects to be processed and uploaded (should be same type)
 * @param bluesky - The BlueskyClient instance used for uploading media
 * 
 * @returns {Promise<{
 *   importedMediaCount: number, // Number of successfully uploaded media files
 *   uploadedMedia: EmbeddedMedia | undefined // The final embed object for the post
 * }>}
 * 
 * @throws Will log but not throw errors from failed media uploads
 * 
 * @example
 * const result = await uploadMedia(
 *   "My vacation photos",
 *   mediaArray,
 *   blueskyClient
 * );
 */
export async function uploadMediaAndEmbed(
  postText: string,
  embeddedMedia: MediaProcessResult[],
  bluesky: BlueskyClient
): Promise<{
  importedMediaCount: number;
  uploadedMedia: EmbeddedMedia | undefined;
}> {
  let uploadedMedia: EmbeddedMedia | undefined = undefined;
  let importedMedia = 0;
  const embeddedImages: ImageEmbed[] = [];

  for (const media of embeddedMedia) {
    try {
      if (media.getType() === "image") {
        const { mediaBuffer, mimeType } = media;

        const blobRef: BlobRef = await bluesky.uploadMedia(
          mediaBuffer!,
          mimeType!
        );
        embeddedImages.push(new ImageEmbedImpl(postText, blobRef, mimeType!));
        uploadedMedia = new ImagesEmbedImpl(embeddedImages);
      } else if (media.getType() === "video") {
        const { mediaBuffer, mimeType, aspectRatio } =
          media as VideoMediaProcessResultImpl;
        const blobRef = await bluesky.uploadMedia(mediaBuffer!, mimeType!);
        uploadedMedia = new VideoEmbedImpl(
          postText,
          mimeType!,
          blobRef,
          aspectRatio
        );
      }
      // Increment the imported media as each is uploaded incase a failure occcurs the user can see the descrepancy.
      importedMedia++;
    } catch (error) {
      logger.error(
        `Failed to upload media: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      // Continue with the next post even if this one failed
    }
  }

  return {
    importedMediaCount: importedMedia,
    uploadedMedia,
  };
}

/**
 *
 */
export async function main() {
  const config = AppConfig.fromEnv();
  config.validate();

  const archivalFolder = config.getArchiveFolder();

  // Log begining of import with a start date time to calculate the total time.
  const importStart: Date = new Date();
  logger.info(`Import started at ${importStart.toISOString()}`);
  logger.info({
    SourceFolder: archivalFolder,
    username: config.getBlueskyUsername(),
    MIN_DATE: config.getMinDate(),
    MAX_DATE: config.getMaxDate(),
    SIMULATE: config.isSimulateEnabled(),
  });

  // Setup BlueSky Client only used if SIMULATE is not configured.
  let bluesky: BlueskyClient | null = null;

  if (!config.isSimulateEnabled()) {
    logger.info("--- SIMULATE mode is disabled, posts will be imported ---");
    bluesky = new BlueskyClient(
      config.getBlueskyUsername(),
      config.getBlueskyPassword()
    );
    await bluesky.login();
  } else {
    logger.warn("--- SIMULATE mode is enabled, no posts will be imported ---");
  }

  // Decide where to fetch post data to process from.
  let postsJsonPath: string;
  if (config.isTestModeEnabled()) {
    postsJsonPath = path.join(archivalFolder, 'posts.json');
    logger.info(
      `--- TEST mode is enabled, using content from ${archivalFolder} ---`
    );
  } else {
    postsJsonPath = path.join(
      archivalFolder,
      'your_instagram_activity/content/posts_1.json'
    );
  }

  // Read instagram posts JSON file as raw buffer data.
  const instaPostsFileBuffer: Buffer = FS.readFileSync(postsJsonPath);

  // Decode raw JSON data into an object.
  const allInstaPosts: InstagramExportedPost[] = decodeUTF8(
    JSON.parse(instaPostsFileBuffer.toString())
  );

  // Initialize counters for posts and media.
  let importedPosts = 0;
  let importedMedia = 0;
  const instaPosts: InstagramExportedPost[] = [];

  // Sort instagram posts by creation timestamp
  if (allInstaPosts && allInstaPosts.length > 0) {
    const sortedPosts = allInstaPosts.sort((a, b) => {
      // Get the first posts media and compare timestamps.
      const ad = a.media[0].creation_timestamp;
      const bd = b.media[0].creation_timestamp;
      return ad - bd;
    });

    // Preprocess posts before transforming into a normalized format.
    for (const post of sortedPosts) {
      let checkDate: Date | undefined;
      if (post.creation_timestamp) {
        checkDate = new Date(post.creation_timestamp * 1000);
      } else if (post.media[0].creation_timestamp) {
        checkDate = new Date(post.media[0].creation_timestamp * 1000);
      } else {
        checkDate = undefined;
      }

      // Skip posts without a creation date.
      if (!checkDate) {
        logger.warn("Skipping post - No date");
        continue;
      }

      // If MIN_DATE configured validate the creation date is after the minimum date config.
      const minDate = config.getMinDate();
      if (minDate && checkDate && checkDate < minDate) {
        logger.warn(
          `Skipping post - Before MIN_DATE: [${checkDate.toUTCString()}]`
        );
        continue;
      }

      // If MAX_DATE configured validate the creation date is before the max date config.
      const maxDate = config.getMaxDate();
      if (maxDate && checkDate > maxDate) {
        logger.warn(
          `Skipping post - After MAX_DATE [${checkDate.toUTCString()}]`
        );
        break;
      }

      instaPosts.push(post);
    }

    // Create media processor that can handle multiple data formats.
    const mediaProcessor = new InstagramMediaProcessor(
      instaPosts,
      archivalFolder
    );

    // Process posts with images and a video.
    const processedPosts = await mediaProcessor.process();

    for (const { postDate, postText, embeddedMedia } of processedPosts) {
      // If the post does not have a creation date after processing skip.
      if (!postDate) {
        logger.warn("Skipping post - Invalid date");
        continue;
      }

      // If we are not simulating migration we create the post with the embedded media.
      if (!config.isSimulateEnabled() && bluesky) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_RATE_LIMIT_DELAY)
        );
        try {
          // Upload all the embedded media
          const { uploadedMedia, importedMediaCount } = await uploadMediaAndEmbed(
            postText,
            embeddedMedia,
            bluesky
          );
          // Added uploaded media to the counter.
          importedMedia += importedMediaCount;

          if (uploadedMedia) {
            // Create post with embedded pre-uploaded data.
            const postUrl = await bluesky.createPost(
              postDate,
              postText,
              uploadedMedia
            );

            // Log successful post creation
            if (postUrl) {
              logger.info(`Bluesky post created with url: ${postUrl}`);
              importedPosts++;
            }
          } else {
            logger.warn('No media uploaded! Check Error logs.');
          }
        } catch (error) {
          logger.error(
            `Failed to create Bluesky post: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
          // Continue with the next post even if this one failed
        }
      } else {
        // We are simulating the migration, incrementing posts to inform the user.
        importedPosts++;
      }

      // Log the migrated instragram post.
      logger.debug({
        IG_Post: {
          message: "Instagram Post",
          Created: postDate.toISOString(),
          embeddedMedia,
          Text:
            postText.length > 50 ? postText.substring(0, 50) + "..." : postText,
        },
      });
    }

    // If we are simulating the migration we want to inform the user the estimated time it may take.
    if (config.isSimulateEnabled()) {
      const estimatedTime = calculateEstimatedTime(importedMedia);
      logger.info(`Estimated time for real import: ${estimatedTime}`);
    }

    // Log the results for the user, end time, and the number of posts and media migrated.
    const importEnd: Date = new Date();
    logger.info(
      `Import finished at ${importEnd.toISOString()}, imported ${importedPosts} posts with ${importedMedia} media`
    );
    // Inform the user the total time it took to migrate.
    const totalTime = importEnd.getTime() - importStart.getTime();
    logger.info(`Total import time: ${formatDuration(totalTime)}`);
  }
}
