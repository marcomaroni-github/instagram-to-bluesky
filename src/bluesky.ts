import { AtpAgent, RichText, BlobRef } from "@atproto/api";
import { logger } from "./logger";

export interface VideoEmbed {
  $type: "app.bsky.embed.video";
  alt: string;
  buffer: Buffer;
  mimeType: string;
  size?: number;
  video?: {
    ref: BlobRef;
    mimeType: string;
    size: number;
  };
}

export interface VideoEmbedPost {
  $type: "app.bsky.embed.video";
  video: BlobRef;
  mimeType: string;
  size: number;
}

export interface ImageEmbed {
  $type: "app.bsky.embed.images#image";
  alt: string;
  image: Buffer | BlobRef;
  mimeType: string;
}

export class ImageEmbedImpl implements ImageEmbed {
  readonly $type = "app.bsky.embed.images#image";

  constructor(
    public alt: string,
    public image: Buffer | BlobRef,
    public mimeType: string
  ) {}

  toJSON() {
    return {
      $type: this.$type,
      alt: this.alt,
      image:
        this.image instanceof Buffer
          ? "[Buffer length=" + this.image.length + "]"
          : this.image,
    };
  }
}

export interface ImagesEmbed {
  $type: "app.bsky.embed.images";
  images: ImageEmbed[];
}

type EmbeddedMedia = VideoEmbed | ImageEmbed[] | ImagesEmbed;
type PostEmbed = VideoEmbedPost | ImagesEmbed;

export class VideoEmbedImpl implements VideoEmbed {
  readonly $type = "app.bsky.embed.video";

  constructor(
    public alt: string,
    public buffer: Buffer,
    public mimeType: string,
    public size?: number,
    public video?: {
      ref: BlobRef;
      mimeType: string;
      size: number;
    }
  ) {}

  toJSON() {
    return {
      $type: this.$type,
      alt: this.alt,
      buffer: "[Buffer length=" + this.buffer.length + "]",
      mimeType: this.mimeType,
      size: this.size,
      video: this.video
    };
  }
}

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
    buffer: Buffer,
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

  private determineEmbed(embeddedMedia: EmbeddedMedia): PostEmbed | undefined {
    if (!embeddedMedia) return undefined;

    // Handle video embed
    if (
      !Array.isArray(embeddedMedia) &&
      embeddedMedia.$type === "app.bsky.embed.video"
    ) {
      return {
        $type: "app.bsky.embed.video",
        video: embeddedMedia.video!.ref,
        mimeType: embeddedMedia.mimeType,
        size: embeddedMedia.video!.size,
      };
    }

    // Handle image embed(s)
    if (Array.isArray(embeddedMedia) && embeddedMedia.length > 0) {
      return {
        $type: "app.bsky.embed.images",
        images: embeddedMedia.map(
          (img) =>
            new ImageEmbedImpl(img.alt, img.image as BlobRef, img.mimeType)
        ),
      };
    }

    return undefined;
  }

  async createPost(
    postDate: Date,
    postText: string,
    embeddedMedia: any
  ): Promise<string | null> {
    try {
      // Handle image uploads if present
      if (Array.isArray(embeddedMedia)) {
        const uploadedImages = await Promise.all(
          embeddedMedia.map(async (media) => {
            const blob = await this.uploadImage(media.image, media.mimeType);
            return new ImageEmbedImpl(media.alt, blob, media.mimeType);
          })
        );

        embeddedMedia = {
          $type: "app.bsky.embed.images",
          images: uploadedImages,
        };
      } else if (embeddedMedia?.$type === "app.bsky.embed.video") {
        // Upload video first
        const blob = await this.uploadVideo(
          embeddedMedia.buffer,
          embeddedMedia.mimeType
        );
        embeddedMedia.video = {
          ref: blob,
          mimeType: embeddedMedia.mimeType,
          size: embeddedMedia.buffer.length,
        };
        // Now transform the embed
        embeddedMedia = this.determineEmbed(embeddedMedia);
      }

      const rt = new RichText({ text: postText });
      await rt.detectFacets(this.agent);

      const postRecord = {
        $type: "app.bsky.feed.post",
        text: rt.text,
        facets: rt.facets,
        createdAt: postDate.toISOString(),
        embed: embeddedMedia,
      };

      const recordData = await this.agent.post(postRecord);
      const i = recordData.uri.lastIndexOf("/");
      if (i > 0) {
        const rkey = recordData.uri.substring(i + 1);
        return `https://bsky.app/profile/${this.username}/post/${rkey}`;
      }
      logger.warn(recordData);
      return null;
    } catch (error) {
      logger.error("Failed to create post:", error);
      return null;
    }
  }
}
