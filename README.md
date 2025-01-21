# Instagram To Bluesky

Import all post exported from Instagram to a Bluesky account.

They use the official archive export file format from Instagram, this utility reads the archive from the local disk and using the official Bluesky Typescript SDK imports the posts into the configured Bluesky account.

[**An example of an account used to import posts from Instagram**](https://bsky.app/profile/mm-instagram-arch.bsky.social)

⚠️ We recommend creating a specific account to test the import and not using your main Bluesky account ⚠️


## Which posts are NOT imported

- Stories and post with videos, because videos are not currently supported by Bluesky.

## Prerequisite

- Nodejs >= 20.12x
- The archive of your post from the Instagram (JSON format), unzipped in your local disk ([click here to download your personal archive](https://www.instagram.com/download/request))

## Getting started

1. Install Typescript: `npm i -g typescript`
2. Install Node.js: `npm i -g ts-node`
3. In the project folder run: `npm i`
3. Create an .env file in the project folder by setting the following variables:

```shell
# username into which you want to import the posts (e.g. "test.bsky.social")
BLUESKY_USERNAME=test
# account password created via App Password
BLUESKY_PASSWORD=pwd123
# Where your archive is located
ARCHIVE_FOLDER=./transfer/place
```

**I highly recommend trying to simulate the import first and import a small range of posts, using the additional parameters documented below.**

## Running the script

You can run the script locally: `npm start` or `npm run start_log` to write an import.log file.

### Optional environment parameters

Additionally you can set these environment variables to customize behavior:

- `SIMULATE` = if set to "1" simulates the import by counting the posts and indicating the estimated import time.
- `MIN_DATE` = indicates the minimum date of posts to import, ISO format (e.g. '2011-01-01' or '2011-02-09T10:30:49.000Z').
- `MAX_DATE` = indicates the maximum date of posts to import, ISO format (e.g. '2012-01-01' or '2014-04-09T12:36:49.328Z').

## License

"Instagram To Bluesky" is published under the MIT license.

Copyright 2024 Marco Maroni

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
