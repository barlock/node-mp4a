"use strict";

const argv = require("yargs").argv,
    processFiles = require("./lib/process-files"),
    directory =  process.env.DIRECTORY || argv._[0];

processFiles(directory);
