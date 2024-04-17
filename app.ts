import * as dotenv from 'dotenv';
import FS from 'fs';
import * as process from 'process';

import { BskyAgent, RichText } from '@atproto/api';

dotenv.config();

const agent = new BskyAgent({
    service: 'https://bsky.social',
})

const SIMULATE = process.env.SIMULATE === "1";

const API_DELAY = 2500; // https://docs.bsky.app/docs/advanced-guides/rate-limits

const TWITTER_HANDLE = process.env.TWITTER_HANDLE;

let MIN_DATE: Date | undefined = undefined;
if (process.env.MIN_DATE != null && process.env.MIN_DATE.length > 0)
    MIN_DATE = new Date(process.env.MIN_DATE as string);

let MAX_DATE: Date | undefined = undefined;
if (process.env.MAX_DATE != null && process.env.MAX_DATE.length > 0)
    MAX_DATE = new Date(process.env.MAX_DATE as string);

function decodeUTF8(data) {
    if (typeof data === "string") {
        const charCodes = Array.prototype.map.call(data, (c) => c.charCodeAt(0)) as number[];
        const utf8 = new Uint8Array(charCodes);
        return new TextDecoder("utf-8").decode(utf8);
    }

    if (Array.isArray(data)) {
        return data.map(decodeUTF8);
    }

    if (typeof data === "object") {
        const obj = {};
        Object.entries(data).forEach(([key, value]) => {
            obj[key] = decodeUTF8(value);
        });
        return obj;
    }

    return data;
}


async function main() {
    console.log(`Import started at ${new Date().toISOString()}`)

    const fInstaPosts = FS.readFileSync(process.env.ARCHIVE_FOLDER + "/your_instagram_activity/content/posts_1.json");
    const instaPosts = decodeUTF8(JSON.parse(fInstaPosts.toString()));
    let importedPosts = 0;
    let importedMedia = 0;
    if (instaPosts != null && instaPosts.length > 0) {

        const sortedPost = instaPosts.sort((a, b) => {
            let ad = new Date(a.media[0].creation_timestamp * 1000).getTime();
            let bd = new Date(b.media[0].creation_timestamp * 1000).getTime();
            return ad - bd;
        });

        await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! })

        for (let index = 0; index < sortedPost.length; index++) {
            const post = sortedPost[index];
            let location = {
                latitude: 0.0,
                longitude: 0.0
            };

            let postDate: Date | undefined = undefined;
            if (post.creation_timestamp != undefined)
                postDate = new Date(post.creation_timestamp * 1000);

            let postText = "";
            if (post.title && post.title.length > 0)
                postText = post.title;

            // If the post is made up of a single image,
            // the text of the post appears to be associated with the only image present
            if (post.media?.length == 1) {
                if (postText.length == 0) {
                    postText = post.media[0].title;
                }
                if (postDate == undefined) {
                    postDate = new Date(post.media[0].creation_timestamp * 1000);
                }
            }

            //this cheks assume that the array is sorted by date (first the oldest)
            if (MIN_DATE != undefined && postDate! < MIN_DATE)
                continue;
            if (MAX_DATE != undefined && postDate! > MAX_DATE)
                break;

            console.log(`Parse Instagram post'`);
            console.log(` Created at ${postDate?.toISOString()}`);
            console.log(` Text '${postText}'`);

            let embeddedImage = [] as any;
            for (let j = 0; j < post.media.length; j++) {
                const postMedia = post.media[j];
                const mediaDate = new Date(postMedia.creation_timestamp * 1000);
                let mediaText = postMedia.title;

                // if (postMedia.uri == "media/posts/202108/240742101_558570538822653_7921317535156034037_n_17968506598442521.jpg") {
                //     console.log("debug");
                // }

                if (j > 3) {
                    console.warn("Bluesky does not support more than 4 images per post, excess images will be discarded.")
                    break;
                }

                const fileType = postMedia.uri.substring(postMedia.uri.lastIndexOf(".") + 1)
                let mimeType = "";
                switch (fileType) {
                    case "heic":
                        mimeType = "image/heic"
                        break;
                    case "webp":
                        mimeType = "image/webp"
                        break;
                    case "jpg":
                        mimeType = "image/jpeg"
                        break;
                    default:
                        console.error("Unsopported image file type" + fileType);
                        break;
                }
                if (mimeType.length <= 0)
                    continue;

                const mediaFilename = `${process.env.ARCHIVE_FOLDER}/${postMedia.uri}`;
                const imageBuffer = FS.readFileSync(mediaFilename);

                if (postMedia.media_metadata?.photo_metadata?.exif_data?.length > 0) {
                    location = postMedia.media_metadata?.photo_metadata?.exif_data![0];
                    mediaText += `\ngeo:${location.latitude},${location.longitude}`;
                }

                console.log(` Media ${j} - ${postMedia.uri}`);
                console.log(`  Created at ${mediaDate.toISOString()}`);
                console.log(`  Text '${mediaText}'`);

                if (!SIMULATE) {
                    const blobRecord = await agent.uploadBlob(imageBuffer, {
                        encoding: mimeType
                    });

                    embeddedImage.push({
                        alt: mediaText,
                        image: {
                            $type: "blob",
                            ref: blobRecord.data.blob.ref,
                            mimeType: blobRecord.data.blob.mimeType,
                            size: blobRecord.data.blob.size
                        }
                    })
                }

                importedMedia++;
            }

            const rt = new RichText({
                text: postText
            });
            await rt.detectFacets(agent);
            const postRecord = {
                $type: 'app.bsky.feed.post',
                text: rt.text,
                facets: rt.facets,
                createdAt: postDate?.toISOString(),
                embed: embeddedImage.length > 0 ? { $type: "app.bsky.embed.images", images: embeddedImage } : undefined,
            }

            if (!SIMULATE) {
                //I wait 3 seconds so as not to exceed the api rate limits
                await new Promise(resolve => setTimeout(resolve, API_DELAY));

                const recordData = await agent.post(postRecord);
                const i = recordData.uri.lastIndexOf("/");
                if (i > 0) {
                    const rkey = recordData.uri.substring(i + 1);
                    const postUri = `https://bsky.app/profile/${process.env.BLUESKY_USERNAME!}/post/${rkey}`;
                    console.log("Bluesky post create, URL: " + postUri);
                    importedPosts++;
                } else {
                    console.warn(recordData);
                }
            } else {
                importedPosts++;
            }
        }
    }

    if (SIMULATE) {
        // In addition to the delay in AT Proto API calls, we will also consider a 10% delta for image upload
        const minutes = Math.round(((importedMedia * API_DELAY / 1000) / 60) * 1.10)
        const hours = Math.floor(minutes / 60);
        const min = minutes % 60;
        console.log(`Estimated time for real import: ${hours} hours and ${min} minutes`);
    }

    console.log(`Import finished at ${new Date().toISOString()}, imported ${importedPosts} posts with ${importedMedia} media`)
}

main();
