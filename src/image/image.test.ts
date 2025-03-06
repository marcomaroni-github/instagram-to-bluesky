import { getImageSize } from "./image";
import { logger } from "../logger/logger";

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

// Mock the logger
jest.mock("../logger/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("getImageSize", () => {
  test("should return correct dimensions for a square image", async () => {
    const result = await getImageSize("/path/to/square.jpg");
    expect(result).toEqual({ width: 1080, height: 1080 });
  });

  test("should return correct dimensions for a landscape image", async () => {
    const result = await getImageSize("/path/to/landscape.jpg");
    expect(result).toEqual({ width: 1920, height: 1080 });
  });

  test("should return correct dimensions for a portrait image", async () => {
    const result = await getImageSize("/path/to/portrait.jpg");
    expect(result).toEqual({ width: 1080, height: 1920 });
  });

  test("should return null when metadata is missing width or height", async () => {
    const result = await getImageSize("/path/to/invalid.jpg");
    expect(result).toBeNull();
  });

  test("should log error when image processing fails", async () => {
    // Call the function with a path that will trigger an error
    const result = await getImageSize("/path/to/missing.jpg");

    // Verify the logger.error was called with the expected message pattern
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /Failed to get image aspect ratio; image path: \/path\/to\/missing\.jpg, error:/
      )
    );

    // Verify the function returns null when an error occurs
    expect(result).toBeNull();
  });
});
