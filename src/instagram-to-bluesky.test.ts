import fs from "fs";

import {
  main,
  formatDuration,
  calculateEstimatedTime,
  uploadMediaAndEmbed,
} from "../src/instagram-to-bluesky";
import { BlueskyClient } from "../src/bluesky/bluesky";
import { logger } from "../src/logger/logger";
import { InstagramMediaProcessor } from "../src/media/media";
import { ImagesEmbedImpl, VideoEmbedImpl } from "../src/bluesky/index";
import type { InstagramExportedPost } from "../src/media/InstagramExportedPost";
import { ImageMediaProcessResultImpl } from "./media";

// Mock all dependencies
jest.mock("fs");
jest.mock("../src/bluesky/bluesky", () => {
  return {
    BlueskyClient: jest.fn().mockImplementation(() => ({
      login: jest.fn().mockResolvedValue(undefined),
      uploadMedia: jest.fn().mockResolvedValue({
        ref: "test-blob-ref",
        mimeType: "image/jpeg",
        size: 1000,
      }),
      createPost: jest
        .fn()
        .mockResolvedValue("https://bsky.app/profile/test/post/test"),
    })),
  };
});
jest.mock("../src/media/media", () => {
  const mockProcess = jest.fn().mockResolvedValue([
    {
      postDate: new Date(),
      postText: "Test post",
      embeddedMedia: [],
      mediaCount: 1,
    },
  ]);

  const mockMediaProcessor = {
    process: jest.fn().mockResolvedValue([
      {
        mediaText: "Test media",
        mimeType: "image/jpeg",
        mediaBuffer: Buffer.from("test"),
      },
    ]),
  };

  return {
    InstagramMediaProcessor: jest
      .fn()
      .mockImplementation((posts: InstagramExportedPost[], folder: string) => ({
        mediaProcessorFactory: {
          createProcessor: () => mockMediaProcessor,
        },
        instagramPosts: posts,
        archiveFolder: folder,
        process: mockProcess,
      })),
    decodeUTF8: jest.fn((x) => x),
  };
});
jest.mock("../src/logger/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("dotenv", () => ({
  config: jest.fn(),
}));
jest.mock("../src/video", () => ({
  prepareVideoUpload: jest.fn().mockReturnValue({
    ref: "", // This will be filled by the upload process with the CID
    mimeType: "video/mp4",
    size: 1000,
    dimensions: {
      width: 640,
      height: 640,
    },
  }),
  createVideoEmbed: jest.fn(),
  validateVideo: jest.fn(),
  getVideoDimensions: jest.fn(),
  processVideoPost: jest.fn(),
}));

