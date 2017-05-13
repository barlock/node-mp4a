"use strict";

const async = require("async"),
    glob = require("glob"),
    path = require("path"),
    mediaConverter = require("./media-converter"),
    supportedExts = [ ".mp4", ".avi", ".mkv" ];

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

module.exports = (dir, done = () => {}) => {
    const  globPath = path.resolve(__dirname, dir, "**/*.*");

    async.waterfall([
        next => glob(globPath, next),
        (files, next) => {
            files = files.filter(file => {
                return supportedExts.includes(path.extname(file));
            });

            console.log(`Processing ${files.length} files`);

            const converter = mediaConverter(files.length);

            async.eachSeries(files, (file, cb) => {
                converter(file, cb);
            }, next);
        }
    ], err => {
        console.log(`🎉 Finished processing files`);

        done(err);
    });
};