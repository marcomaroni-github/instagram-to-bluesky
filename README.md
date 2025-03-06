# Instagram To Bluesky

Import posts exported from Instagram to a Bluesky account.

This utility reads an Instagram archive from your local disk and uses the official Bluesky TypeScript SDK to import posts into your configured Bluesky account.

[![codecov](https://codecov.io/gh/straiforos/instagram-to-bluesky/branch/main/graph/badge.svg)](https://codecov.io/gh/straiforos/instagram-to-bluesky)

[**An example of an account used to import posts from Instagram**](https://bsky.app/profile/mm-instagram-arch.bsky.social)

⚠️ We recommend creating a specific account to test the import and not using your main Bluesky account ⚠️

## Features

- Imports photos and videos from Instagram posts
- Preserves original post dates and captions
- Supports importing up to 4 images per post, splitting a post to incude all images and videos due to bluesky limits.
- Test modes for verifying video and image imports
- Simulation mode to estimate import time
- Configurable date ranges for selective imports

## Testing

The project includes a test suite that can be run in several ways:

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Prerequisites

- Node.js >= 20.12.0
    - .nvmrc exists, run `nvm use`.
- Your Instagram archive in JSON format ([download your archive here](https://www.instagram.com/download/request))
- A Bluesky account with an App Password
    - Verified email or videos will show up as not found.

## Getting Started

1. Install dependencies: `npm install`
2. Copy `.env.dist` to `.env` and configure:

```shell
# Your Bluesky username (e.g. "username.bsky.social")
BLUESKY_USERNAME=username.bsky.social
# App Password from Bluesky settings
BLUESKY_PASSWORD=your-password
# Path to your unzipped Instagram archive
ARCHIVE_FOLDER=c:/download/instagram-username-2025-XX-XX-hash

# Optional settings
SIMULATE=1              # Set to 1 to simulate import without posting
TEST_VIDEO_MODE=0       # Set to 1 to test video imports
TEST_IMAGE_MODE=0       # Set to 1 to test image imports
TEST_IMAGES_MODE=1      # 5 images in a post (all 4 should upload, plus a second post with 1)
TEST_MIXED_MEDIA_MODE=0 # many images and videos, single post split into 5, with a total of 10 media uploaded.
MIN_DATE=2020-01-01     # Only import posts after this date
MAX_DATE=2025-01-01     # Only import posts before this date
LOG_LEVEL=debug         # Set logging verbosity (debug, info, warn, error)
```

## Running the Import

You can run the script in two ways:

- Standard output: `npm start`
- With logging to file: `npm run start_log`

### Test Modes

The project includes four test modes to verify imports:

- `TEST_VIDEO_MODE`: Tests video import functionality
- `TEST_IMAGE_MODE`: Tests image import functionality
- `TEST_IMAGES_MODE`: Tests max image per post split functionality.
- `TEST_MIXED_MEDIA_MODE`: Tests posts with video and image formats splitting content to match Bluesky's limitations.

Enable these by setting the corresponding environment variable to 1. Note: You cannot enable both modes simultaneously.

### Simulation Mode

Set `SIMULATE=1` to run a dry-run that:
- Counts posts that would be imported
- Estimates import time
- Validates media files
- Does not create any posts

This is recommended before running an actual import.

## Limitations

- Maximum 4 images per post (Bluesky platform limit)
    - Splits posts adding a postfix `(Part 1/4)` ensuring no data loss.
- Maximum video size of 100MB
- Rate limiting enforced between posts
- Stories, and likes can not be imported.

## License

"Instagram To Bluesky" is published under the MIT license.

Copyright 2024 Marco Maroni

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