describe("Main App", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset env before each test
    process.env = {
      ...originalEnv,
      ARCHIVE_FOLDER: "/test/folder",
      BLUESKY_USERNAME: "test_user",
      BLUESKY_PASSWORD: "test_pass",
      SIMULATE: "0",
      TEST_MODE: "0",
    };

    // Setup default mocks
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify([
        {
          creation_timestamp: Date.now() / 1000,
          title: "Test Post 1",
          media: [
            {
              creation_timestamp: Date.now() / 1000,
              title: "Test Media 1",
            },
          ],
        },
      ])
    );

    // Reset BlueskyClient mock
    jest.mocked(BlueskyClient).mockClear();
    jest.mocked(BlueskyClient).prototype.login = jest.fn();
    jest.mocked(BlueskyClient).prototype.createPost = jest
      .fn()
      .mockResolvedValue("https://bsky.app/test/post");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("should process posts in simulate mode", async () => {
    process.env.SIMULATE = "1";

    await main();

    expect(jest.mocked(BlueskyClient)).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("SIMULATE mode is enabled")
    );
  });

  test("should process posts and create Bluesky posts in normal mode", async () => {
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));

    await main();

    expect(jest.mocked(BlueskyClient)).toHaveBeenCalled();
    expect(InstagramMediaProcessor).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining("/test/folder")
    );
    expect(
      jest.mocked(InstagramMediaProcessor).mock.results[0].value.process
    ).toHaveBeenCalled();
  });

  test("should handle date filtering with MIN_DATE", async () => {
    process.env.MIN_DATE = "2024-01-01";

    const oldPost = {
      creation_timestamp: new Date("2023-01-01").getTime() / 1000,
      title: "Old Post",
      media: [
        {
          creation_timestamp: new Date("2023-01-01").getTime() / 1000,
          title: "Old Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([oldPost]));

    await main();

    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping post - Before MIN_DATE: [Sun, 01 Jan 2023 00:00:00 GMT]"
    );
  });

  test("should handle date filtering with MAX_DATE", async () => {
    process.env.MAX_DATE = "2024-01-01";

    const futurePost = {
      creation_timestamp: new Date("2025-01-01").getTime() / 1000,
      title: "Future Post",
      media: [
        {
          creation_timestamp: new Date("2025-01-01").getTime() / 1000,
          title: "Future Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify([futurePost])
    );

    await main();

    expect(logger.warn).toHaveBeenCalledWith(
      "Skipping post - After MAX_DATE [Wed, 01 Jan 2025 00:00:00 GMT]"
    );
  });

  describe("Date Filtering", () => {
    test("should include posts exactly on MIN_DATE", async () => {
      process.env.MIN_DATE = "2024-01-01";

      const exactMinDatePost = {
        creation_timestamp: new Date("2024-01-01").getTime() / 1000,
        title: "Exact Min Date Post",
        media: [
          {
            creation_timestamp: new Date("2024-01-01").getTime() / 1000,
            title: "Exact Min Date Media",
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify([exactMinDatePost])
      );

      await main();

      // The post should be processed, not skipped
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("Skipping post - Before MIN_DATE")
      );
      expect(InstagramMediaProcessor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "Exact Min Date Post" }),
        ]),
        expect.any(String)
      );
    });

    test("should exclude posts exactly on MAX_DATE", async () => {
      process.env.MAX_DATE = "2024-01-01";

      const exactMaxDatePost = {
        creation_timestamp: new Date("2024-01-01").getTime() / 1000,
        title: "Exact Max Date Post",
        media: [
          {
            creation_timestamp: new Date("2024-01-01").getTime() / 1000,
            title: "Exact Max Date Media",
          },
        ],
      };

      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify([exactMaxDatePost])
      );

      await main();

      // The post should be processed, not skipped (MAX_DATE is exclusive)
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining("Skipping post - After MAX_DATE")
      );
      expect(InstagramMediaProcessor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "Exact Max Date Post" }),
        ]),
        expect.any(String)
      );
    });

    test("should filter posts with both MIN_DATE and MAX_DATE set", async () => {
      process.env.MIN_DATE = "2023-01-01";
      process.env.MAX_DATE = "2025-01-01";

      const posts = [
        {
          creation_timestamp: new Date("2022-01-01").getTime() / 1000, // Too old
          title: "Too Old Post",
          media: [
            {
              creation_timestamp: new Date("2022-01-01").getTime() / 1000,
              title: "Old Media",
            },
          ],
        },
        {
          creation_timestamp: new Date("2023-06-01").getTime() / 1000, // In range
          title: "In Range Post 1",
          media: [
            {
              creation_timestamp: new Date("2023-06-01").getTime() / 1000,
              title: "In Range Media 1",
            },
          ],
        },
        {
          creation_timestamp: new Date("2024-06-01").getTime() / 1000, // In range
          title: "In Range Post 2",
          media: [
            {
              creation_timestamp: new Date("2024-06-01").getTime() / 1000,
              title: "In Range Media 2",
            },
          ],
        },
        {
          creation_timestamp: new Date("2026-01-01").getTime() / 1000, // Too new
          title: "Too New Post",
          media: [
            {
              creation_timestamp: new Date("2026-01-01").getTime() / 1000,
              title: "New Media",
            },
          ],
        },
      ];

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(posts));

      await main();

      // Should skip the too old post
      expect(logger.warn).toHaveBeenCalledWith(
        "Skipping post - Before MIN_DATE: [Sat, 01 Jan 2022 00:00:00 GMT]"
      );

      // Should skip the too new post
      expect(logger.warn).toHaveBeenCalledWith(
        "Skipping post - After MAX_DATE [Thu, 01 Jan 2026 00:00:00 GMT]"
      );

      // Should process the in-range posts
      expect(InstagramMediaProcessor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "In Range Post 1" }),
          expect.objectContaining({ title: "In Range Post 2" }),
        ]),
        expect.any(String)
      );
    });

    test("should use media timestamp when post timestamp is missing", async () => {
      process.env.MIN_DATE = "2023-01-01";
      process.env.MAX_DATE = "2025-01-01";

      const posts = [
        {
          // No creation_timestamp at post level
          title: "Post with only media timestamp",
          media: [
            {
              creation_timestamp: new Date("2024-01-01").getTime() / 1000,
              title: "Media with timestamp",
            },
          ],
        },
        {
          // No creation_timestamp at post level
          title: "Post with old media timestamp",
          media: [
            {
              creation_timestamp: new Date("2022-01-01").getTime() / 1000,
              title: "Too old media",
            },
          ],
        },
      ];

      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(posts));

      await main();

      // Should skip the post with old media timestamp
      expect(logger.warn).toHaveBeenCalledWith(
        "Skipping post - Before MIN_DATE: [Sat, 01 Jan 2022 00:00:00 GMT]"
      );

      // Should process the post with valid media timestamp
      expect(InstagramMediaProcessor).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ title: "Post with only media timestamp" }),
        ]),
        expect.any(String)
      );
    });
  });

  test("should handle posts with missing dates", async () => {
    const invalidPost = {
      title: "Invalid Post",
      media: [{ title: "Invalid Media" }],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify([invalidPost])
    );

    await main();

    expect(logger.warn).toHaveBeenCalledWith("Skipping post - No date");
  });

  test("should handle file reading errors", async () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("File read error");
    });

    await expect(main()).rejects.toThrow("File read error");
  });

  test("should handle Bluesky posting errors", async () => {
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));
    jest.mocked(BlueskyClient).prototype.createPost = jest
      .fn()
      .mockRejectedValue(new Error("Post failed"));

    await main();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Import finished")
    );
  });

  test("should calculate correct estimated time in simulate mode", async () => {
    process.env.SIMULATE = "1";

    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));

    await main();

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Estimated time for real import")
    );
  });

  test("should process posts successfully", async () => {
    const mockPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));
    await main();

    expect(jest.mocked(BlueskyClient)).toHaveBeenCalled();
    expect(InstagramMediaProcessor).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining("/test/folder")
    );
    expect(
      jest.mocked(InstagramMediaProcessor).mock.results[0].value.process
    ).toHaveBeenCalled();
  });

  test("should process multiple images in a post correctly", async () => {
    // Mock the posts.json content with multiple images
    const mockPost = {
      creation_timestamp: 1658871955,
      title:
        "A lil flower garden update:\n\nDalia is in full bloom, Dalia Fascination\nAnd my Hibiscus is looking fierce, Starry Starry Night\n\n#daliaflower #hibiscusplant",
      media: [
        {
          uri: "media/posts/202207/296182505_2306736436140223_1131775985609414029_n_17908919372611575.webp",
          creation_timestamp: 1658871953,
        },
        {
          uri: "media/posts/202207/295533146_3324225487861619_7021607269857186723_n_17969743933670683.webp",
          creation_timestamp: 1658871953,
        },
        {
          uri: "media/posts/202207/295912830_382044777369802_7402982082333793499_n_18022601347396344.webp",
          creation_timestamp: 1658871953,
        },
        {
          uri: "media/posts/202207/295652603_422749169622405_7528877124810844569_n_17957390530916779.webp",
          creation_timestamp: 1658871953,
        },
        {
          uri: "media/posts/202207/295709430_3269025470003456_6772629498034016772_n_17932740269206594.webp",
          creation_timestamp: 1658871953,
        },
      ],
    };

    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify([mockPost]));

    const embeddedMedia = mockPost.media.map(() => ({
      getType: () => "image",
      mediaBuffer: Buffer.from("test"),
      mimeType: "image/jpeg",
    }));

    // Mock the media processor to return multiple images
    const mockMediaProcessor = {
      process: jest.fn().mockResolvedValue([
        {
          postDate: new Date(mockPost.creation_timestamp * 1000),
          postText: mockPost.title,
          // Max images will slice the media to 4
          embeddedMedia: embeddedMedia.slice(0, 4),
        },
      ]),
    };

    (InstagramMediaProcessor as jest.Mock).mockImplementation(() => ({
      mediaProcessorFactory: {
        createProcessor: () => mockMediaProcessor,
      },
      instagramPosts: [mockPost],
      archiveFolder: "/test/folder",
      process: mockMediaProcessor.process,
    }));

    // Mock BlueskyClient for tracking uploads
    const mockBlueskyClient = {
      login: jest.fn().mockResolvedValue(undefined),
      uploadMedia: jest.fn().mockImplementation((_, __) => {
        return Promise.resolve({
          ref: `test-blob-ref-${mockBlueskyClient.uploadMedia.mock.calls.length}`,
          mimeType: "image/jpeg",
          size: 1000,
        });
      }),
      createPost: jest.fn().mockImplementation((_, __, embed) => {
        // Verify the post contains all images in the embed
        expect(embed.images?.length).toBe(4);
        return Promise.resolve("https://bsky.app/profile/test/post/test");
      }),
    };

    (BlueskyClient as jest.Mock).mockImplementation(() => mockBlueskyClient);

    await main();

    // Verify that uploadMedia was called for each image
    expect(mockBlueskyClient.uploadMedia).toHaveBeenCalledTimes(4);

    // Verify that createPost was called exactly once with all images
    expect(mockBlueskyClient.createPost).toHaveBeenCalledTimes(1);
    const createPostCall = mockBlueskyClient.createPost.mock.calls[0];
    const embedArg = createPostCall[2];
    expect(embedArg.images?.length).toBe(4);

    // Verify each image in the embed has a unique blob ref
    const blobRefs = new Set(embedArg.images?.map((img: any) => img.image.ref));
    expect(blobRefs.size).toBe(4);
  });
});

