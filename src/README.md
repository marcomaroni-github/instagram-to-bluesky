# Main

`main.ts` is the entry point that runs the async application code located in `instagram-to-bluesky.ts`.

## Instagram to Bluesky

`instagram-to-bluesky.ts` is responsible for configuration and delegating to the [media](./media/media.ts) processor which uses media specific processors ([image](./image/image.ts)/[video](./video/video.ts)) that transform the raw instagram post data into a format that can be sent to the [bluesky client](./bluesky/bluesky.ts).
