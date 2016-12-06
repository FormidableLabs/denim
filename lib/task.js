"use strict";

var childProc = require("child_process");
var path = require("path");
var zlib = require("zlib");
var _ = require("lodash");
var fs = require("fs-extra");
var async = require("async");
var chalk = require("chalk");
var nopt = require("nopt");
var tar = require("tar");
var temp = require("temp").track(); // track: Clean up all files on process exit.

var OPTIONS = {
  "help": Boolean,
  "version": Boolean,
  "prompts": String
};

var SHORT_OPTIONS = {
  "h": ["--help"],
  "v": ["--version"]
};

/**
 * Task wrapper.
 *
 * @param {Object} opts           Options object
 * @param {Array}  opts.argv      Arguments array (Default: `process.argv`)
 * @param {Object} opts.env       Environment object to mutate (Default `process.env`)
 * @param {Object} opts.script    Script name. (Default: `opts.argv[1]`)
 * @param {String} opts.version   Script version. (Default: `UNKNOWN`)
 * @param {String} opts.initFile  Initialization file.
 * @returns {void}
 */
// eslint-disable-next-line max-statements
var Task = module.exports = function (opts) {
  opts = opts || {};
  this.env = opts.env || process.env;
  var argv = opts.argv || process.argv;
  this.script = opts.script || argv[1];
  this.scriptVersion = opts.version || "UNKNOWN";

  this.initFile = opts.initFile;
  if (!this.initFile) {
    throw new Error("initFile option required");
  }

  // Parse args.
  var parsed = nopt(OPTIONS, SHORT_OPTIONS, argv);
  this.promptsOverrides = (parsed.prompts || "").trim();
  this.modules = parsed.argv.remain;

  // Decide task.
  this.task = this.inflate;
  if (parsed.version) {
    this.task = this.version;
  } else if (parsed.help || this.modules.length === 0) {
    this.task = this.help;
  }
};

/**
 * Selected task _is_ inflate.
 *
 * @returns {Boolean} `true` if inflate task
 */
Task.prototype.isInflate = function () {
  return this.task === this.inflate;
};

/**
 * Help.
 *
 * ```sh
 * $ <script> [-h|--help]
 * ```
 *
 * @param   {Function} callback   Callback function `(err)`
 * @returns {void}
 */
Task.prototype.help = function (callback) {
  var script = this.script;
  var flags = Object.keys(OPTIONS).map(function (key) {
    return "  --" + chalk.cyan(key);
  }).join("\n");

  process.stdout.write(
    chalk.green.bold("Usage") + ": \n\n  " + script + " [flags] <module>" +
    "\n\n" + chalk.green.bold("Flags") + ": \n\n" + flags +
    "\n\n" + chalk.green.bold("Examples") + ": \n\n" +
    "`" + script + "` can install templates from any source that `npm` can, e.g.:\n\n" +
    [
      ["(npm)   ", "templates-module"],
      ["(npm)   ", "templates-module@0.2.0"],
      ["(github)", "FormidableLabs/templates-module"],
      ["(github)", "FormidableLabs/templates-module#v0.2.0"],
      ["(git)   ", "git+ssh://git@github.com:FormidableLabs/templates-module.git"],
      ["(git)   ", "git+ssh://git@github.com:FormidableLabs/templates-module.git#v0.2.0"],
      ["(file)  ", "/FULL/PATH/TO/templates-module"]
    ].map(function (pairs) {
      return "  " + chalk.red(pairs[0]) + " " + script + " " + chalk.cyan(pairs[1]);
    }).join("\n") + "\n\n"
  );

  callback();
};

/**
 * Version.
 *
 * ```sh
 * $ <script> [-v|--version]
 * ```
 *
 * @param   {Function} callback   Callback function `(err)`
 * @returns {void}
 */
Task.prototype.version = function (callback) {
  process.stdout.write(this.scriptVersion + "\n");
  callback();
};

// Expose extracted event for testing.
Task.prototype._onExtracted = function (callback) {
  return callback;
};

// Expose `require()` for testing.
Task.prototype._lazyRequire = function (mod) {
  return require(mod); // eslint-disable-line global-require
};

/**
 * Download a module and expand it for templating use.
 *
 * ```sh
 * $ <script> <module>
 * ```
 *
 * @param   {Function} callback   Callback function `(err, { data: OBJ, src: DIR_PATH })`
 * @returns {void}
 */
