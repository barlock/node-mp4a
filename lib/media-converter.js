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

function alreadyConverted (file, meta) {
    const ext = path.extname(file),
        audioHas2chAac = meta.streams
            .filter(stream => stream.codec_type === "audio")
            .some(stream => stream.codec_name === "aac" && stream.channels === 2);

    return ext === ".mp4" && audioHas2chAac;
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

        async.waterfall([
            next => ffmpeg.ffprobe(media, next),
            (meta, next) => {
                if (alreadyConverted(media, meta)) {
                    next(new Error("skipping"));
                } else {
                    backup = output + ".backup";

                    fs.copy(media, backup, (err) => {
                        if (err) {
                            return next(err);
                        }

                        next(null, meta);
                    })
                }
            },
            (meta, next) => {
                let progress = {};

                const convertStatus = status.addItem("convert", {
                    label: basename,
                    custom: () => `${completed}/${total} | ${chalk.magenta(basename)} | ${progress.currentKbps}kb/s | ${progress.timemark}`,
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
                console.log(`${chalk.red("✖")} Skipping: ${basename}`);
            } else if (err) {
                console.log(`${chalk.red("✖")} Error processing ${basename}: ${err.message}`);
            } else {
                console.log(`${chalk.green("✔")} ${prettyMs(Date.now() - start)} | Processed ${basename}`);
            }

            done();
        });
    }
};