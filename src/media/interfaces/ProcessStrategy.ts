/**
 * Strategy pattern interface to allow all medias and posts to share a common method of process.
 */
export interface ProcessStrategy<P> {
  /**
   * Processes instagram data into a format easily mapped to Blueskys requirements.
   */
  process(): Promise<P>;
} 