Task.prototype.inflate = function (callback) {
  // Validation.
  if (this.modules.length !== 1) {
    return void callback(new Error(
      "Must specify exactly 1 module to install. Found " + this.modules.length +
      " modules: " + this.modules.join(", ")));
  }

  var self = this;
  self.module = self.modules[0];
  self.modName = path.basename(self.module);

  var script = self.script;

  // Create a temporary directory to stash the gzip file, unzip it and return
  // the paths for use in template ingestion.
  async.auto({
    tmpDir: temp.mkdir.bind(temp, script),

    npmPack: ["tmpDir", function (results, cb) {
      cb = _.once(cb);

      // Set up command and arguments assuming Linux / Mac.
      var cmd = "npm";
      var args = ["pack", self.module];

      // Detect and adjust commands if windows.
      var isWin = /^win/.test(process.platform);
      if (isWin) {
        cmd = "cmd";
        args = ["/c", "npm"].concat(args);
      }

      // Use `npm pack MODULE` to do the dirty work of installing off of file, npm
      // git, github, etc.
      //
      // See: https://docs.npmjs.com/cli/pack
      var proc = childProc.spawn(cmd, args, {
        cwd: results.tmpDir,
        env: self.env,
        stdio: "inherit"
      });
      proc.on("error", cb);
      proc.on("close", function (code) {
        cb(code === 0 ? null : new Error(
          "'npm pack " + self.module + "' exited with error code: " + code));
      });
    }],

    gzFilePath: ["npmPack", function (results, cb) {
      fs.readdir(results.tmpDir, function (err, files) {
        if (err) { return void cb(err); }

        if (files.length !== 1) {
          return void cb(
            new Error("Should have exactly 1 downloaded file. Found: " + files.join(", ")));
        }

        var file = files[0];
        if (!/\.tgz$/.test(file)) {
          return void cb(new Error("File should have tgz suffix. Found: " + file));
        }

        cb(null, path.resolve(results.tmpDir, file));
      });
    }],

    extracted: ["gzFilePath", function (results, cb) {
      // Ensure called once, and adds our extracted hook.
      cb = _.once(self._onExtracted(cb));

      var extractedDir = path.resolve(results.tmpDir, "extracted");

      fs.createReadStream(results.gzFilePath)
        .pipe(zlib.createUnzip())
        .pipe(new tar.Extract({
          path: extractedDir,
          strip: 1 // Get rid of `<module-name>/` level of directory
        }))
        .on("error", cb)
        .on("close", cb.bind(null, null, extractedDir));
    }],

    // Check if `extracted/<data>.js` exists. This allows us to distinguish
    // between:
    //
    // 1. a missing `<data>.js` which is allowed.
    // 2. a not found error _in_ `<data>.js` which is not allowed.
    //
    // https://github.com/FormidableLabs/builder-init/issues/32
    dataExists: ["extracted", function (results, cb) {
      var dataPath = path.join(results.tmpDir, "extracted", self.initFile);

      fs.stat(dataPath, function (err) {
        if (err) {
          // Doesn't exist.
          if (err.code === "ENOENT") {
            return void cb(null, false);
          }

          // Actual error
          return void cb(err);
        }

        // Exists.
        cb(null, true);
      });

    }],

    data: ["extracted", "dataExists", function (results, cb) {
      var overrides = self.promptsOverrides ? { overrides: self.promptsOverrides } : {};

      // Skip reading <data> if doesn't exist.
      if (!results.dataExists) {
        return void cb(null, overrides);
      }

      // If exists, try to require in.
      var dataPath = path.join(results.tmpDir, "extracted", self.initFile);
      var data;

      try {
        data = self._lazyRequire(dataPath);
      } catch (err) {
        // Enhance error message.
        err.message += "\n[" + script + "] Error while importing '" +
          self.modName + "/" + self.initFile + "'";

        return void cb(err);
      }

      cb(null, _.extend(data, overrides));
    }]

  }, function (err, results) {
    if (err) { return void callback(err); }

    callback(null, {
      data: results.data || {},
      src: results.tmpDir
    });
  });
};

Task.prototype.execute = function (callback) {
  this.task(callback);
};
