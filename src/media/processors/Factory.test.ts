import fs from "fs";

import { InstagramMediaProcessor } from "../";
import {
  InstagramExportedPost,
  VideoMedia,
  ImageMedia,
} from "../InstagramExportedPost";

// Mock the file system
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock sharp
jest.mock("sharp", () => {
  return function (filePath: string) {
    // Mock different behavior based on file path for testing different scenarios
    if (filePath && filePath.includes("missing.jpg")) {
      throw new Error("Input file is missing");
    }

    if (filePath && filePath.includes("invalid.jpg")) {
      return {
        metadata: jest.fn().mockResolvedValue({}),
      };
    }

    if (filePath && filePath.includes("landscape.jpg")) {
      return {
        metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
      };
    }

    if (filePath && filePath.includes("portrait.jpg")) {
      return {
        metadata: jest.fn().mockResolvedValue({ width: 1080, height: 1920 }),
      };
    }

    // Default square image
    return {
      metadata: jest.fn().mockResolvedValue({ width: 1080, height: 1080 }),
    };
  };
});

// Mock fluent-ffmpeg
jest.mock("fluent-ffmpeg", () => {
  return {
    setFfprobePath: jest.fn(),
    ffprobe: (
      path: string,
      callback: (err: Error | null, data: any) => void
    ) => {
      callback(null, {
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
          },
        ],
      });
    },
  };
});

// Mock @ffprobe-installer/ffprobe
jest.mock("@ffprobe-installer/ffprobe", () => ({
  path: "/mock/ffprobe/path",
}));

// Mock the logger
jest.mock("../../logger/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("MediaProcessorFactory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
  });
  test("should use DefaultMediaProcessorFactory for image processing", async () => {
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

    const processor = new InstagramMediaProcessor([mockPost], "/test/archive");
    const result = await processor.process();

    expect(result).toHaveLength(1);
    expect(result[0].embeddedMedia).toBeDefined();
    expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
  });

  test("should use DefaultMediaProcessorFactory for video processing", async () => {
    const mockPost: InstagramExportedPost = {
      creation_timestamp: 1234567890,
      title: "Test Video Post",
      media: [
        {
          uri: "test.mp4",
          title: "Test Video",
          creation_timestamp: 1234567890,
          media_metadata: {},
          cross_post_source: { source_app: "Instagram" },
          backup_uri: "backup_test.mp4",
          dubbing_info: [],
          media_variants: [],
        },
      ] as VideoMedia[],
    };

    const processor = new InstagramMediaProcessor([mockPost], "/test/archive");
    const result = await processor.process();

    expect(result).toHaveLength(1);
    expect(result[0].embeddedMedia).toBeDefined();
    expect(Array.isArray(result[0].embeddedMedia)).toBe(true);
  });
});
