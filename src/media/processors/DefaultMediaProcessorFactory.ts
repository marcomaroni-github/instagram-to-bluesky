import { Media, VideoMedia, ImageMedia } from "../InstagramExportedPost";
import { MediaProcessResult } from "../MediaProcessResult";
import { InstagramImageProcessor } from "./InstagramImageProcessor";
import { InstagramVideoProcessor } from "./InstagramVideoProcessor";
import { getMimeType as getVideoMimeType } from "../../video/video";
import { MediaProcessorFactory } from "../interfaces/MediaProcessorFactory";
import { ProcessStrategy } from "../interfaces/ProcessStrategy";

/**
 * Processor factory that handles images and video.
 */
export class DefaultMediaProcessorFactory implements MediaProcessorFactory {
  createProcessor(media: ImageMedia[] | VideoMedia[], archiveFolder: string): ProcessStrategy<MediaProcessResult[]> {
    if (!this.hasVideo(media)) {
      return new InstagramImageProcessor(media as ImageMedia[], archiveFolder);
    }
    return new InstagramVideoProcessor(media as VideoMedia[], archiveFolder);
  }

  hasVideo(media: Media[]) {
    let hasVideo = false;
    for(const file of media) {
      const fileType: string = file.uri.substring(file.uri.lastIndexOf(".") + 1);
      const mimeType = getVideoMimeType(fileType);
      hasVideo = mimeType.includes('video/');
    }

    return hasVideo;
  }
} 