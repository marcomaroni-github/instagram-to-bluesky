import * as dotenv from 'dotenv';
import FS from 'fs';
import { DateTime } from 'luxon';
import { pino } from 'pino';
import * as process from 'process';

import { AtpAgent, RichText } from '@atproto/api';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

dotenv.config();

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

const SIMULATE = process.env.SIMULATE === '1';
const TWITTER_HANDLE = process.env.TWITTER_HANDLE;
const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = '...';
const API_RATE_LIMIT_DELAY = 3000; // https://docs.bsky.app/docs/advanced-guides/rate-limits

let MIN_DATE: Date | undefined = process.env.MIN_DATE
  ? new Date(process.env.MIN_DATE)
  : undefined;
let MAX_DATE: Date | undefined = process.env.MAX_DATE
  ? new Date(process.env.MAX_DATE)
  : undefined;

function decodeUTF8(data: any): any {
  try {
    if (typeof data === 'string') {
      const utf8 = new TextEncoder().encode(data);
      return new TextDecoder('utf-8').decode(utf8);
    }

    if (Array.isArray(data)) {
      return data.map(decodeUTF8);
    }

    if (typeof data === 'object' && data !== null) {
      const obj: { [key: string]: any } = {};
      Object.entries(data).forEach(([key, value]) => {
        obj[key] = decodeUTF8(value);
      });
      return obj;
    }

    return data;
  } catch (error) {
    logger.error({ message: 'Error decoding UTF-8 data', error });
    return data;
  }
}

