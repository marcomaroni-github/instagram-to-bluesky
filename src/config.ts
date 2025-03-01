import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Configuration for the application
 */
export class AppConfig {
  private readonly testVideoMode: boolean;
  private readonly testImageMode: boolean;
  private readonly testImagesMode: boolean;
  private readonly simulate: boolean;
  private readonly minDate: Date | undefined;
  private readonly maxDate: Date | undefined;

  constructor(config: {
    testVideoMode: boolean;
    testImageMode: boolean;
    testImagesMode: boolean;
    simulate: boolean;
    minDate?: Date;
    maxDate?: Date;
  }) {
    this.testVideoMode = config.testVideoMode;
    this.testImageMode = config.testImageMode;
    this.testImagesMode = config.testImagesMode;
    this.simulate = config.simulate;
    this.minDate = config.minDate;
    this.maxDate = config.maxDate;
  }

  /**
   * Creates a configuration object from environment variables
   */
  static fromEnv(): AppConfig {
    return new AppConfig({
      testVideoMode: process.env.TEST_VIDEO_MODE === '1',
      testImageMode: process.env.TEST_IMAGE_MODE === '1',
      testImagesMode: process.env.TEST_IMAGES_MODE === '1',
      simulate: process.env.SIMULATE === '1',
      minDate: process.env.MIN_DATE ? new Date(process.env.MIN_DATE) : undefined,
      maxDate: process.env.MAX_DATE ? new Date(process.env.MAX_DATE) : undefined
    });
  }

  /**
   * Checks if any test mode is enabled
   */
  isTestModeEnabled(): boolean {
    return this.testVideoMode || this.testImageMode || this.testImagesMode;
  }

  /**
   * Checks if simulate mode is enabled
   */
  isSimulateEnabled(): boolean {
    return this.simulate;
  }

  /**
   * Gets the minimum date for post filtering
   */
  getMinDate(): Date | undefined {
    return this.minDate;
  }

  /**
   * Gets the maximum date for post filtering
   */
  getMaxDate(): Date | undefined {
    return this.maxDate;
  }

  /**
   * Gets the archive folder path based on test configuration
   */
  getArchiveFolder(): string {
    const rootDir = path.resolve(__dirname, '..');

    if (this.testVideoMode) return path.join(rootDir, 'transfer/test_video');
    if (this.testImageMode) return path.join(rootDir, 'transfer/test_image');
    if (this.testImagesMode) return path.join(rootDir, 'transfer/test_images');
    return process.env.ARCHIVE_FOLDER!;
  }

  /**
   * Validates that only one test mode is enabled at a time
   * @throws Error if multiple test modes are enabled
   */
  validate(): void {
    const enabledModes = Object.entries({
      testVideoMode: this.testVideoMode,
      testImageMode: this.testImageMode,
      testImagesMode: this.testImagesMode
    })
      .filter(([_, enabled]) => enabled)
      .map(([mode]) => mode);

    if (enabledModes.length > 1) {
      throw new Error(
        `Cannot enable multiple test modes simultaneously: ${enabledModes.join(', ')}`
      );
    }
  }
} 