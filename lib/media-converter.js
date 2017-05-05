"use strict";

const async = require("async"),
    chalk = require("chalk"),
    ffmpeg = require("fluent-ffmpeg"),
    fs = require("fs-extra"),
    path = require("path"),
    prettyMs = require("pretty-ms"),
    preset = require("./preset"),
    subExtentions = [
        "srt", "sub", "ssa", "ass", "stl", "pjs", "jss", "rt", "smi"
    ],
    pattern = "{uptime.green} {spinner.cyan} Converted: {convert.custom} | {convert.percentage} {convert.bar}";

function alreadyConverted (meta) {
    const audioHas2chAac = meta.streams
            .filter(stream => stream.codec_type === "audio")
            .some(stream => stream.codec_name === "aac" && stream.channels === 2);

    return audioHas2chAac;
}

module.exports = (status, total) => {
    const console = status.console();

    let completed = 0;

    status.setPattern(pattern);

    status.addItem("convert", {
        custom: () => `${completed}/${total}`
    });

    return (media, done) => {
        const basename = path.basename(media),
            ext = path.extname(media),
            output = media.replace(ext, ".mp4"),
            start = Date.now();

        let backup = false;

        console.log(`⚛️ Processing ${basename}`);

        async.waterfall([
            next => ffmpeg.ffprobe(media, next),
            (meta, next) => {
                const ext = path.extname(media);

                if (ext === ".mp4" && alreadyConverted(meta)) {
                    next(new Error("skipping"));
                } else if (media === output) {
                    backup = output + ".backup";

                    console.log("\tℹ️ Creating backup");
                    fs.copy(media, backup, (err) => {
                        if (err) {
                            return next(err);
                        }

                        next(null, meta);
                    })
                } else {
                    next(null, meta);
                }
            },
            (meta, next) => {
                let progress = {},
                    command;

                const convertStatus = status.addItem("convert", {
                    label: basename,
                    custom: () => `${completed}/${total} | ${chalk.magenta(basename)} | ${progress.currentKbps}kb/s | ${progress.timemark}`,
                    max: 100
                });

                ffmpeg(media)
                    .preset(preset(meta, console))
                    .on("start", cli => command = cli)
                    .on("progress", prog => {
                        progress = prog;
                        convertStatus.inc(prog.percent - convertStatus.val);
                    })
                    .on("end", () => {

                        console.log("\tℹ️ Processing done, cleaning up");
                        next()
                    })
                    .on('error', (err) => {
                        console.log(meta);
                        console.log(command);
                        next(err)
                    })
                    .save(output);
            },
            next => fs.access(output, fs.constants.F_OK, next),
            next => fs.unlink(media, next),
            next => {
                if (backup) {
                    fs.unlink(backup, next);
                } else {
                    next();
                }
            }
        ], err => {
            completed += 1;

            if (err && err.message === "skipping") {
                console.log(`\t⭕️ Skipping`);
            } else if (err) {
                console.log(`\t❌ Error processing: ${err.message}`);

                return done(err);
            } else {
                console.log(`\t✅ Completed processing in ${prettyMs(Date.now() - start)}`);
            }

            done();
        });
    }
};