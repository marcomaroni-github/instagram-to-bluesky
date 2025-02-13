export interface MIMEType {
  /**
   * Determine the MIME type of the media file.
   */
  getMimeType(fileType: string): string;
} 