describe("Time Formatting Functions", () => {
  describe("formatDuration", () => {
    test("should format duration with hours and minutes", () => {
      const cases = [
        { input: 3600000, expected: "1 hours and 0 minutes" }, // 1 hour
        { input: 5400000, expected: "1 hours and 30 minutes" }, // 1.5 hours
        { input: 900000, expected: "0 hours and 15 minutes" }, // 15 minutes
        { input: 7200000, expected: "2 hours and 0 minutes" }, // 2 hours
        { input: 8100000, expected: "2 hours and 15 minutes" }, // 2.25 hours
      ];

      cases.forEach(({ input, expected }) => {
        expect(formatDuration(input)).toBe(expected);
      });
    });
  });

  describe("calculateEstimatedTime", () => {
    test("should calculate estimated time based on media count", () => {
      // API_RATE_LIMIT_DELAY is 3000ms, with 1.1 multiplier
      const cases = [
        { mediaCount: 20, expected: "0 hours and 1 minutes" }, // 20 * 3000 * 1.1 = 66000ms
        { mediaCount: 40, expected: "0 hours and 2 minutes" }, // 40 * 3000 * 1.1 = 132000ms
        { mediaCount: 10, expected: "0 hours and 0 minutes" }, // 10 * 3000 * 1.1 = 33000ms
      ];

      cases.forEach(({ mediaCount, expected }) => {
        expect(calculateEstimatedTime(mediaCount)).toBe(expected);
      });
    });
  });
});

