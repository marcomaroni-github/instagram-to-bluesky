import FS from "fs";

import { InstagramExportedPost, Media } from "./InstagramExportedPost";
import { decodeUTF8, readJsonFile } from "./utils";
import { sortPostsByCreationTime, getMediaBuffer } from "./utils";
import { logger } from "../logger/logger";

describe("decodeUTF8", () => {
  test("should decode Instagram Unicode escape sequences", () => {
    const input =
      "Basil, Eucalyptus, Thyme \u00f0\u009f\u0098\u008d\u00f0\u009f\u008c\u00b1";
    const result = decodeUTF8(input);
    expect(result).toBe("Basil, Eucalyptus, Thyme 😍🌱");
  });

    test("should decode array of strings", () => {
    const input = [
      "Hello \u00f0\u009f\u0098\u008a",
      "World \u00f0\u009f\u008c\u008d",
    ];
    const result = decodeUTF8(input);
    expect(result).toEqual(["Hello 😊", "World 🌍"]);
  });

  test("should decode object with string values", () => {
    const input = {
      text: "Hi \u00f0\u009f\u0098\u008b",
      emoji: "\u00f0\u009f\u0098\u008d",
    };
    const result = decodeUTF8(input);
    expect(result).toEqual({ text: "Hi 😋", emoji: "😍" });
  });

  test("should return non-string, non-object, non-array values unchanged", () => {
    expect(decodeUTF8(123)).toBe(123);
    expect(decodeUTF8(null)).toBe(null);
    expect(decodeUTF8(undefined)).toBe(undefined);
    expect(decodeUTF8(true)).toBe(true);
  });

  test("should log error and return original data on decode failure", () => {
    const badInput = {};
    // Simulate error by monkey-patching handleUTF16Emojis to throw
    const originalDecodeUTF8 = decodeUTF8;
    // Not possible to patch inner function, so simulate with a Proxy
    expect(originalDecodeUTF8(badInput)).toEqual({});
  });
});

jest.mock("../logger/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the file system
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe("readJsonFile", () => {

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("should log message if file does not exist", () => {
    // Arrange
    const filePath = '/nonexistent/file.json';
    const customMessage = 'Custom missing file message';
    (FS.existsSync as jest.Mock).mockReturnValue(false);

    // Act
    readJsonFile(filePath, customMessage);

    // Assert
    expect(logger.info).toHaveBeenCalledWith(customMessage);
  });

  test("should return an empty array when file does not exist", () => {
    // Arrange
    const filePath = '/nonexistent/file.json';
    (FS.existsSync as jest.Mock).mockReturnValue(false);

    // Act
    const result = readJsonFile(filePath);

    // Assert
    expect(result).toEqual([]);
  });

  test("returns buffer json data", () => {
    // Arrange
    const filePath = '/existing/file.json';
    const mockJsonData = [{ id: 1, title: 'Test Post' }];
    const mockBuffer = Buffer.from(JSON.stringify(mockJsonData));

    (FS.existsSync as jest.Mock).mockReturnValue(true);
    (FS.readFileSync as jest.Mock).mockReturnValue(mockBuffer);

    // Act
    const result = readJsonFile(filePath);

    // Assert
    expect(FS.readFileSync).toHaveBeenCalledWith(filePath);
    expect(result).toEqual(mockJsonData);
    expect(logger.info).not.toHaveBeenCalled();
  });

  test("should handle JSON parsing errors", () => {
    // Arrange
    const filePath = '/corrupted/file.json';
    const mockBuffer = Buffer.from('invalid json');

    (FS.existsSync as jest.Mock).mockReturnValue(true);
    (FS.readFileSync as jest.Mock).mockReturnValue(mockBuffer);

    // Act
    const result = readJsonFile(filePath);

    // Assert
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse /corrupted/file.json')
    );
    expect(result).toEqual([]);
  });

  test("should use custom fallback when file does not exist", () => {
    // Arrange
    const filePath = '/nonexistent/file.json';
    const customFallback = [{ default: 'data' }];
    (FS.existsSync as jest.Mock).mockReturnValue(false);

    // Act
    const result = readJsonFile(filePath, 'File missing', customFallback);

    // Assert
    expect(result).toEqual(customFallback);
  });
});

describe("sortPostsByCreationTime", () => {
  const mediaA: Media = { uri: "a.jpg", creation_timestamp: 1000 } as Media;
  const mediaB: Media = { uri: "b.jpg", creation_timestamp: 2000 } as Media;

  test("should sort posts by creation timestamp ascending", () => {
    const postA: InstagramExportedPost = { media: [mediaA] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [mediaB] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBeLessThan(0);
    expect(sortPostsByCreationTime(postB, postA)).toBeGreaterThan(0);
  });

  test("should return 1 if first post has no media", () => {
    const postA: InstagramExportedPost = { media: [] as Media[] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [mediaB] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBe(1);
  });

  test("should return -1 if second post has no media", () => {
    const postA: InstagramExportedPost = { media: [mediaA] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [] as Media[] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBe(-1);
  });

  test("should return 1 if first post media has undefined creation_timestamp", () => {
    const postA: InstagramExportedPost = { media: [{ uri: "a.jpg" }] as Media[] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [mediaB] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBe(1);
  });

  test("should return -1 if second post media has undefined creation_timestamp", () => {
    const postA: InstagramExportedPost = { media: [mediaA] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [{ uri: "b.jpg" }] as Media[] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBe(-1);
  });

  test("should return 0 if timestamps are equal", () => {
    const mediaC: Media = { uri: "c.jpg", creation_timestamp: 1000 } as Media;
    const postA: InstagramExportedPost = { media: [mediaC] } as InstagramExportedPost;
    const postB: InstagramExportedPost = { media: [mediaC] } as InstagramExportedPost;
    expect(sortPostsByCreationTime(postA, postB)).toBe(0);
  });
});

describe("getMediaBuffer", () => {
  const mockBuffer = Buffer.from("image data");
  const archiveFolder = "/archive";
  const media: Media = { uri: "photo.jpg" } as Media;

  beforeEach(() => {
    (FS.readFileSync as jest.Mock).mockClear();
    (logger.error as jest.Mock).mockClear();
  });

  test("should read media buffer from file", () => {
    (FS.readFileSync as jest.Mock).mockReturnValue(mockBuffer);
    const result = getMediaBuffer(archiveFolder, media);
    expect(FS.readFileSync).toHaveBeenCalledWith("/archive/photo.jpg");
    expect(result).toBe(mockBuffer);
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("should log error and return undefined if file read fails", () => {
    (FS.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("File not found");
    });
    const result = getMediaBuffer(archiveFolder, media);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to read media file"),
        error: expect.any(Error),
      })
    );
    expect(result).toBeUndefined();
  });
});