"use strict";

const async = require("async"),
    chalk = require("chalk"),
    glob = require("glob"),
    argv = require("yargs").argv,
    ffmpeg = require("fluent-ffmpeg"),
    fs = require("fs"),
    path = require("path"),
    status = require("node-status"),
    prettyMs = require("pretty-ms"),
    preset = require("./lib/preset"),
    console = status.console(),
    globPath = path.resolve(__dirname, argv._[0]),
    subExtentions = [
        "srt", "sub", "ssa", "ass", "stl", "pjs", "jss", "rt", "smi"
    ],
    pattern = "{uptime.green} {spinner.cyan} Converted: {convert.custom} | {convert.percentage} {convert.bar}";

// Only supports mkv right now
// ignores image based subtitles

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

let completed = 0, matches = 0;

function convertMedia(media, done) {
    const basename = path.basename(media),
        ext = path.extname(media),
        output = media.replace(ext, ".mp4"),
        start = Date.now();

    async.waterfall([
        next => ffmpeg.ffprobe(media, next),
        (meta, next) => {
            let progress = {};

            const convertStatus = status.addItem("convert", {
                label: basename,
                custom: () => `${completed}/${matches} | ${chalk.magenta(basename)} | ${progress.currentKbps}kb/s | ${progress.timemark}`,
                max: 100
            });

            ffmpeg(media)
                .preset(preset(meta))
                // .on("start", cli => console.log(cli + "\n"))
                .on("progress", prog => {
                    progress = prog;
                    convertStatus.inc(prog.percent - convertStatus.val);
                })
                .on("end", () => next())
                .on('error', (err) => next(err))
                .save(output);
        },
        next => fs.access(output, fs.constants.F_OK, next),
        next => fs.unlink(media, next)
    ], err => {
        completed += 1;

        if (err) {
            console.log(`${chalk.red("✖")} Error processing ${basename} ${err.message}`);

            return done(err);
        }

        console.log(`${chalk.green("✔")} ${prettyMs(Date.now() - start)} | Processed ${basename}`);

        done();
    });
}

async.waterfall([
    next => glob(globPath, next),
    (files, next) => {
        matches = files.length;

        status.start({ pattern });

        async.eachSeries(files, (file, cb) => {
            convertMedia(file, cb);
        }, next);
    }
], () => {
    status.stop();

    console.log(`🎉 Finished processing ${completed} files`);
});
