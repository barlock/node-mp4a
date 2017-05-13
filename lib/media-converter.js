"use strict";

const async = require("async"),
    chalk = require("chalk"),
    ffmpeg = require("fluent-ffmpeg"),
    fs = require("fs-extra"),
    path = require("path"),
    prettyMs = require("pretty-ms"),
    prettyBytes = require("pretty-bytes"),
    ProgressBar = require("progress"),
    preset = require("./preset"),
    subExtentions = [
        "srt", "sub", "ssa", "ass", "stl", "pjs", "jss", "rt", "smi"
    ];

function alreadyConverted (meta) {
    const audioHas2chAac = meta.streams
            .filter(stream => stream.codec_type === "audio")
            .some(stream => stream.codec_name === "aac" && stream.channels === 2);

    return audioHas2chAac;
}

module.exports = (total) => {
    let completed = 0;

    return (media, done) => {
        const basename = path.basename(media),
            ext = path.extname(media),

            bar = new ProgressBar(`  └ ${chalk.cyan(":uptime")} | :kbps kb/s | Frame: :timemark | :percent [${chalk.green(":bar")}] :targetSize eta: :etas `, {
                total: 100,
                width: 20,
                clear: true
            }),
            output = media.replace(ext, ".mp4"),
            start = Date.now();

        let backup = false;

        bar.interrupt(`${chalk.blue(completed + 1)}/${total} - ${chalk.magenta(basename)}`);

        async.waterfall([
            next => ffmpeg.ffprobe(media, next),
            (meta, next) => {
                const ext = path.extname(media);

                bar.interrupt(`  └ Detected stream information`);

                ["video", "audio", "subtitle"].forEach(type => {
                    const data = meta.streams
                        .filter(stream => stream.codec_type === type)
                        .map(stream => `${stream.codec_name} (${stream.tags.language})`)
                        .join(", ");

                    bar.interrupt(`    └ ${type}: ${data}`);
                });

                if (ext === ".mp4" && alreadyConverted(meta)) {
                    next(new Error("skipping"));
                } else if (media === output) {
                    backup = output + ".backup";

                    bar.interrupt("  └ Creating backup");

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
                    command,
                    intervalId;

                ffmpeg(media)
                    .preset(preset(meta, console))
                    .on("start", cli => command = cli)
                    .on("progress", prog => {
                        progress = prog;

                        if (!intervalId) {
                            intervalId = setInterval(() => {
                                bar.tick(0, {
                                    uptime: prettyMs(Math.round((Date.now() - start) / 1000) * 1000),
                                    timemark: progress.timemark,
                                    fps: progress.currentFps,
                                    kbps: progress.currentKbps,
                                    targetSize: prettyBytes(progress.targetSize * 1000)
                                });
                            }, 1000)
                        }

                        bar.update(prog.percent / 100);
                    })
                    .on("end", () => {
                        bar.interrupt("  └ Processing done, cleaning up");
                        clearInterval(intervalId);
                        next()
                    })
                    .on("stderr", line => {
                        bar.interrupt(chalk.red(line));
                    })
                    .on('error', (err) => {
                        clearInterval(intervalId);

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
                bar.interrupt(`  └ ${chalk.yellow("▸▸")} Skipping`);
            } else if (err) {
                bar.interrupt(`  └ ${chalk.red("✘")} Error processing: ${err.message}`);

                return done(err);
            } else {
                bar.interrupt(`  └ ${chalk.green("✔")}︎ Completed in ${prettyMs(Date.now() - start)}`);
            }

            bar.terminate();

            done();
        });
    }
};