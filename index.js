"use strict";

const argv = require("yargs").argv,
    schedule = require("node-schedule"),
    processFiles = require("./lib/process-files"),
    cron = process.env.CRON || argv.cron,
    directory =  process.env.DIRECTORY || argv._[0];

if (argv.cleanup) {
    require("./lib/cleanup")(directory);
} else {
    if (cron) {
        schedule.scheduleJob(cron, () => processFiles(directory));
    } else {
        processFiles(directory);
    }
}

