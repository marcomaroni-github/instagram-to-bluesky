import fs from "fs";
import { VideoMedia } from "../InstagramExportedPost";
import { InstagramVideoProcessor } from "..";

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

describe("InstagramVideoProcessor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
  });

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

    const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
    const result = await processor.process();

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("video/mp4");
    expect(result[0].mediaText).toBe("Test Video");
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

    const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
    const result = await processor.process();

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("");
  });

  test("should truncate video title when it exceeds limit", async () => {
    const longTitle = "C".repeat(400); // Create a title longer than POST_TEXT_LIMIT (300)
    const mockVideo: VideoMedia = {
      uri: "video.mp4",
      title: longTitle,
      creation_timestamp: 1234567890,
      media_metadata: {},
      cross_post_source: { source_app: "Instagram" },
      backup_uri: "backup_video.mp4",
      dubbing_info: [],
      media_variants: [],
    };

    const processor = new InstagramVideoProcessor([mockVideo], "/test/archive");
    const result = await processor.process();

    expect(result).toHaveLength(1);
    expect(result[0].mediaText.length).toBe(303); // 300 chars + "..."
    expect(result[0].mediaText.endsWith("...")).toBe(true);
  });
});
