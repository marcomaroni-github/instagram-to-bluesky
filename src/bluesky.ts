import { AtpAgent, RichText } from '@atproto/api';
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

  async createPost(postDate: Date, postText: string, embeddedMedia: any[]): Promise<string | null> {
    const rt = new RichText({ text: postText });
    await rt.detectFacets(this.agent);

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

  private determineEmbed(embeddedMedia: any[]) {
    const video = embeddedMedia.find(media => media.$type === 'app.bsky.embed.video');
    if (video) {
      return { $type: 'app.bsky.embed.video', video };
    }
    if (embeddedMedia.length > 0) {
      return { $type: 'app.bsky.embed.images', images: embeddedMedia };
    }
    return undefined;
  }
} 