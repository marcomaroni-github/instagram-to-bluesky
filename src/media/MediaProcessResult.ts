/**
 * Social media data processed to be uploaded to Bluesky.
 */
export interface MediaProcessResult {
  mediaText: string;
  mimeType: string | null;
  mediaBuffer: Buffer | null;
  // Solution since instanceof did not work.
  getType(): 'video' | 'image';
}

/**
 * Social media image processed to be uploaded to Bluesky.
 */
export class ImageMediaProcessResultImpl implements MediaProcessResult {
  constructor(
    public mediaText: string,
    public mimeType: string | null,
    public mediaBuffer: Buffer | null
  ) {}

  toJSON() {
    return {
      mediaText: this.mediaText,
      mimeType: this.mimeType,
      mediaBuffer: this.mediaBuffer ? "[Buffer length=" + this.mediaBuffer.length + "]" : null,
    };
  }

  getType(): 'image'{
    return 'image';
  }
} 


/**
 * Social media video processed to be uploaded to Bluesky.
 */
export class VideoMediaProcessResultImpl implements MediaProcessResult {
  constructor(
    public mediaText: string,
    public mimeType: string | null,
    public mediaBuffer: Buffer | null
  ) {}

  toJSON() {
    return {
      mediaText: this.mediaText,
      mimeType: this.mimeType,
      mediaBuffer: this.mediaBuffer ? "[Buffer length=" + this.mediaBuffer.length + "]" : null,
    };
  }

  getType(): 'video'{
    return 'video';
  }
} 