"use strict";

const async = require("async"),
    glob = require("glob"),
    argv = require("yargs").argv,
    path = require("path"),
    status = require("node-status"),
    console = status.console(),
    mediaConverter = require("./lib/media-converter"),
    globPath = path.resolve(__dirname, argv._[0]);

/**
 * Given: A non mp4
 *   When: Converting to an mp4
 *   Then: Copy over all english streams
 *
 * Given: A non mp4
 *   When: Converting to an mp4 without any recognizable english streams
 *   Then: Copy over all streams
 *
 * Given: An mp4
 *   When: There isn't a 2c aac audio track
 *   Then: convert the best eng track to be a 2c aac track
 *
 * Given: An mp4
 *   When: There is a 2c aac audio track
 *   Then: convert the track to be aac
 *
 * Given: An srt
 *   When: matching an mp4
 *   Then: convert to mov_text and embed in the video
 *
 * Given: An mp4
 *   When: the video codec is non h.264
 *   Then: create an h.264 version?
 */



async.waterfall([
    next => glob(globPath, next),
    (files, next) => {
        console.log(`Processing ${files.length} files`);

        const converter = mediaConverter(status, files.length);
        
        status.start();

        async.eachSeries(files, (file, cb) => {
            converter(file, cb);
        }, next);
    }
], () => {
    status.stop();

    console.log(`🎉 Finished processing files`);
});
