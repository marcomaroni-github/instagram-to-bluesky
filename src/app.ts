import * as dotenv from "dotenv";
import FS from "fs";
import * as process from "process";
import { logger } from "./logger";
import { BlueskyClient } from "./bluesky";
import { processPost } from "./media";
import { prepareVideoUpload, createVideoEmbed } from "./video";
import path from 'path';

dotenv.config();

const API_RATE_LIMIT_DELAY = 3000; // https://docs.bsky.app/docs/advanced-guides/rate-limits

function decodeUTF8(data: any): any {
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
 * Returns the absolute path to the archive folder
 * @param TEST_VIDEO_MODE 
 * @param TEST_IMAGE_MODE 
 * @returns 
 */
export function getArchiveFolder(TEST_VIDEO_MODE: boolean, TEST_IMAGE_MODE: boolean) {
  const rootDir = path.resolve(__dirname, '..');
  
  if (TEST_VIDEO_MODE) return path.join(rootDir, 'transfer/test_videos');
  if (TEST_IMAGE_MODE) return path.join(rootDir, 'transfer/test_images');
  return path.join(rootDir, process.env.ARCHIVE_FOLDER!);
}

async function processVideoPost(
  filePath: string,
  buffer: Buffer,
  bluesky: BlueskyClient | null,
  simulate: boolean
) {
  try {
    if (!buffer) {
      throw new Error("Video buffer is undefined");
    }

    logger.debug({
      message: "Processing video",
      fileSize: buffer.length,
      filePath,
    });

    // Prepare video metadata
    const videoData = await prepareVideoUpload(filePath, buffer);

    // Upload video to get CID
    if (!simulate && bluesky) {
      const blob = await bluesky.uploadVideo(buffer);
      if (!blob?.ref?.$link) {
        throw new Error("Failed to get video upload reference");
      }
      videoData.ref = blob.ref.$link;
    }

    // TODO determine if this logic is obsolete now.
    // Create video embed structure
    const videoEmbed = createVideoEmbed(videoData);

    return videoEmbed;
  } catch (error) {
    logger.error("Failed to process video:", error);
    throw error;
  }
}

/**
 * Validates test mode configuration
 * @throws Error if both test modes are enabled
 */
function validateTestConfig(TEST_VIDEO_MODE: boolean, TEST_IMAGE_MODE: boolean) {
  if (TEST_VIDEO_MODE && TEST_IMAGE_MODE) {
    throw new Error('Cannot enable both TEST_VIDEO_MODE and TEST_IMAGE_MODE simultaneously');
  }
}

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

  logger.info(`Import started at ${new Date().toISOString()}`);
  logger.info({
    SourceFolder: archivalFolder,
    username: process.env.BLUESKY_USERNAME,
    MIN_DATE,
    MAX_DATE,
    SIMULATE,
  });

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

  let postsJsonPath: string;
  if (TEST_VIDEO_MODE || TEST_IMAGE_MODE) {
    postsJsonPath = path.join(archivalFolder, 'posts.json');
    logger.info(`--- TEST mode is enabled, using content from ${archivalFolder} ---`);
  } else {
    postsJsonPath = path.join(archivalFolder, 'your_instagram_activity/content/posts_1.json');
  }

  const fInstaPosts = FS.readFileSync(postsJsonPath);

  const instaPosts = decodeUTF8(JSON.parse(fInstaPosts.toString()));

  let importedPosts = 0;
  let importedMedia = 0;

  if (TEST_VIDEO_MODE || TEST_IMAGE_MODE) {
    logger.info("--- TEST mode is enabled, skipping video processing ---");
  }

  if (instaPosts && instaPosts.length > 0) {
    const sortedPosts = instaPosts.sort((a, b) => {
      const ad = new Date(a.media[0].creation_timestamp * 1000).getTime();
      const bd = new Date(b.media[0].creation_timestamp * 1000).getTime();
      return ad - bd;
    });

    for (const post of sortedPosts) {
      let checkDate: Date | undefined;
      if (post.creation_timestamp) {
        checkDate = new Date(post.creation_timestamp * 1000);
      } else if (post.media[0].creation_timestamp) {
        checkDate = new Date(post.media[0].creation_timestamp * 1000);
      } else {
        checkDate = undefined;
      }

      if (!checkDate) {
        logger.warn("Skipping post - No date");
        continue;
      }

      if (MIN_DATE && checkDate && checkDate < MIN_DATE) {
        logger.warn(
          `Skipping post - Before MIN_DATE: [${checkDate.toUTCString()}]`
        );
        continue;
      }

      if (MAX_DATE && checkDate > MAX_DATE) {
        logger.warn(
          `Skipping post - After MAX_DATE [${checkDate.toUTCString()}]`
        );
        break;
      }

      const {
        postDate,
        postText,
        mediaCount,
        embeddedMedia: initialMedia,
      } = await processPost(post, archivalFolder);
      let embeddedMedia: any = initialMedia;

      logger.debug({
        message: "Processing post media",
        mediaType: post.media[0].type,
        initialMediaPresent: !!initialMedia,
        mediaCount,
      });

      // Handle video if present
      if (post.media[0].type === "Video") {
        try {
          const videoEmbed = await processVideoPost(
            post.media[0].media_url,
            post.media[0].buffer,
            bluesky,
            SIMULATE
          );
          embeddedMedia = videoEmbed;
          logger.debug({
            message: "Video processing complete",
            hasVideoEmbed: !!videoEmbed,
          });
        } catch (error) {
          logger.error("Failed to process video:", error);
          continue; // Skip this post if video processing fails
        }
      } else {
        logger.debug({
          message: "Using photo media from processPost",
          mediaType: "photo",
          embeddedMediaLength: Array.isArray(embeddedMedia)
            ? embeddedMedia.length
            : 0,
        });
      }

      if (!postDate) {
        logger.warn("Skipping post - Invalid date");
        continue;
      }

      if (!SIMULATE && bluesky) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_RATE_LIMIT_DELAY)
        );
        try {
          const postUrl = await bluesky.createPost(
            postDate,
            postText,
            embeddedMedia
          );

          if (postUrl) {
            logger.info(`Bluesky post created with url: ${postUrl}`);
            importedPosts++;
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
        importedPosts++;
      }

      logger.debug({
        IG_Post: {
          message: "Instagram Post",
          Created: postDate.toISOString(),
          embeddedMedia,
          Text:
            postText.length > 50 ? postText.substring(0, 50) + "..." : postText,
        },
      });

      importedMedia += mediaCount;
    }
  }

  if (SIMULATE) {
    const estimatedTime = calculateEstimatedTime(importedMedia);
    logger.info(`Estimated time for real import: ${estimatedTime}`);
  }

  logger.info(
    `Import finished at ${new Date().toISOString()}, imported ${importedPosts} posts with ${importedMedia} media`
  );
}

function calculateEstimatedTime(importedMedia: number): string {
  const minutes = Math.round(
    ((importedMedia * API_RATE_LIMIT_DELAY) / 1000 / 60) * 1.1
  );
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hours} hours and ${min} minutes`;
}
