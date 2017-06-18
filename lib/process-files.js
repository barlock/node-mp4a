"use strict";

const async = require("async"),
    chalk = require("chalk"),
    glob = require("glob"),
    path = require("path"),
    os = require("os"),
    ProgressBar = require("progress"),
    mediaConverter = require("./media-converter"),
    supportedExts = [ ".mp4", ".avi", ".mkv" ];

chalk.enabled = process.env.COLORS !== "false";

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

    console.log(`Scanning for media: ${globPath}`);

    async.waterfall([
        next => glob(globPath, next),
        (files, next) => {
            files = files.filter(file => {
                return supportedExts.includes(path.extname(file));
            });

            console.log(`Checking for already converted files:`);

            const bar = new ProgressBar(`${chalk.green(":current")}/:total | :percent [${chalk.green(":bar")}] eta: :etas `, {
                total: files.length,
                width: 20,
                clear: true
            });

            async.filterLimit(files, 16, (file, cb) => {
                mediaConverter.isAlreadyProcessed(file, (err, isProcessed) => {
                    bar.tick();

                    if (err) {
                        bar.interrupt(`${chalk.red("✘")} Couldn't read stream data: ${file}`);

                        return cb(null, false);
                    }

                    cb(null, !isProcessed);
                })
            }, (err, files) => {
                bar.terminate();

                next(err, files);
            });
        },
        (files, next) => {
            const converter = mediaConverter(files.length);

            console.log(`Processing ${files.length} files`);

            async.eachSeries(files, (file, cb) => {
                converter(file, cb);
            }, next);
        }
    ], err => {
        console.log(`🎉 Finished processing files`);

        done(err);
    });
};