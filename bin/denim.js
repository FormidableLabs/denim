#!/usr/bin/env node
"use strict";

var _ = require("lodash");

var init = require("../lib/index").init;
var pkg = require("../package.json");

var SCRIPT_NAME = "denim";
var INIT_FILE = "denim.js";
var TEMPLATES_DIR = "templates";

// Runner
var run = module.exports = function (opts, callback) {
  return init(_.extend({
    script: SCRIPT_NAME,
    version: pkg.version,
    initFile: INIT_FILE,
    prompts: {
      derived: {
        // Directory containing templates
        _templatesDir: function (data, cb) { cb(null, TEMPLATES_DIR); }
      }
    }
  }, opts), callback);
};

// Script
if (require.main === module) {
  run(null, function (err) {
    // Try to get full stack, then full string if not.
    if (err) {
      console.error(err.stack || err.toString()); // eslint-disable-line no-console
    }

    process.exit(err ? err.code || 1 : 0); // eslint-disable-line no-process-exit
  });
}
