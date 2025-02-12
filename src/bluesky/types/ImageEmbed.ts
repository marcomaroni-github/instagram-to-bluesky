import { AppBskyEmbedImages, BlobRef } from "@atproto/api";


/**
 * Image uploaded to bluesky, containing BlobRef CID.
 */
export interface ImageEmbed extends AppBskyEmbedImages.Image {
  $type: "app.bsky.embed.images#image";
  alt: string;
  image: BlobRef;
  mimeType: string;
  uploadData?: Buffer | Blob;
}

/**
 * Image uploaded to bluesky, containing BlobRef CID.
 */
export class ImageEmbedImpl implements ImageEmbed {
  readonly $type = "app.bsky.embed.images#image";
  [k: string]: unknown;

  constructor(
    public alt: string,
    public image: BlobRef,
    public mimeType: string,
    public uploadData?: Buffer | Blob
  ) {}

  toJSON() {
    return {
      $type: this.$type,
      alt: this.alt,
      image: this.image,
    };
  }
} 