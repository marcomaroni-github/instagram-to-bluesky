/**
 * Represents posts_1.json data export from Instagram as of 2025/02/11.
 */
export interface InstagramExportedPost {
  media: Media[];
  title: string;
  creation_timestamp: number;
}

export type Media = ImageMedia | VideoMedia[];

interface BaseMedia {
  uri: string;
  creation_timestamp: number;
  media_metadata: MediaMetadata;
  title: string;
  cross_post_source: CrossPostSource;
  backup_uri: string;
}

export interface ImageMedia extends BaseMedia {}

export interface MediaMetadata {
  camera_metadata: CameraMetadata;
}

export interface CameraMetadata {
  has_camera_metadata: boolean;
}

export interface CrossPostSource {
  source_app: string;
}

export interface VideoMedia extends BaseMedia {
  dubbing_info: any[];
  media_variants: any[];
}
