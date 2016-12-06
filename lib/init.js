"use strict";

var path = require("path");
var async = require("async");
var chalk = require("chalk");

var prompts = require("../lib/prompts");
var Templates = require("../lib/templates");
var Task = require("../lib/task");

/**
 * Initialization wrapper.
 *
 * @param {Object}    opts            Options object for Task.
 * @param {Array}     opts.argv       Arguments array (Default: `process.argv`)
 * @param {Object}    opts.env        Environment object to mutate (Default `process.env`)
 * @param {Object}    opts.script     Environment object to mutate (Default `opts.argv[1]`)
 * @param {String}    opts.version    Script version. (Default: `UNKNOWN`)
 * @param {String}    opts.initFile   Initialization file.
 * @param {Object}    opts.prompts    Prompts, derived defaults.
 * @param {Function}  callback        Callback from script run `(err, results)`.
 * @returns {void}
 */
module.exports = function (opts, callback) {
  opts = opts || {};
  var task = new Task(opts);
  var bin = chalk.green.bold("[" + task.script + "]");

  // Help, version, etc. - just call straight up.
  if (!task.isInflate()) {
    return void task.execute(callback);
  }

  // Actual initialization.
  async.auto({
    download: task.execute.bind(task),

    data: ["download", function (results, cb) {
      process.stdout.write(
        bin + " Preparing templates for: " + chalk.magenta(task.modName) + "\n"
      );

      prompts({
        init: results.download.data,
        defaults: opts.prompts,
        src: results.download.src
      }, cb);
    }],

    templates: ["data", function (results, cb) {
      if (!results.data.destination) {
        return void cb(new Error("Destination field missing from prompts"));
      }

      var templates = new Templates({
        src: results.download.src,
        dest: path.resolve(results.data.destination),
        data: results.data
      });

      templates.process(function (err, outFiles) {
        if (err) { return void cb(err); }

        process.stdout.write(
          "\n" + bin + " Wrote files: \n" +
          (outFiles || []).map(function (obj) {
            return " - " + chalk.cyan(path.relative(process.cwd(), obj.dest));
          }).join("\n") + "\n"
        );

        cb();
      });
    }]
  }, function (err, results) {
    if (!err) {
      process.stdout.write(
        "\n" + bin + " New " + chalk.magenta(task.modName) + " project is ready at: " +
        chalk.cyan(path.relative(process.cwd(), results.data.destination)) + "\n"
      );
    }

    callback(err);
  });
};
