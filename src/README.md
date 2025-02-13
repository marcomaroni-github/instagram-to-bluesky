# Audience
> Fellow software developers and script kiddies.

# Instagram to Bluesky
Consumes exported instagram posts, and media files, and produce Bluesky post and embedded media.


# Architecture
 [`main.ts`](./main.ts) is the entry point that runs the async application code located in [`instagram-to-bluesky.ts`](./instagram-to-bluesky.ts).

[`instagram-to-bluesky.ts`](./instagram-to-bluesky.ts) is responsible for configuration and delegating to the [media](./media/media.ts) processor which uses media specific processors ([image](./image/image.ts)/[video](./video/video.ts)) that transform the raw instagram post data into a format that can be sent to the [bluesky client](./bluesky/bluesky.ts).