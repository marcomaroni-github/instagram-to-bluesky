import fs from "fs";

import { InstagramImageProcessor, InstagramMediaProcessor, InstagramVideoProcessor } from "./media";
import { InstagramExportedPost, VideoMedia, ImageMedia } from "./InstagramExportedPost";

// Mock the file system
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock the logger
jest.mock("../logger/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the video validation
jest.mock("../video/video", () => ({
  validateVideo: jest.fn().mockReturnValue(false)
}));

describe("Instagram Media Processing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
  });

  describe("InstagramMediaProcessor", () => {
    const mockArchiveFolder = "/test/archive";
    
    test("should process a post with multiple images", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Post",
        media: [
          {
            uri: "photo1.jpg",
            title: "Image 1",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup1.jpg",
          },
          {
            uri: "photo2.jpg",
            title: "Image 2",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup2.jpg",
          },
        ] as ImageMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText).toBe("Test Post");
      expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
      expect(result[0].embeddedMedia).toHaveLength(2);
    });

    test("should process a post with a single video", async () => {
      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Video Post",
        media: {
          uri: "video.mp4",
          title: "Test Video",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup_video.mp4",
          dubbing_info: [],
          media_variants: [],
        } as VideoMedia,
      };

      const processor = new InstagramMediaProcessor([mockPost], mockArchiveFolder);
      const result = await processor.process();

      expect(result).toHaveLength(1);
      expect(result[0].postText).toBe("Test Video Post");
      expect(Array.isArray(result[0].embeddedMedia)).toBe(false);
    });
  });

  describe("InstagramImageProcessor", () => {
    test("should process multiple images", async () => {
      const mockImages: ImageMedia[] = [
        {
          uri: "photo1.jpg",
          title: "Image 1",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup1.jpg",
        },
        {
          uri: "photo2.jpg",
          title: "Image 2",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup2.jpg",
        },
      ];

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      const result = await processor.process();

      expect(result).toHaveLength(2);
      expect(result[0].mimeType).toBe("image/jpeg");
      expect(result[1].mimeType).toBe("image/jpeg");
    });

    test("should handle unsupported image types", async () => {
      const mockImages: ImageMedia[] = [{
        uri: "photo.xyz",
        title: "Invalid Image",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_invalid.jpg",
      }];

      const processor = new InstagramImageProcessor(mockImages, "/test/archive");
      
      await expect(processor.process()).rejects.toThrow("Unsupported file type");
    });
  });

  describe("InstagramVideoProcessor", () => {
    test("should process a video", async () => {
      const mockVideo: VideoMedia = {
        uri: "video.mp4",
        title: "Test Video",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_video.mp4",
        dubbing_info: [],
        media_variants: [],
      };

      const processor = new InstagramVideoProcessor(mockVideo, "/test/archive");
      const result = await processor.process();

      expect(result.mimeType).toBe("video/mp4");
      expect(result.mediaText).toBe("Test Video");
    });

    test("should handle unsupported video types", async () => {
      const mockVideo: VideoMedia = {
        uri: "video.xyz",
        title: "Invalid Video",
        creation_timestamp: 1234567890,
        media_metadata: {},
        cross_post_source: { source_app: "Instagram" },
        backup_uri: "backup_invalid.mp4",
        dubbing_info: [],
        media_variants: [],
      };

      const processor = new InstagramVideoProcessor(mockVideo, "/test/archive");
      
      await expect(processor.process()).rejects.toThrow("Unsupported file type");
    });
  });

  describe("Custom MediaProcessorFactory", () => {
    test("should allow custom processor injection", async () => {
      const mockFactory = {
        createProcessor: jest.fn().mockImplementation((media) => ({
          process: jest.fn().mockResolvedValue([{
            mediaText: "Mock Result",
            mimeType: "mock/type",
            mediaBuffer: Buffer.from("test")
          }])
        }))
      };

      const mockPost: InstagramExportedPost = {
        creation_timestamp: 1234567890,
        title: "Test Post",
        media: [
          {
            uri: "test.jpg",
            title: "Test",
            creation_timestamp: 1234567890,
            media_metadata: {},
            cross_post_source: { source_app: "Instagram" },
            backup_uri: "backup_test.jpg",
          },
        ] as ImageMedia[],
      };

      const processor = new InstagramMediaProcessor([mockPost], "/test/archive", mockFactory);
      const result = await processor.process();

      expect(mockFactory.createProcessor).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].embeddedMedia).toBeDefined();
    });
  });
});
