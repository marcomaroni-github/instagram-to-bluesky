import { AtpAgent, RichText, BlobRef } from '@atproto/api';
import { logger } from './logger';

export class BlueskyClient {
  private agent: AtpAgent;
  private username: string;
  private password: string;

  constructor(username: string, password: string) {
    this.agent = new AtpAgent({ service: 'https://bsky.social' });
    this.username = username;
    this.password = password;
  }

  async login(): Promise<void> {
    await this.agent.login({
      identifier: this.username,
      password: this.password,
    });
  }

  /**
   * Upload video file and get blob reference
   */
  async uploadVideo(buffer: Buffer, mimeType: string = 'video/mp4'): Promise<BlobRef> {
    try {
      logger.debug('Uploading video file...');
      const response = await this.agent.uploadBlob(buffer, { encoding: mimeType });
      logger.debug(`Video uploaded with blob: ${response.data.blob.ref.$link}`);
      return response.data.blob;
    } catch (error) {
      logger.error('Failed to upload video:', error);
      throw error;
    }
  }

  async createPost(postDate: Date, postText: string, embeddedMedia: any): Promise<string | null> {
    const rt = new RichText({ text: postText });
    await rt.detectFacets(this.agent);

    // If there's a video in embeddedMedia, upload it first
    if (embeddedMedia && !Array.isArray(embeddedMedia) && embeddedMedia.$type === 'app.bsky.embed.video') {
      try {
        // Upload the video if ref is empty (not yet uploaded)
        if (!embeddedMedia.video.ref.$link) {
          const videoBlob = await this.uploadVideo(
            embeddedMedia.video.buffer,
            embeddedMedia.video.mimeType
          );
          // Update the ref with the uploaded blob link
          embeddedMedia.video.ref.$link = videoBlob.ref.$link;
        }
      } catch (error) {
        logger.error('Failed to process video for post:', error);
        return null;
      }
    }

    const postRecord = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: postDate.toISOString(),
      embed: this.determineEmbed(embeddedMedia)
    };

    try {
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

  private determineEmbed(embeddedMedia: any) {
    if (!embeddedMedia) return undefined;

    // Handle video embed
    if (embeddedMedia.$type === 'app.bsky.embed.video') {
      return {
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: embeddedMedia.video.ref,
          mimeType: embeddedMedia.video.mimeType,
          size: embeddedMedia.video.size
        },
        aspectRatio: embeddedMedia.aspectRatio
      };
    }

    // Handle image embed(s)
    if (Array.isArray(embeddedMedia) && embeddedMedia.length > 0) {
      return { $type: 'app.bsky.embed.images', images: embeddedMedia };
    }

    return undefined;
  }
} 