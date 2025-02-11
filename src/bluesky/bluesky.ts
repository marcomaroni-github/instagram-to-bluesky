import {
  AtpAgent,
  RichText,
  BlobRef,
  AppBskyEmbedVideo,
  AppBskyEmbedImages,
} from "@atproto/api";

import { logger } from "../logger/logger";

import {
  ImageEmbed,
  EmbeddedMedia,
  ImageEmbedImpl,
  VideoEmbedImpl,
  ImagesEmbedImpl
} from "./types";


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
   * Upload video file and get blob reference
   */
  async uploadVideo(
    buffer: Buffer,
    mimeType: string = "video/mp4"
  ): Promise<BlobRef> {
    try {
      logger.debug("Starting video upload process...");
      const response = await this.agent.uploadBlob(buffer, {
        encoding: mimeType,
      });

      if (!response?.data?.blob) {
        throw new Error("Failed to get video upload reference");
      }

      return response.data.blob;
    } catch (error) {
      logger.error("Failed to upload video:", error);
      throw error;
    }
  }

  /**
   * Upload image file and get blob reference
   */
  async uploadImage(
    buffer: Buffer | Blob,
    mimeType: string = "image/jpeg"
  ): Promise<BlobRef> {
    try {
      logger.debug("Uploading image...");
      const response = await this.agent.uploadBlob(buffer, {
        encoding: mimeType,
      });

      if (!response?.data?.blob) {
        throw new Error("Failed to get image upload reference");
      }

      return response.data.blob;
    } catch (error) {
      logger.error("Failed to upload image:", error);
      throw error;
    }
  }

  async createPost(
    postDate: Date,
    postText: string,
    embeddedMedia: EmbeddedMedia
  ): Promise<string | null> {
    try {
      // Handle image uploads if present
      if (Array.isArray(embeddedMedia) && AppBskyEmbedImages.isImage(embeddedMedia[0])) {
        const imagesMedia: ImageEmbed[] = embeddedMedia;
        const uploadedImages = await Promise.all(
          imagesMedia.map(async (media) => {
            const blob = await this.uploadImage(
              media.image,
              media.mimeType
            );
            return new ImageEmbedImpl(
              media.alt,
              blob,
              media.mimeType,
              media.uploadData
            );
          })
        );

        embeddedMedia = new ImagesEmbedImpl(uploadedImages);
      } else if (AppBskyEmbedVideo.isMain(embeddedMedia)) {
        // Upload video first
        const videoBlobRef = await this.uploadVideo(
          embeddedMedia.buffer,
          embeddedMedia.mimeType
        );
        // Now transform the embed
        embeddedMedia = new VideoEmbedImpl(
          "",
          embeddedMedia.buffer,
          embeddedMedia.mimeType,
          embeddedMedia.size,
          videoBlobRef,
          embeddedMedia.aspectRatio,
          embeddedMedia.captions
        );
      }

      const rt = new RichText({ text: postText });
      await rt.detectFacets(this.agent);

      // create blsky post record.
      const postRecord = new PostRecord(
        rt.text,
        postDate.toISOString(),
        rt.facets,
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
