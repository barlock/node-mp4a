"use strict";

const async = require("async"),
    chalk = require("chalk"),
    glob = require("glob"),
    fs = require("fs"),
    path = require("path"),
    os = require("os"),
    _ = require("lodash"),
    ProgressBar = require("progress"),
    mediaConverter = require("./media-converter"),
    supportedExts = [ ".mp4", ".avi", ".mkv" ];

chalk.enabled = process.env.COLORS !== "false";

module.exports = (dir, done = () => {}) => {
    console.log(dir);

    const  globPath = path.resolve(__dirname, dir, "**/*.*");

    async.waterfall([
        next => glob(globPath, next),
        (files, next) => {
            files = _(files)
                .filter(file => {
                    return supportedExts.includes(path.extname(file));
                })
                .reduce((map, file) => {
                    const basename = path.basename(file, path.extname(file));

                    map[basename] = map[basename] ? map[basename] : [];

                    map[basename].push(file);

                    return map;
                }, {});

            files = _.filter(files, fileCollection => fileCollection.length === 2)
                .map(collection => ({
                    original: collection.find(file => path.extname(file) !== ".mp4"),
                    converted: collection.find(file => path.extname(file) === ".mp4")
                }));

            console.log(`Found ${files.length} potential duplicates:`);

            const bar = new ProgressBar(`${chalk.green(":current")}/:total | :percent [${chalk.green(":bar")}] eta: :etas `, {
                total: files.length,
                width: 20,
                clear: true
            });

            async.eachLimit(files, 16, (collection, cb) => {
                mediaConverter.isAlreadyProcessed(collection.converted, (err, isProcessed) => {
                    bar.tick();

                    if (err) {
                        bar.interrupt(`${chalk.red("✘")} Couldn't read stream data: ${collection.converted}`);

                        return cb(null, false);
                    }

                    if (isProcessed) {
                        bar.interrupt(`Deleting ${collection.original}`);

                        fs.unlink(collection.original, cb);
                    }
                })
            }, (err) => {
                bar.terminate();

                next(err);
            });
        }
    ], err => {
        console.log(`🎉 Finished cleaning up files`);

        done(err);
    });
};