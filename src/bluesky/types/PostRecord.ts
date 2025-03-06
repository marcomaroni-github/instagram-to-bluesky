import { AppBskyFeedPost, Facet } from "@atproto/api";

import { EmbeddedMedia } from "./EmbeddedMedia";

/**
 * Bluesky post
 * @see AppBskyFeedPost.Record
 */
export class PostRecordImpl implements Partial<AppBskyFeedPost.Record> {
  readonly $type = "app.bsky.feed.post";
  [k: string]: unknown;

  constructor(
    public text: string,
    public createdAt: string,
    public facets: Facet[],
    public embed: EmbeddedMedia
  ) {}
} 