async function main() {
  logger.info(`Import started at ${new Date().toISOString()}`);
  logger.info({
    SourceFolder: process.env.ARCHIVE_FOLDER,
    username: process.env.BLUESKY_USERNAME,
    MIN_DATE,
    MAX_DATE,
    SIMULATE,
  });
  if (SIMULATE) {
    logger.warn('--- SIMULATE mode is enabled, no posts will be imported ---');
  } else {
    logger.info('--- SIMULATE mode is disabled, posts will be imported ---');
    await agent.login({
      identifier: process.env.BLUESKY_USERNAME!,
      password: process.env.BLUESKY_PASSWORD!,
    });
  }
  const fInstaPosts = FS.readFileSync(
    `${process.env.ARCHIVE_FOLDER}/your_instagram_activity/content/posts_1.json`
  );
  const instaPosts = decodeUTF8(JSON.parse(fInstaPosts.toString()));
  let importedPosts = 0;
  let importedMedia = 0;
  let newPostURI: string | null = '';

  if (instaPosts && instaPosts.length > 0) {
    const sortedPosts = instaPosts.sort((a, b) => {
      const ad = new Date(a.media[0].creation_timestamp * 1000).getTime();
      const bd = new Date(b.media[0].creation_timestamp * 1000).getTime();
      return ad - bd;
    });

    for (const post of sortedPosts) {
      let checkDate;
      if (post.creation_timestamp) {
        checkDate = new Date(post.creation_timestamp * 1000);
      } else if (post.media[0].creation_timestamp) {
        checkDate = new Date(post.media[0].creation_timestamp * 1000);
      } else {
        checkDate = undefined;
      }
      if (!checkDate) {
        logger.warn('Skipping post - No date');
        continue;
      }
      if (MIN_DATE && checkDate < MIN_DATE) {
        logger.warn(
          `Skipping post - Before MIN_DATE: [${DateTime.fromJSDate(
            checkDate
          ).toLocaleString(DateTime.DATE_MED)}]`
        );
        continue;
      }
      if (MAX_DATE && checkDate > MAX_DATE) {
        logger.warn('Skipping post - After MAX_DATE');
        break;
      }
      const { postDate, postText, embeddedImage, mediaCount } = 
        await processPost(post);

      if (!SIMULATE) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_RATE_LIMIT_DELAY)
        );
        newPostURI = await createBlueskyPost(postDate, postText, embeddedImage);
        if (newPostURI) {
          logger.info(`Bluesky post create with uri : ${newPostURI}`)
          importedPosts++;
        }
      } else {
        importedPosts++;
      }

      logger.debug({
        IG_Post: {
          message: 'Instagram Post',
          Created: `${postDate.toISOString()}`,
          embeddedImage,
          Text:
            postText.length > 50 ? postText.substring(0, 50) + '...' : postText,
        },
        BS_Post: {
          message: 'Bluesky Post',
          Created: `${postDate.toISOString()}`,
          url: newPostURI,
          embeddedImage,
          Text:
            postText.length > 50 ? postText.substring(0, 50) + '...' : postText,
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

async function processPost(post) {
  let postDate = post.creation_timestamp
    ? new Date(post.creation_timestamp * 1000)
    : undefined;
  let postText = post.title || '';

  if (post.media?.length === 1) {
    postText = postText || post.media[0].title;
    postDate = postDate || new Date(post.media[0].creation_timestamp * 1000);
  }

  const embeddedImage: any[] = [];
  let mediaCount = 0;

  for (let j = 0; j < post.media.length; j++) {
    if (j >= MAX_IMAGES_PER_POST) {
      logger.warn(
        'Bluesky does not support more than 4 images per post, excess images will be discarded.'
      );
      break;
    }

    const { mediaText, mimeType, imageBuffer } = await processMedia(
      post.media[j]
    );
    if (!mimeType) continue;

    if (!SIMULATE) {
      try {
        const blobRecord = await agent.uploadBlob(imageBuffer, {
          encoding: mimeType,
        });
        embeddedImage.push({
          alt: mediaText,
          image: {
            $type: 'blob',
            ref: blobRecord.data.blob.ref,
            mimeType: blobRecord.data.blob.mimeType,
            size: blobRecord.data.blob.size,
          },
        });
      } catch (error) {
        logger.error(`Failed to upload blob: ${error}`);
        continue;
      }
    }

    mediaCount++;
  }

  if (postText.length > POST_TEXT_LIMIT) {
    postText =
      postText.substring(
        0,
        POST_TEXT_LIMIT - POST_TEXT_TRUNCATE_SUFFIX.length
      ) + POST_TEXT_TRUNCATE_SUFFIX;
  }

  return { postDate, postText, embeddedImage, mediaCount };
}

async function processMedia(media) {
  const mediaDate = new Date(media.creation_timestamp * 1000);
  const fileType = media.uri.substring(media.uri.lastIndexOf('.') + 1);
  const mimeType = getMimeType(fileType);
  const mediaFilename = `${process.env.ARCHIVE_FOLDER}/${media.uri}`;
  let imageBuffer;

  try {
    imageBuffer = FS.readFileSync(mediaFilename);
  } catch (error) {
    logger.error({
      message: `Failed to read media file: ${mediaFilename}`,
      error,
    });
    return { mediaText: '', mimeType: null, imageBuffer: null };
  }

  let mediaText = media.title || '';
  if (media.media_metadata?.photo_metadata?.exif_data?.length > 0) {
    const location = media.media_metadata.photo_metadata.exif_data[0];
    if (location.latitude > 0) {
      mediaText += `\nPhoto taken at these geographical coordinates: geo:${location.latitude},${location.longitude}`;
    }
  }

  const truncatedText =
    mediaText.length > 100 ? mediaText.substring(0, 100) + '...' : mediaText;

  logger.info({
    message: 'Instagram Source Media',
    mimeType,
    mediaFilename,
    Created: `${mediaDate.toISOString()}`,
    Text: truncatedText.replace(/[\r\n]+/g, ' ') || 'No title',
  });

  return { mediaText: truncatedText, mimeType, imageBuffer };
}

function getMimeType(fileType) {
  switch (fileType) {
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'jpg':
      return 'image/jpeg';
    default:
      logger.warn('Unsupported image file type ' + fileType);
      return '';
  }
}

async function createBlueskyPost(postDate, postText, embeddedImage) {
  const rt = new RichText({ text: postText });
  await rt.detectFacets(agent);
  const postRecord = {
    $type: 'app.bsky.feed.post',
    text: rt.text,
    facets: rt.facets,
    createdAt: postDate.toISOString(),
    embed:
      embeddedImage.length > 0
        ? { $type: 'app.bsky.embed.images', images: embeddedImage }
        : undefined,
  };

  const recordData = await agent.post(postRecord);
  const i = recordData.uri.lastIndexOf('/');
  if (i > 0) {
    const rkey = recordData.uri.substring(i + 1);
    return `https://bsky.app/profile/${process.env
      .BLUESKY_USERNAME!}/post/${rkey}`;
  } else {
    logger.warn(recordData);
    return null;
  }
}

function calculateEstimatedTime(importedMedia) {
  const minutes = Math.round(
    ((importedMedia * API_RATE_LIMIT_DELAY) / 1000 / 60) * 1.1
  );
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hours} hours and ${min} minutes`;
}

main().catch((error) => {
  logger.error({ message: 'Error during import:', error });
});
