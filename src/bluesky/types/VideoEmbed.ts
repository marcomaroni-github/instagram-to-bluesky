import { AppBskyEmbedVideo, AppBskyEmbedDefs, BlobRef } from "@atproto/api";

export interface VideoEmbed extends AppBskyEmbedVideo.Main {
  $type: "app.bsky.embed.video";
  buffer: Buffer;
  mimeType: string;
  video: BlobRef;
  size?: number;
  captions?: AppBskyEmbedVideo.Caption[];
  alt?: string;
  aspectRatio?: AppBskyEmbedDefs.AspectRatio;
}

export class VideoEmbedImpl implements VideoEmbed {
  readonly $type = "app.bsky.embed.video";
  [k: string]: unknown;

  constructor(
    public alt: string | undefined,
    public buffer: Buffer,
    public mimeType: string,
    public size: number | undefined,
    public video: BlobRef,
    public aspectRatio?: AppBskyEmbedDefs.AspectRatio,
    public captions?: AppBskyEmbedVideo.Caption[]
  ) {}

  toJSON() {
    return {
      $type: this.$type,
      alt: this.alt,
      buffer: "[Buffer length=" + this.buffer.length + "]",
      mimeType: this.mimeType,
      size: this.size,
      video: this.video,
    };
  }
} 