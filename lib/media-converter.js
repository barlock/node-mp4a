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
    ],
    aviAcceptableChange = .5,
    acceptableChange = .15;

let converter;

function removeFiles (mediaPath, backupPath, bar, done) {
    async.waterfall([
        next => fs.unlink(mediaPath, next),
        next => {
            if (backupPath) {
                bar.interrupt("  ├ Removing backup");

                fs.unlink(backupPath, next);
            } else {
                next();
            }
        }
    ], done);
}

function cleanup (inputPath, outputPath, backupPath, bar, done) {
    const inputExt = path.extname(inputPath);

    async.autoInject({
        inputStats: next => fs.stat(inputPath, next),
        outputStats: next => fs.stat(outputPath, next),
        outputProbe: next => ffmpeg.ffprobe(outputPath, next),
        success: (inputStats, outputStats, outputProbe, next) => {
            const diffRatio = Math.abs((inputStats.size - outputStats.size) / inputStats.size),
                extAcceptableChange = inputExt === "avi" ? aviAcceptableChange : acceptableChange;

            bar.interrupt(`  ├─ Output size ratio: ${diffRatio}`);

            next(null, alreadyConverted(outputProbe) && diffRatio < extAcceptableChange)
        },
        cleanup: (success, next) => {
            if (success) {
                bar.interrupt("  ├ Conversion successful, cleaning up");

                removeFiles(inputPath, backupPath, bar, next);
            } else {
                bar.interrupt("  ├ Conversion failed, removing output");

                removeFiles(outputPath, backupPath, bar, () => {
                    next(new Error("Conversion failed"));
                });
            }
        }
    }, (err) => {
        if (err && err.message !== "Conversion failed") {
            bar.interrupt("  ├ Error checking output, removing");

            removeFiles(outputPath, backupPath, bar, () => {
                done(err);
            });
        } else {
            done(err);
        }
    })
}

module.exports = converter = (total) => {
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

        bar.interrupt(`${chalk.green(completed + 1)}/${total} - ${chalk.magenta(basename)}`);

        async.waterfall([
            next => converter.isAlreadyProcessed(media, next),
            (isAlreadyProcessed, meta, next) => {
                bar.interrupt(`  ├ Detected stream information`);

                ["video", "audio", "subtitle"].forEach(type => {
                    const data = meta.streams
                        .filter(stream => stream.codec_type === type)
                        .map(stream => {
                            let info = stream.codec_name;

                            if (stream.tags && stream.tags.language) {
                                info += ` (${stream.tags.language})`
                            }

                            return info;
                        })
                        .join(", ");

                    bar.interrupt(`  ├─ ${type}: ${data}`);
                });

                if (isAlreadyProcessed) {
                    next(new Error("skipping"));
                } else if (media === output) {
                    backup = output + ".backup";

                    bar.interrupt("  ├ Creating backup");

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
                        bar.interrupt("  ├ Processing done");
                        clearInterval(intervalId);
                        next()
                    })
                    .on("stderr", line => {
                        // bar.interrupt(chalk.red(line));
                    })
                    .on('error', (err) => {
                        bar.interrupt(chalk.red(command));
                        clearInterval(intervalId);

                        removeFiles(output, backup, bar, () => {
                            next(err);
                        });
                    })
                    .save(output);
            },
            next => cleanup(media, output, backup, bar, next),
        ], err => {
            completed += 1;

            if (err && err.message === "skipping") {
                bar.interrupt(`  └ ${chalk.yellow("▸▸")} Skipping`);
            } else if (err) {
                bar.interrupt(`  └ ${chalk.red("✘")} Error processing: ${err.message}`);

                // return done(err);
            } else {
                bar.interrupt(`  └ ${chalk.green("✔")}︎ Completed in ${chalk.blue(prettyMs(Date.now() - start))}`);
            }

            bar.terminate();
            console.log("\n");

            done();
        });
    }
};

function alreadyConverted (meta) {
    const audioHas2chAac = meta.streams
        .filter(stream => stream.codec_type === "audio")
        .some(stream => stream.codec_name === "aac" && stream.channels === 2);

    return audioHas2chAac;
}

converter.isAlreadyProcessed = (media, done) => {
    const ext = path.extname(media);

    async.waterfall([
        next => ffmpeg.ffprobe(media, next),
        (meta, next) => {
            if (ext === ".mp4" && alreadyConverted(meta)) {
                next(null, true, meta);
            } else {
                next(null, false, meta);
            }
        }
    ], done);
};