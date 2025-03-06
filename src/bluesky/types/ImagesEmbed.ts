import { AppBskyEmbedImages } from "@atproto/api";

import { ImageEmbed } from "./ImageEmbed";

export interface ImagesEmbed extends AppBskyEmbedImages.Main {
  $type: "app.bsky.embed.images";
  images: ImageEmbed[];
}

export class ImagesEmbedImpl implements ImagesEmbed {
  readonly $type = "app.bsky.embed.images";
  [k: string]: unknown;

  constructor(public images: ImageEmbed[]) {}
} 