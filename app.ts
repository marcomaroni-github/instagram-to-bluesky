import * as dotenv from 'dotenv';
import FS from 'fs';
import { DateTime } from 'luxon';
import { pino } from 'pino';
import * as process from 'process';
import sharp from 'sharp';
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

import { AtpAgent, RichText } from '@atproto/api';

dotenv.config();

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
  level: process.env.LOG_LEVEL ?? 'info',
});

const agent = new AtpAgent({
  service: 'https://bsky.social',
});

const SIMULATE = process.env.SIMULATE === '1';
const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = '...';
const API_RATE_LIMIT_DELAY = 3000; // https://docs.bsky.app/docs/advanced-guides/rate-limits
const TEST_MODE = process.env.TEST_MODE === '1';

let MIN_DATE: Date | undefined = process.env.MIN_DATE
  ? new Date(process.env.MIN_DATE)
  : undefined;
let MAX_DATE: Date | undefined = process.env.MAX_DATE
  ? new Date(process.env.MAX_DATE)
  : undefined;

// Add interface for API error response
interface ApiError {
  response?: {
    data?: any;
    status?: number;
    headers?: any;
  };
  message?: string;
}

// Configure ffmpeg to use ffprobe
ffmpeg.setFfprobePath(ffprobe.path);

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
    TEST_MODE 
      ? './transfer/test_videos/posts.json'
      : `${process.env.ARCHIVE_FOLDER}/your_instagram_activity/content/posts_1.json`
  );
  const instaPosts = TEST_MODE
    ? decodeUTF8(JSON.parse(fInstaPosts.toString())).test_video_posts
    : decodeUTF8(JSON.parse(fInstaPosts.toString()));
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
      const { postDate, postText, embeddedMedia, mediaCount } = 
        await processPost(post);
      if( !postDate) {
        logger.warn('Skipping post - Invalid date');
        continue
      }

      if (!SIMULATE) {
        await new Promise((resolve) =>
          setTimeout(resolve, API_RATE_LIMIT_DELAY)
        );
        newPostURI = await createBlueskyPost(postDate, postText, embeddedMedia);
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
          embeddedMedia,
          Text:
            postText.length > 50 ? postText.substring(0, 50) + '...' : postText,
        },
        BS_Post: {
          message: 'Bluesky Post',
          Created: `${postDate.toISOString()}`,
          url: newPostURI,
          embeddedMedia,
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
  let postText = post.title ?? '';

  if (post.media?.length === 1) {
    postText = postText || post.media[0].title;
    postDate = postDate || new Date(post.media[0].creation_timestamp * 1000);
  }

  const embeddedMedia: any[] = [];
  let mediaCount = 0;

  // Check if first media is video
  const firstMedia = post.media[0];
  const fileType = firstMedia.uri.substring(firstMedia.uri.lastIndexOf('.') + 1);
  const mimeType = getMimeType(fileType);
  
  if (mimeType.startsWith('video/')) {
    const videoEmbed = await processVideoPost(post);
    if (videoEmbed) {
      embeddedMedia.push(videoEmbed);
      mediaCount = 1;
    }
    return { postDate, postText, embeddedMedia, mediaCount };
  }

  // Original image processing logic
  for (let j = 0; j < post.media.length; j++) {
    if (j >= MAX_IMAGES_PER_POST) {
      logger.warn(
        'Bluesky does not support more than 4 images per post, excess images will be discarded.'
      );
      break;
    }

    const { mediaText, mimeType, mediaBuffer, isVideo } = await processMedia(
      post.media[j]
    );
    if (!mimeType) continue;

    if (!SIMULATE) {
      try {
        const blobRecord = await agent.uploadBlob(mediaBuffer, {
          encoding: mimeType,
        });

        if (isVideo) {
          embeddedMedia.push({
            $type: 'app.bsky.embed.video',
            alt: mediaText,
            video: {
              ref: blobRecord.data.blob.ref,
              mimeType: blobRecord.data.blob.mimeType,
              size: blobRecord.data.blob.size,
            }
          });
          break; // Only one video per post is supported
        } else {
          const imageMeta = await sharp(mediaBuffer).metadata();
          embeddedMedia.push({
            alt: mediaText,
            image: {
              $type: 'blob',
              ref: blobRecord.data.blob.ref,
              mimeType: blobRecord.data.blob.mimeType,
              size: blobRecord.data.blob.size,
            },
            aspectRatio: {
              width: imageMeta.width,
              height: imageMeta.height
            }
          });
        }
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

  return { postDate, postText, embeddedMedia, mediaCount };
}

async function processMedia(media) {
  const mediaDate = new Date(media.creation_timestamp * 1000);
  const fileType = media.uri.substring(media.uri.lastIndexOf('.') + 1);
  const mimeType = getMimeType(fileType);
  const mediaFilename = TEST_MODE
    ? `./transfer/test_videos/${media.uri}`
    : `${process.env.ARCHIVE_FOLDER}/${media.uri}`;
  let mediaBuffer;

  try {
    mediaBuffer = FS.readFileSync(mediaFilename);
  } catch (error) {
    logger.error({
      message: `Failed to read media file: ${mediaFilename}`,
      error,
    });
    return { mediaText: '', mimeType: null, mediaBuffer: null, isVideo: false };
  }

  let mediaText = media.title ?? '';
  if (media.media_metadata?.photo_metadata?.exif_data?.length > 0) {
    const location = media.media_metadata.photo_metadata.exif_data[0];
    if (location.latitude > 0) {
      mediaText += `\nPhoto taken at these geographical coordinates: geo:${location.latitude},${location.longitude}`;
    }
  }

  const truncatedText =
    mediaText.length > 100 ? mediaText.substring(0, 100) + '...' : mediaText;

  const isVideo = mimeType.startsWith('video/');

  logger.info({
    message: 'Instagram Source Media',
    mimeType,
    mediaFilename,
    Created: `${mediaDate.toISOString()}`,
    Text: truncatedText.replace(/[\r\n]+/g, ' ') || 'No title',
    Type: isVideo ? 'Video' : 'Image',
  });

  return { mediaText: truncatedText, mimeType, mediaBuffer, isVideo };
}

function getMimeType(fileType) {
  switch (fileType.toLowerCase()) {
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'jpg':
      return 'image/jpeg';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    default:
      logger.warn('Unsupported file type ' + fileType);
      return '';
  }
}

function determineEmbed(embeddedMedia) {
  const video = embeddedMedia.find(media => media.$type === 'app.bsky.embed.video');
  if (video) {
    return { $type: 'app.bsky.embed.video', video };
  }
  if (embeddedMedia.length > 0) {
    return { $type: 'app.bsky.embed.images', images: embeddedMedia };
  }
  return undefined;
}

async function createBlueskyPost(postDate, postText, embeddedMedia) {
  const rt = new RichText({ text: postText });
  await rt.detectFacets(agent);

  const postRecord = {
    $type: 'app.bsky.feed.post',
    text: rt.text,
    facets: rt.facets,
    createdAt: postDate.toISOString(),
    embed: determineEmbed(embeddedMedia)
  };

  const recordData = await agent.post(postRecord);
  const i = recordData.uri.lastIndexOf('/');
  if (i > 0) {
    const rkey = recordData.uri.substring(i + 1);
    return `https://bsky.app/profile/${process.env.BLUESKY_USERNAME!}/post/${rkey}`;
  }
  logger.warn(recordData);
  return null;
}

function calculateEstimatedTime(importedMedia) {
  const minutes = Math.round(
    ((importedMedia * API_RATE_LIMIT_DELAY) / 1000 / 60) * 1.1
  );
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hours} hours and ${min} minutes`;
}

async function processVideoPost(post) {
  const { mediaText, mimeType, mediaBuffer, isVideo } = await processMedia(post.media[0]);
  if (!mimeType || !isVideo) {
    logger.warn('Invalid video file or not a video');
    return null;
  }

  if (!validateVideo(mediaBuffer)) {
    return null;
  }

  if (!SIMULATE) {
    try {
      // Write buffer to temporary file to get dimensions
      const tempFile = `./temp_${Date.now()}.mp4`;
      FS.writeFileSync(tempFile, mediaBuffer);
      
      // Get video dimensions using ffprobe
      const dimensions = await getVideoDimensions(tempFile);
      
      // Clean up temp file
      FS.unlinkSync(tempFile);

      logger.info({
        message: 'Attempting video upload',
        fileSize: mediaBuffer.length,
        mimeType,
        dimensions
      });

      // Get the user's DID first
      const profile = await agent.api.app.bsky.actor.getProfile({ actor: process.env.BLUESKY_USERNAME! });
      
      // Generate a random filename
      const filename = `${Math.random().toString(36).substring(2)}.mp4`;

      // Make direct request to video endpoint
      const response = await fetch('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?' + 
        new URLSearchParams({
          did: profile.data.did,
          name: filename
        }), {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'Authorization': `Bearer ${agent.session?.accessJwt}`,
        },
        body: mediaBuffer
      });

      if (!response.ok) {
        throw new Error(`Video upload failed: ${response.status} ${response.statusText}`);
      }

      const uploadData = await response.json();
      
      logger.info({
        message: 'Video upload response',
        response: uploadData
      });

      // Wait for video processing
      await waitForVideoProcessing(uploadData.jobId, profile.data.did);

      return {
        $type: 'app.bsky.embed.video',
        alt: mediaText,
        video: {
          $type: 'blob',
          ref: {
            $link: uploadData.ref
          },
          mimeType: mimeType,
          size: mediaBuffer.length,
        },
        aspectRatio: {
          width: dimensions.width ?? 640,
          height: dimensions.height ?? 640
        }
      };
    } catch (err) {
      // Type the error
      const error = err as ApiError;
      logger.error({
        message: 'Video upload failed',
        error: error.response?.data || error.message || 'Unknown error',
        status: error.response?.status,
        headers: error.response?.headers
      });
      return null;
    }
  }
  return null;
}

function validateVideo(buffer) {
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (buffer.length > MAX_SIZE) {
    logger.warn(`Video file too large: ${Math.round(buffer.length / 1024 / 1024)}MB (max ${MAX_SIZE / 1024 / 1024}MB)`);
    return false;
  }
  return true;
}

async function waitForVideoProcessing(jobId: string, did: string) {
  const maxAttempts = 10;
  const delayMs = 2000;
  
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`https://video.bsky.app/xrpc/app.bsky.video.getUploadStatus?did=${did}&jobId=${jobId}`);
    const status = await response.json();
    
    if (status.state === 'COMPLETE') {
      return status;
    }
    
    if (status.state === 'FAILED') {
      throw new Error('Video processing failed');
    }
    
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  throw new Error('Video processing timeout');
}

async function getVideoDimensions(filePath: string): Promise<{width: number, height: number}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      resolve({
        width: videoStream.width || 640,
        height: videoStream.height || 640
      });
    });
  });
}

main().catch((error) => {
  logger.error({ message: 'Error during import:', error });
});
