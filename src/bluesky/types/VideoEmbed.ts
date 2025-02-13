import { AppBskyEmbedVideo, AppBskyEmbedDefs, BlobRef } from "@atproto/api";

export interface VideoEmbed extends AppBskyEmbedVideo.Main {
  $type: "app.bsky.embed.video";
  mimeType: string;
  video: BlobRef;
  captions?: AppBskyEmbedVideo.Caption[];
  alt?: string;
  aspectRatio?: AppBskyEmbedDefs.AspectRatio;
}

export class VideoEmbedImpl implements VideoEmbed {
  readonly $type = "app.bsky.embed.video";
  [k: string]: unknown;

  constructor(
    public alt: string | undefined,
    public mimeType: string,
    public video: BlobRef,
    public aspectRatio?: AppBskyEmbedDefs.AspectRatio,
    public captions?: AppBskyEmbedVideo.Caption[]
  ) {}

  toJSON() {
    return {
      $type: this.$type,
      alt: this.alt,
      mimeType: this.mimeType,
      video: this.video,
    };
  }
} 