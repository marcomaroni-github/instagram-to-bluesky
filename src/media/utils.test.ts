import FS from "fs";

import { decodeUTF8, readJsonFile } from "./utils";
import { logger } from "../logger/logger";

describe("decodeUTF8", () => {
  test("should decode Instagram Unicode escape sequences", () => {
    const input =
      "Basil, Eucalyptus, Thyme \u00f0\u009f\u0098\u008d\u00f0\u009f\u008c\u00b1";
    const result = decodeUTF8(input);
    expect(result).toBe("Basil, Eucalyptus, Thyme 😍🌱");
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