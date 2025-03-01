import { AppConfig } from './config';

describe('AppConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Explicitly reset all test mode environment variables
    delete process.env.TEST_VIDEO_MODE;
    delete process.env.TEST_IMAGE_MODE;
    delete process.env.TEST_IMAGES_MODE;
    delete process.env.SIMULATE;
    delete process.env.MIN_DATE;
    delete process.env.MAX_DATE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('fromEnv', () => {
    test('should create config with all test modes disabled by default', () => {
      const config = AppConfig.fromEnv();
      expect(config.isTestModeEnabled()).toBe(false);
    });

    test('should create config with simulate mode disabled by default', () => {
      const config = AppConfig.fromEnv();
      expect(config.isSimulateEnabled()).toBe(false);
    });

    test('should create config with undefined min and max dates by default', () => {
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()).toBeUndefined();
      expect(config.getMaxDate()).toBeUndefined();
    });

    test('should enable test video mode when TEST_VIDEO_MODE=1', () => {
      process.env.TEST_VIDEO_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.isTestModeEnabled()).toBe(true);
    });

    test('should enable test image mode when TEST_IMAGE_MODE=1', () => {
      process.env.TEST_IMAGE_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.isTestModeEnabled()).toBe(true);
    });

    test('should enable test images mode when TEST_IMAGES_MODE=1', () => {
      process.env.TEST_IMAGES_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.isTestModeEnabled()).toBe(true);
    });

    test('should enable simulate mode when SIMULATE=1', () => {
      process.env.SIMULATE = '1';
      const config = AppConfig.fromEnv();
      expect(config.isSimulateEnabled()).toBe(true);
    });

    test('should set minDate when MIN_DATE is provided', () => {
      process.env.MIN_DATE = '2023-01-01';
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()).toEqual(new Date('2023-01-01'));
    });

    test('should set maxDate when MAX_DATE is provided', () => {
      process.env.MAX_DATE = '2024-12-31';
      const config = AppConfig.fromEnv();
      expect(config.getMaxDate()).toEqual(new Date('2024-12-31'));
    });

    test('should set both minDate and maxDate when both are provided', () => {
      process.env.MIN_DATE = '2023-01-01';
      process.env.MAX_DATE = '2024-12-31';
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()).toEqual(new Date('2023-01-01'));
      expect(config.getMaxDate()).toEqual(new Date('2024-12-31'));
    });
  });

  describe('validate', () => {
    test('should not throw when no test modes are enabled', () => {
      const config = AppConfig.fromEnv();
      expect(() => config.validate()).not.toThrow();
    });

    test('should not throw when only one test mode is enabled', () => {
      process.env.TEST_VIDEO_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(() => config.validate()).not.toThrow();
    });

    test('should throw when multiple test modes are enabled', () => {
      process.env.TEST_VIDEO_MODE = '1';
      process.env.TEST_IMAGE_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(() => config.validate()).toThrow('Cannot enable multiple test modes simultaneously');
    });
  });

  describe('getArchiveFolder', () => {
    test('should return test_video folder when video mode enabled', () => {
      process.env.TEST_VIDEO_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.getArchiveFolder()).toMatch(/transfer\/test_video$/);
    });

    test('should return test_image folder when image mode enabled', () => {
      process.env.TEST_IMAGE_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.getArchiveFolder()).toMatch(/transfer\/test_image$/);
    });

    test('should return test_images folder when images mode enabled', () => {
      process.env.TEST_IMAGES_MODE = '1';
      const config = AppConfig.fromEnv();
      expect(config.getArchiveFolder()).toMatch(/transfer\/test_images$/);
    });

    test('should return ARCHIVE_FOLDER when no test mode enabled', () => {
      process.env.ARCHIVE_FOLDER = '/custom/archive/path';
      const config = AppConfig.fromEnv();
      expect(config.getArchiveFolder()).toBe('/custom/archive/path');
    });
  });

  describe('isTestModeEnabled', () => {
    test('should return false when no test modes are enabled', () => {
      const config = AppConfig.fromEnv();
      expect(config.isTestModeEnabled()).toBe(false);
    });

    test('should return true when any test mode is enabled', () => {
      const testCases = ['TEST_VIDEO_MODE', 'TEST_IMAGE_MODE', 'TEST_IMAGES_MODE'];
      
      testCases.forEach(testMode => {
        // Reset env for each test case
        process.env = { ...originalEnv };
        delete process.env.TEST_VIDEO_MODE;
        delete process.env.TEST_IMAGE_MODE;
        delete process.env.TEST_IMAGES_MODE;
        
        process.env[testMode] = '1';
        const config = AppConfig.fromEnv();
        expect(config.isTestModeEnabled()).toBe(true);
      });
    });
  });

  describe('isSimulateEnabled', () => {
    test('should return false when simulate mode is not enabled', () => {
      const config = AppConfig.fromEnv();
      expect(config.isSimulateEnabled()).toBe(false);
    });

    test('should return true when simulate mode is enabled', () => {
      process.env.SIMULATE = '1';
      const config = AppConfig.fromEnv();
      expect(config.isSimulateEnabled()).toBe(true);
    });
  });

  describe('getMinDate and getMaxDate', () => {
    test('should return undefined when no dates are set', () => {
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()).toBeUndefined();
      expect(config.getMaxDate()).toBeUndefined();
    });

    test('should return correct date when MIN_DATE is set', () => {
      process.env.MIN_DATE = '2023-01-01';
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()).toEqual(new Date('2023-01-01'));
    });

    test('should return correct date when MAX_DATE is set', () => {
      process.env.MAX_DATE = '2024-12-31';
      const config = AppConfig.fromEnv();
      expect(config.getMaxDate()).toEqual(new Date('2024-12-31'));
    });

    test('should handle invalid date strings', () => {
      process.env.MIN_DATE = 'not-a-date';
      process.env.MAX_DATE = 'also-not-a-date';
      const config = AppConfig.fromEnv();
      expect(config.getMinDate()?.toString()).toBe('Invalid Date');
      expect(config.getMaxDate()?.toString()).toBe('Invalid Date');
    });
  });
}); 