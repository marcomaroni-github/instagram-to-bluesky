import * as dotenv from "dotenv";
import FS from "fs";
import path from "path";
import * as process from "process";

import { BlueskyClient } from "./bluesky/bluesky";
import { logger } from "./logger/logger";
import { decodeUTF8, InstagramMediaProcessor } from "./media/media";
import { InstagramExportedPost } from "./media/InstagramExportedPost";
import {
  EmbeddedMedia,
  ImageEmbed,
  ImageEmbedImpl,
  ImagesEmbedImpl,
  VideoEmbedImpl,
} from "./bluesky/index";
import { BlobRef } from "@atproto/api";

dotenv.config();

const API_RATE_LIMIT_DELAY = 3000; // https://docs.bsky.app/docs/advanced-guides/rate-limits

/**
 * Returns the absolute path to the archive folder
 * @param TEST_VIDEO_MODE
 * @param TEST_IMAGE_MODE
 * @returns
 */
export function getArchiveFolder(
  TEST_VIDEO_MODE: boolean,
  TEST_IMAGE_MODE: boolean
) {
  const rootDir = path.resolve(__dirname, "..");

  if (TEST_VIDEO_MODE) return path.join(rootDir, "transfer/test_videos");
  if (TEST_IMAGE_MODE) return path.join(rootDir, "transfer/test_images");
  return process.env.ARCHIVE_FOLDER!;
}

/**
 * Validates test mode configuration
 * @throws Error if both test modes are enabled
 */
function validateTestConfig(
  TEST_VIDEO_MODE: boolean,
  TEST_IMAGE_MODE: boolean
) {
  if (TEST_VIDEO_MODE && TEST_IMAGE_MODE) {
    throw new Error(
      "Cannot enable both TEST_VIDEO_MODE and TEST_IMAGE_MODE simultaneously"
    );
  }
}

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
 *
 */
export async function main() {
  // Set environment variables within function scope, allows mocked unit testing.
  const SIMULATE = process.env.SIMULATE === "1";
  const TEST_VIDEO_MODE = process.env.TEST_VIDEO_MODE === "1";
  const TEST_IMAGE_MODE = process.env.TEST_IMAGE_MODE === "1";

  validateTestConfig(TEST_VIDEO_MODE, TEST_IMAGE_MODE);

  let MIN_DATE: Date | undefined = process.env.MIN_DATE
    ? new Date(process.env.MIN_DATE)
    : undefined;
  let MAX_DATE: Date | undefined = process.env.MAX_DATE
    ? new Date(process.env.MAX_DATE)
    : undefined;
  const archivalFolder = getArchiveFolder(TEST_VIDEO_MODE, TEST_IMAGE_MODE);

  // Log begining of import with a start date time to calculate the total time.
  const importStart: Date = new Date();
  logger.info(`Import started at ${importStart.toISOString()}`);
  logger.info({
    SourceFolder: archivalFolder,
    username: process.env.BLUESKY_USERNAME,
    MIN_DATE,
    MAX_DATE,
    SIMULATE,
  });

  // Setup BlueSky Client only used if SIMULATE is not configured.
  let bluesky: BlueskyClient | null = null;

  if (!SIMULATE) {
    logger.info("--- SIMULATE mode is disabled, posts will be imported ---");
    bluesky = new BlueskyClient(
      process.env.BLUESKY_USERNAME!,
      process.env.BLUESKY_PASSWORD!
    );
    await bluesky.login();
  } else {
    logger.warn("--- SIMULATE mode is enabled, no posts will be imported ---");
  }

  // Decide where to fetch post data to process from.
  let postsJsonPath: string;
  if (TEST_VIDEO_MODE || TEST_IMAGE_MODE) {
    // Use test post(s) to validate functionality with a test account.
    postsJsonPath = path.join(archivalFolder, "posts.json");
    logger.info(
      `--- TEST mode is enabled, using content from ${archivalFolder} ---`
    );
  } else {
    // Use real instagram exported posts.
    postsJsonPath = path.join(
      archivalFolder,
      "your_instagram_activity/content/posts_1.json"
    );
  }

  // Read instagram posts JSON file as raw buffer data.
  const fInstaPosts: Buffer = FS.readFileSync(postsJsonPath);

  // Decode raw JSON data into an object.
  const instaPosts: InstagramExportedPost[] = decodeUTF8(
    JSON.parse(fInstaPosts.toString())
  );

  // Initialize counters for posts and media imports.
  let importedPosts = 0;
  let importedMedia = 0;

  // Sort instagram posts by creation timestamp
  if (instaPosts && instaPosts.length > 0) {
    const sortedPosts = instaPosts.sort((a, b) => {
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
      if (MIN_DATE && checkDate && checkDate < MIN_DATE) {
        logger.warn(
          `Skipping post - Before MIN_DATE: [${checkDate.toUTCString()}]`
        );
        continue;
      }

      // If MAX_DATE configured validate the creation date is before the max date config.
      if (MAX_DATE && checkDate > MAX_DATE) {
        logger.warn(
          `Skipping post - After MAX_DATE [${checkDate.toUTCString()}]`
        );
        break;
      }
    }

    // Create media processor that can handle multiple data formats.
    const mediaProcessor = new InstagramMediaProcessor(
      instaPosts,
      archivalFolder
    );

    // Process posts with images and a video.
    const processedPosts = await mediaProcessor.process();

    for (const {
      postDate,
      postText,
      embeddedMedia,
      mediaCount,
    } of processedPosts) {
      // If the post does not have a creation date after processing skip.
      if (!postDate) {
        logger.warn("Skipping post - Invalid date");
        continue;
      }

      // If we are not simulating migration we create the post with the embedded media.
      if (!SIMULATE && bluesky) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_RATE_LIMIT_DELAY)
        );
        try {
          let uploadedMedia: EmbeddedMedia | undefined;

          if (embeddedMedia) {
            if (Array.isArray(embeddedMedia)) {
              const embeddedImages: ImageEmbed[] = [];
              for (const imageMedia of embeddedMedia) {
                const { mediaBuffer, mimeType } = imageMedia;

                const blobRef: BlobRef = await bluesky.uploadMedia(
                  mediaBuffer!,
                  mimeType!
                );
                embeddedImages.push(
                  new ImageEmbedImpl(postText, blobRef, mimeType!)
                );
              }

              uploadedMedia = new ImagesEmbedImpl(embeddedImages);
            } else {
              const { mediaBuffer, mimeType } = embeddedMedia;
              const blobRef = await bluesky.uploadMedia(
                mediaBuffer!,
                mimeType!
              );
              uploadedMedia = new VideoEmbedImpl(
                postText,
                mediaBuffer!,
                mimeType!,
                mediaBuffer?.length,
                blobRef,
                { width: 640, height: 640 }
              );
            }
          }

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

      // Add the total media posted to inform the user.
      importedMedia += mediaCount;
    }

    // If we are simulating the migration we want to inform the user the estimated time it may take.
    if (SIMULATE) {
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