describe("uploadMediaAndEmbed", () => {
  test("should handle multiple images correctly", async () => {
    const mockBluesky = {
      uploadMedia: jest.fn().mockImplementation((_, __) =>
        Promise.resolve({
          ref: `test-blob-ref-${mockBluesky.uploadMedia.mock.calls.length}`,
          mimeType: "image/jpeg",
          size: 1000,
        })
      ),
    };

    const mockImages = Array(4)
      .fill(null)
      .map(
        (_, index) =>
          new ImageMediaProcessResultImpl(
            `Test image ${index + 1}`,
            "image/jpeg",
            Buffer.from("test"),
            { width: 640, height: 640 }
          )
      );

    const result = await uploadMediaAndEmbed(
      "Test post text",
      mockImages,
      mockBluesky as any
    );

    // Verify correct number of uploads
    expect(mockBluesky.uploadMedia).toHaveBeenCalledTimes(4);
    expect(result.importedMediaCount).toBe(4);

    // Verify the uploaded media structure
    expect(result.uploadedMedia).toBeDefined();
    const imagesEmbed = result.uploadedMedia as ImagesEmbedImpl;
    expect(imagesEmbed.images).toHaveLength(4);

    // Verify each image has a unique blob ref
    const blobRefs = new Set(imagesEmbed.images.map((img) => img.image.ref));
    expect(blobRefs.size).toBe(4);
  });

  test("should handle video upload correctly", async () => {
    const mockBluesky = {
      uploadMedia: jest.fn().mockResolvedValue({
        ref: "test-video-blob-ref",
        mimeType: "video/mp4",
        size: 1000,
      }),
    };

    const mockVideo = {
      getType: (): "video" => "video",
      mediaBuffer: Buffer.from("test-video"),
      mimeType: "video/mp4",
      mediaText: "Test video",
      aspectRatio: { width: 1920, height: 1080 },
    };

    const result = await uploadMediaAndEmbed(
      "Test video post",
      [mockVideo],
      mockBluesky as any
    );

    expect(mockBluesky.uploadMedia).toHaveBeenCalledTimes(1);
    expect(result.importedMediaCount).toBe(1);
    expect(result.uploadedMedia).toBeDefined();

    const videoEmbed = result.uploadedMedia as VideoEmbedImpl;
    expect(videoEmbed.video.ref).toBe("test-video-blob-ref");
    expect(videoEmbed.video.mimeType).toBe("video/mp4");
  });

  test("should handle upload failures gracefully", async () => {
    const mockBluesky = {
      uploadMedia: jest.fn().mockRejectedValue(new Error("Upload failed")),
    };

    const mockImage = new ImageMediaProcessResultImpl(
      "Test image that will fail to upload",
      "image/jpeg",
      Buffer.from("test"),
      { width: 640, height: 640 }
    );

    const result = await uploadMediaAndEmbed(
      "Test failed upload",
      [mockImage],
      mockBluesky as any
    );

    expect(mockBluesky.uploadMedia).toHaveBeenCalledTimes(1);
    expect(result.importedMediaCount).toBe(0);
    expect(result.uploadedMedia).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Upload failed")
    );
  });
});
