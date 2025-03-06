import {
  AtpAgent,
  RichText,
  BlobRef
} from "@atproto/api";

import {
  EmbeddedMedia,
  PostRecordImpl
} from "./types";
import { logger } from "../logger/logger";



export class BlueskyClient {
  private readonly agent: AtpAgent;
  private readonly username: string;
  private readonly password: string;

  constructor(username: string, password: string) {
    this.agent = new AtpAgent({ service: "https://bsky.social" });
    this.username = username;
    this.password = password;
  }

  async login(): Promise<void> {
    logger.debug("Authenitcating with Bluesky atproto.");
    try {
      await this.agent.login({
        identifier: this.username,
        password: this.password,
      });
    } catch (error) {
      logger.error("Authentication error");
      throw error;
    }
  }

  /**
   * Upload media file (image or video) and get blob reference
   * @param buffer The media file buffer
   * @param mimeType The MIME type of the media (defaults to image/jpeg)
   */
  async uploadMedia(
    buffer: Buffer | Blob,
    mimeType: string = "image/jpeg"
  ): Promise<BlobRef> {
    try {
      const mediaType = mimeType.startsWith('video') ? 'video' : 'image';
      logger.debug(`Uploading ${mediaType}...`);
      
      const response = await this.agent.uploadBlob(buffer, {
        encoding: mimeType,
      });

      if (!response?.data?.blob) {
        throw new Error(`Failed to get ${mediaType} upload reference`);
      }

      return response.data.blob;
    } catch (error) {
      logger.error(`Failed to upload media with mimeType: ${mimeType}:`, error);
      throw error;
    }
  }

  /**
   * Creates a post on Bluesky.
   * @param postDate 
   * @param postText 
   * @param embeddedMedia 
   * @returns 
   */
  async createPost(
    postDate: Date,
    postText: string,
    embeddedMedia: EmbeddedMedia
  ): Promise<string | null> {
    try {
      const rt = new RichText({ text: postText });
      await rt.detectFacets(this.agent);

      // create blsky post record.
      const postRecord = new PostRecordImpl(
        rt.text,
        postDate.toISOString(),
        rt.facets!,
        embeddedMedia
      );

      const recordData = await this.agent.post(postRecord);
      const i = recordData.uri.lastIndexOf("/");
      if (i > 0) {
        const rkey = recordData.uri.substring(i + 1);
        return `https://bsky.app/profile/${this.username}/post/${rkey}`;
      }
      logger.warn(recordData);
      return null;
    } catch (error) {
      logger.error(`Failed to create post: ${error}`);
      return null;
    }
  }
}
