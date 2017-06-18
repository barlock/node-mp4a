"use strict";

const argv = require("yargs").argv,
    schedule = require("node-schedule"),
    processFiles = require("./lib/process-files"),
    cron = process.env.CRON || argv.cron,
    directory =  process.env.DIRECTORY || argv._[0];

if (!process.stderr.clearLine) {
    process.stderr.clearLine = function (dir) {
        require('readline').clearLine(this, dir);
    }
}

if (!process.stderr.cursorTo) {
    process.stderr.cursorTo = function (x, y) {
        require('readline').cursorTo(this, x, y);
    }
}

if (argv.cleanup) {
    require("./lib/cleanup")(directory);
} else {
    if (cron) {
        schedule.scheduleJob(cron, () => processFiles(directory));
    } else {
        processFiles(directory);
    }
}

