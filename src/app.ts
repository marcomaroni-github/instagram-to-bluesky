import * as dotenv from "dotenv";
import FS from "fs";
import * as process from "process";
import { logger } from "./logger";
import { BlueskyClient } from "./bluesky";
import { processPost } from "./media";
import { prepareVideoUpload, createVideoEmbed } from './video';

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

async function processVideoPost(filePath: string, buffer: Buffer) {
  try {
    // Prepare video metadata
    const videoData = await prepareVideoUpload(filePath, buffer);
    
    // Upload video to get CID (this would be handled by your BlueskyClient)
    // videoData.ref = await bluesky.uploadVideo(buffer);
    
    // Create video embed structure
    const videoEmbed = createVideoEmbed(videoData);
    
    return videoEmbed;
  } catch (error) {
    logger.error('Failed to process video:', error);
    throw error;
  }
}

export async function main() {
  // Set environment variables within function scope, allows mocked unit testing.
  const SIMULATE = process.env.SIMULATE === "1";
  const TEST_MODE = process.env.TEST_MODE === "1";
  let MIN_DATE: Date | undefined = process.env.MIN_DATE
    ? new Date(process.env.MIN_DATE)
    : undefined;
  let MAX_DATE: Date | undefined = process.env.MAX_DATE
    ? new Date(process.env.MAX_DATE)
    : undefined;

  logger.info(`Import started at ${new Date().toISOString()}`);
  logger.info({
    SourceFolder: process.env.ARCHIVE_FOLDER,
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

  const fInstaPosts = FS.readFileSync(
    TEST_MODE
      ? "./transfer/test_videos/posts.json"
      : `${process.env.ARCHIVE_FOLDER}/your_instagram_activity/content/posts_1.json`
  );

  const instaPosts = decodeUTF8(JSON.parse(fInstaPosts.toString()));

  let importedPosts = 0;
  let importedMedia = 0;

  if (TEST_MODE) {
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

      const { postDate, postText, mediaCount } = await processPost(
        post,
        process.env.ARCHIVE_FOLDER!,
        TEST_MODE,
        SIMULATE
      );
      let { embeddedMedia } = await processPost(
        post,
        process.env.ARCHIVE_FOLDER!,
        TEST_MODE,
        SIMULATE
      );

      if (!postDate) {
        logger.warn("Skipping post - Invalid date");
        continue;
      }

      if (post.media[0].type === 'Video') {
        embeddedMedia = await processVideoPost(post.media[0].media_url, post.media[0].video_buffer);
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
