/**
 * Social media data processed to be uploaded to Bluesky.
 */
export interface MediaProcessResult {
  mediaText: string;
  mimeType: string | null;
  mediaBuffer: Buffer | null;
  isVideo: boolean;
}

/**
 * Social media data processed to be uploaded to Bluesky.
 */
export class MediaProcessResultImpl implements MediaProcessResult {
  constructor(
    public mediaText: string,
    public mimeType: string | null,
    public mediaBuffer: Buffer | null,
    public isVideo: boolean
  ) {}

  toJSON() {
    return {
      mediaText: this.mediaText,
      mimeType: this.mimeType,
      mediaBuffer: this.mediaBuffer ? "[Buffer length=" + this.mediaBuffer.length + "]" : null,
      isVideo: this.isVideo
    };
  }
} 