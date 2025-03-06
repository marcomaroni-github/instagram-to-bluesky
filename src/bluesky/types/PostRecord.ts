import { AppBskyFeedPost, Facet } from "@atproto/api";

import { EmbeddedMedia } from "./EmbeddedMedia";

export interface PostRecord extends Partial<AppBskyFeedPost.Record> {}

export class PostRecordImpl implements PostRecord {
  readonly $type = "app.bsky.feed.post";
  [k: string]: unknown;

  constructor(
    public text: string,
    public createdAt: string,
    public facets: Facet[],
    public embed: EmbeddedMedia
  ) {}
} 