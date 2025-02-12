import path from "path";

import fs from "fs";

import { BlueskyClient } from '@bluesky/bluesky.js';
import { processVideoPost } from '@video/video.js';

import { getMimeType, processMedia, processPost } from "./media.js";

// Mock the file system
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock the logger to avoid console noise during tests
jest.mock("../src/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the video validation
jest.mock("../src/video", () => ({
  validateVideo: jest.fn().mockReturnValue(true),
  getVideoDimensions: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
  createVideoEmbed: jest.fn(),
  processVideoPost: jest.fn()
}));

jest.mock('../src/bluesky', () => {
  const actual = jest.requireActual('../src/bluesky');
  return {
    ...actual, // Keep the real ImageEmbedImpl and VideoEmbedImpl
    BlueskyClient: jest.fn().mockImplementation(() => ({
      uploadVideo: jest.fn().mockResolvedValue({ ref: { $link: 'test-ref' } }),
      createPost: jest.fn()
    }))
  };
});

describe("Media Processing", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Setup default mock for readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
  });

  describe("getMimeType", () => {
    test("should return correct mime types for supported files", () => {
      expect(getMimeType("jpg")).toBe("image/jpeg");
      expect(getMimeType("mp4")).toBe("video/mp4");
      expect(getMimeType("mov")).toBe("video/quicktime");
    });

    test("should return empty string for unsupported files", () => {
      expect(getMimeType("xyz")).toBe("");
    });
  });

  describe("processMedia", () => {
    const testMedia = {
      uri: "test.mp4",
      creation_timestamp: Date.now() / 1000,
      title: "Test Media",
      media_metadata: {
        photo_metadata: {
          exif_data: [
            {
              latitude: 45.5,
              longitude: -122.5,
            },
          ],
        },
      },
    };

    test("should process video media file correctly", async () => {
      const result = await processMedia(
        testMedia,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.mimeType).toBe("video/mp4");
      expect(result.isVideo).toBe(true);
      expect(result.mediaBuffer).toBeTruthy();
      expect(result.mediaText).toContain("Test Media");
      expect(result.mediaText).toContain("geo:45.5,-122.5");
    });

    test("should handle missing media file", async () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = await processMedia(
        testMedia,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.mimeType).toBeNull();
      expect(result.mediaBuffer).toBeNull();
    });
  });

  describe("processPost", () => {
    const testPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          uri: "test.mp4",
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    const mockBluesky = new BlueskyClient('user', 'pass');
    const simulate = false;

    test("should process post correctly", async () => {
      const result = await processPost(
        testPost,
        path.join(__dirname, "../transfer/test_videos"),
        mockBluesky,
        simulate
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Test Post");
      // Video media should only be a single embedded object.
      expect(Array.isArray(result.embeddedMedia)).toBe(false);
      expect(result.mediaCount).toBe(1);
    });

    test("should handle post with no media", async () => {
      const emptyPost = {
        creation_timestamp: Date.now() / 1000,
        title: "Empty Post",
        media: [],
      };

      const result = await processPost(
        emptyPost,
        path.join(__dirname, "../transfer/test_videos"),
        mockBluesky,
        simulate
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Empty Post");
      expect(result.embeddedMedia).toHaveLength(0);
      expect(result.mediaCount).toBe(0);
    });

    test("should truncate long post text", async () => {
      const longPost = {
        creation_timestamp: Date.now() / 1000,
        title: "A".repeat(400), // Create a string longer than POST_TEXT_LIMIT
        media: [],
      };

      const result = await processPost(
        longPost,
        path.join(__dirname, "../transfer/test_videos"),
        mockBluesky,
        simulate
      );

      expect(result.postText.length).toBeLessThanOrEqual(300);
      expect(result.postText.endsWith("...")).toBe(true);
    });

    test("should handle post with jpg media as array", async () => {
      const jpgPost = {
        creation_timestamp: Date.now() / 1000,
        title: "Image Post",
        media: [
          {
            uri: "test.jpg",
            creation_timestamp: Date.now() / 1000,
            title: "Test Image",
          },
        ],
      };

      const result = await processPost(
        jpgPost,
        path.join(__dirname, "../transfer/test_videos"),
        mockBluesky,
        simulate
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Image Post");
      // Image media should be an array
      expect(Array.isArray(result.embeddedMedia)).toBe(true);
      expect(result.embeddedMedia).toHaveLength(1);
      expect(result.mediaCount).toBe(1);
    });

    test('should handle video posts correctly', async () => {
      const mockVideoPost = {
        title: "",
        media: [{
          uri: "test.mp4",
          creation_timestamp: 1458732736,
          media_metadata: {
            video_metadata: {
              exif_data: [{ latitude: 53.141186112, longitude: 11.038734576 }]
            }
          },
          title: "No filter needed. #waterfall #nature"
        }]
      };

      const mockVideoEmbed = {
        $type: 'app.bsky.embed.video',
        video: {
          $type: 'blob',
          ref: { $link: 'test-ref' },
          mimeType: 'video/mp4',
          size: 1000
        },
        aspectRatio: { width: 640, height: 480 }
      };

      (processVideoPost as jest.Mock).mockResolvedValue(mockVideoEmbed);

      const result = await processPost(
        mockVideoPost,
        path.join(__dirname, "../transfer/test_videos"),
        mockBluesky,
        simulate
      );

      expect(processVideoPost).toHaveBeenCalled();
      expect(result.embeddedMedia).toEqual(mockVideoEmbed);
      expect(result.mediaCount).toBe(1);
    });
  });
});
