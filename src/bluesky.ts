import { AtpAgent, RichText, BlobRef } from '@atproto/api';
import { logger } from './logger';

export interface VideoEmbed {
  $type: 'app.bsky.embed.video';
  alt: string;
  buffer: Buffer;
  mimeType: string;
  aspectRatio?: { width: number; height: number };
  video?: {
    ref: BlobRef;
    mimeType: string;
    size: number;
  };
}

export interface ImageEmbed {
  $type: 'app.bsky.embed.images#image';
  alt: string;
  image: Buffer | BlobRef;
  mimeType: string;
}

export interface ImagesEmbed {
  $type: 'app.bsky.embed.images';
  images: ImageEmbed[];
}

type EmbeddedMedia = VideoEmbed | ImageEmbed[] | ImagesEmbed;

export class BlueskyClient {
  private readonly agent: AtpAgent;
  private readonly username: string;
  private readonly password: string;

  constructor(username: string, password: string) {
    this.agent = new AtpAgent({ service: 'https://bsky.social' });
    this.username = username;
    this.password = password;
  }

  async login(): Promise<void> {
    logger.debug('Authenitcating with Bluesky atproto.');
    try {
      await this.agent.login({
        identifier: this.username,
        password: this.password,
      });
    } catch(error) {
      logger.error('Authentication error');
      throw error;
    }
  }

  /**
   * Upload video file and get blob reference
   */
  async uploadVideo(buffer: Buffer, mimeType: 'video/mp4' = 'video/mp4'): Promise<BlobRef> {
    try {
      logger.debug('Starting video upload process...');
      
      // Step 1: Upload video and get job ID
      const uploadResponse = await this.agent.api.app.bsky.video.uploadVideo(buffer, {
        encoding: mimeType,
        headers: {
          'Content-Type': mimeType
        }
      });

      if (!uploadResponse?.data?.jobStatus?.jobId) {
        throw new Error('Failed to get job ID from video upload');
      }

      const jobId = uploadResponse.data.jobStatus.jobId;
      logger.debug(`Video upload started with job ID: ${jobId}`);

      // Step 2: Poll job status until complete
      const maxAttempts = 30; // 5 minutes max (10 second intervals)
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        const statusResponse = await this.agent.api.app.bsky.video.getJobStatus({
          jobId: jobId
        });

        const status = statusResponse.data.jobStatus;

        if (status.state === 'JOB_STATE_COMPLETED' && status.blob) {
          logger.debug(`Video upload completed with blob: ${status.blob}`);
          return status.blob;
        }

        if (status.state === 'JOB_STATE_FAILED') {
          throw new Error(`Video upload failed: ${status.error || 'Unknown error'}`);
        }

        // Wait 10 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 10000));
        attempts++;
      }

      throw new Error('Video upload timed out');
    } catch (error) {
      logger.error('Failed to upload video:', error);
      throw error;
    }
  }

  /**
   * Upload image file and get blob reference
   */
  async uploadImage(buffer: Buffer, mimeType: string = 'image/jpeg'): Promise<BlobRef> {
    try {
      logger.debug('Uploading image...');
      const response = await this.agent.uploadBlob(buffer, { encoding: mimeType });
      
      if (!response?.data?.blob) {
        throw new Error('Failed to get image upload reference');
      }

      return response.data.blob;
    } catch (error) {
      logger.error('Failed to upload image:', error);
      throw error;
    }
  }

  private determineEmbed(embeddedMedia: EmbeddedMedia) {
    if (!embeddedMedia) return undefined;

    // Handle video embed
    if (!Array.isArray(embeddedMedia) && embeddedMedia.$type === 'app.bsky.embed.video') {
      return {
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: embeddedMedia.video!.ref,
          mimeType: embeddedMedia.mimeType,
          size: embeddedMedia.video!.size
        },
        aspectRatio: embeddedMedia.aspectRatio
      };
    }

    // Handle image embed(s)
    if (Array.isArray(embeddedMedia) && embeddedMedia.length > 0) {
      return {
        $type: 'app.bsky.embed.images',
        images: embeddedMedia.map(img => ({
          $type: 'app.bsky.embed.images#image',
          alt: img.alt,
          image: img.image as BlobRef // At this point it should be a BlobRef
        }))
      };
    }

    return undefined;
  }

  async createPost(postDate: Date, postText: string, embeddedMedia: EmbeddedMedia): Promise<string | null> {
    try {
      // Handle image uploads if present
      if (Array.isArray(embeddedMedia)) {
        const uploadedImages = await Promise.all(
          embeddedMedia.map(async (media: ImageEmbed) => {
            const blob = await this.uploadImage(media.image as Buffer, media.mimeType);
            return {
              $type: 'app.bsky.embed.images#image',
              alt: media.alt,
              image: blob
            };
          })
        );
        
        embeddedMedia = {
          $type: 'app.bsky.embed.images',
          images: uploadedImages
        } as ImagesEmbed;
      }

      const rt = new RichText({ text: postText });
      await rt.detectFacets(this.agent);

      const postRecord = {
        $type: 'app.bsky.feed.post',
        text: rt.text,
        facets: rt.facets,
        createdAt: postDate.toISOString(),
        embed: this.determineEmbed(embeddedMedia)
      };

      const recordData = await this.agent.post(postRecord);
      const i = recordData.uri.lastIndexOf('/');
      if (i > 0) {
        const rkey = recordData.uri.substring(i + 1);
        return `https://bsky.app/profile/${this.username}/post/${rkey}`;
      }
      logger.warn(recordData);
      return null;
    } catch (error) {
      logger.error('Failed to create post:', error);
      return null;
    }
  }
} 