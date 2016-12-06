"use strict";

var path = require("path");
var _ = require("lodash");
var async = require("async");
var fs = require("fs-extra");
var ignoreParser = require("gitignore-parser");
var isBinaryFile = require("isbinaryfile");
var fileType = require("file-type");

// Lodash template setup.
//
// HACK: Force ERB style by cloning regexp source. There's a `===` check for
// "unchanged" that adds in the ES stuff.
// https://github.com/lodash/lodash/blob/3.6.2-npm-packages/lodash.template/index.js#L26-L27
_.templateSettings.interpolate = new RegExp(_.templateSettings.interpolate.source);
// Remove HTML escaping.
_.templateSettings.escape = null;

/**
 * Templates wrapper object.
 *
 * @param {Object}    opts          Options
 * @param {String}    opts.src      Directory containing templates
 * @param {String}    opts.dest     Processed output file path
 * @param {Object}    opts.data     Template data
 * @returns {void}
 */
var Templates = module.exports = function (opts) {
  opts = opts || {};
  this.src = opts.src;
  this.dest = opts.dest;
  this.data = opts.data || {};
};

// Curly-brace template regexp for filename parsing.
Templates.prototype.FILENAME_RE = /\{\{([^\}]+?)\}\}/g;

// Start or end curly special types.
Templates.prototype.START_END_RE = /\{\{|\}\}/;

/**
 * Resolve / parse file name into full destination path.
 *
 * Uses a very simple curly-brace templating scheme of:
 *
 * ```
 * "{{foo}}.js" -> ({foo: "bar"}) -> "bar.js"
 * ```
 *
 * Notes
 * - Throws error on unmatched tokens missing in `this.data`.
 * - Throws error if finds token start / end within matched text.
 *
 * @param {String}    dest  File path name or template string
 * @returns {String}        Resolved file path name
 */
Templates.prototype.resolveFilename = function (dest) {
  if (!dest) { return ""; }

  var self = this;
  return dest.replace(self.FILENAME_RE, function (raw, token) {
    if (self.START_END_RE.test(token)) {
      throw new Error("Forbidden template characters in: '" + token + "' for path: " + dest);
    }

    var data = self.data[token];
    if (!data) {
      throw new Error("Unknown token: '" + token + "' for path: " + dest);
    }

    return data;
  });
};

/**
 * Read single input file and callback with data object.
 *
 * ```js
 * {
 *   dest: /OUTPUT/PATH
 *   buffer: RAW_BUFFER
 * }
 * ```
 *
 * @param {Object}    opts      Options
 * @param {String}    opts.src  Template source file path
 * @param {String}    opts.dest Unparsed output file path
 * @param {Function}  callback  Callback function `(err, data)`
 * @returns {void}
 */
Templates.prototype.readTemplate = function (opts, callback) {
  fs.readFile(opts.src, function (err, buffer) {
    callback(err, { dest: opts.dest, buffer: buffer });
  });
};

/**
 * Parse and inflate template object with data.
 *
 * Output data format:
 *
 * ```js
 * {
 *   dest: /OUTPUT/PATH
 *   buffer: RAW_BUFFER
 *   content: PROCESSED_STRING|null
 * }
 * ```
 *
 * `content` field is `null` if unprocessed template. We apply a heuristic to
 * detect if the given file is potentially a text file template.
 *
 * @param {Object}    opts          Options
 * @param {String}    opts.dest     Unparsed output file path
 * @param {Buffer}    opts.buffer   Unprocessed output file content buffer
 * @param {Function}  callback      Callback function `(err, data)`
 * @returns {void}
 */
/*eslint-disable max-statements*/
Templates.prototype.processTemplate = function (opts, callback) {
  // Resolved _destination_ path with bespoke {{}} parsing.
  //
  // _Note_: This can potentially throw, but we've already called this function
  // on the _source_ file name and it should have thrown then, if at all.
  var dest = this.resolveFilename(opts.dest);

  // Decide if a template, and inflate if so.
  var data = { dest: dest, content: null, buffer: opts.buffer };

  // First, check magic numbers to see if we are a possible text file.
  //
  // _Note_: While a `sync`-named method, there's no actual sync I/O.
  var possiblyText = !isBinaryFile.sync(opts.buffer, opts.buffer.length);
  if (!possiblyText) { return void callback(null, data); }

  // Then check if we have known non-text file types.
  var isBinary = !!fileType(opts.buffer);
  if (isBinary) { return void callback(null, data); }

  // Finally, only update content if it actually **changed**.
  var raw = opts.buffer.toString();
  var parsed = _.template(raw)(this.data);
  if (raw !== parsed) {
    data.content = parsed;
  }

  callback(null, data);
};
/*eslint-enable max-statements*/

/**
 * Write template file to disk, creating intermediate paths.
 *
 * @param {Object}    opts          Options
 * @param {String}    opts.dest     Processed output file path
 * @param {String}    opts.content  Processed output file contents
 * @param {Buffer}    opts.buffer   Unprocessed output file content buffer
 * @param {Function}  callback      Callback function `(err)`
 * @returns {void}
 */
Templates.prototype.writeTemplate = function (opts, callback) {
  // Use content if actually processed, otherwise original raw buffer.
  var data = opts.content !== null ? opts.content : opts.buffer;

  async.series([
    fs.ensureFile.bind(fs, opts.dest),
    fs.writeFile.bind(fs, opts.dest, data)
  ], callback);
};

/**
 * Statefully load templates. (Does not process templates).
 *
 * ```
 * [
 *   { dest: "RAW_PATH_01", content: "RAW_CONTENT_01" },
 *   { dest: "RAW_PATH_02", content: "RAW_CONTENT_02" }
 * ]
 * ```
 *
 * @param {Function} callback  Callback function `(err, tmpls)`
 * @returns {void}
 */
Templates.prototype.load = function (callback) {
  var self = this;

  async.auto({
    // ------------------------------------------------------------------------
    // Validate and add in templates directory source.
    // ------------------------------------------------------------------------
    templatesDir: function (cb) {
      var templatesDir = self.data._templatesDir;
      var templatesPath = path.join(self.src, "extracted", templatesDir);

      fs.stat(templatesPath, function (err, stats) {
        if (err) {
          if (err.code === "ENOENT") {
            return void cb(
              new Error("Templates path '" + templatesPath + "' directory not found"));
          }

          return void cb(err);
        }

        if (!stats.isDirectory()) {
          return void cb(new Error(
            "Templates path '" + templatesPath + "' exists, but is not a directory"));
        }

        cb(null, templatesPath);
      });
    },

    // ------------------------------------------------------------------------
    // Require empty target destination.
    // ------------------------------------------------------------------------
    checkEmpty: function (cb) {
      fs.stat(self.dest, function (err) {
        if (err) {
          // Proxy all errors except not found.
          return void cb(err.code === "ENOENT" ? null : err);
        }

        // Otherwise exists.
        cb(new Error("Path: " + self.dest + " already exists"));
      });
    },

    // ------------------------------------------------------------------------
    // Walk the entire filesystem tree for the source templates.
    // ------------------------------------------------------------------------
    walkTemplates: ["templatesDir", "checkEmpty", function (results, cb) {
      cb = _.once(cb);
      var tmpls = [];

      fs.walk(results.templatesDir)
        .on("data", function (item) {
          if (item.stats.isFile()) {
            // Only track real files (we'll `mkdir -p` when creating).

            // Mutate item to add resolved _source_ filename.
            try {
              item.resolvedPath = path.resolve(self.resolveFilename(item.path));
            } catch (err) {
              return void cb(err);
            }

            // Add to internal list.
            tmpls.push(item);
          } else if (!item.stats.isDirectory()) {
            // Validation: We only handle real files / directories for now.
            return void cb(new Error("Source: " + item.path + " is not a file or directory"));
          }
        })
        .on("error", function (err) {
          // Proxy all errors except not found with an empty template array.
          cb(err.code === "ENOENT" ? null : err, []);
        })
        .on("end", function (err) {
          cb(err, tmpls);
        });
    }],

    // ------------------------------------------------------------------------
    // Ingest ignore file and filter.
    // ------------------------------------------------------------------------
    loadIgnore: ["templatesDir", "walkTemplates", function (results, cb) {
      // Find if there is a `.gitignore` in the source templates.
      var ignoreFile = _.find(results.walkTemplates, {
        resolvedPath: path.resolve(results.templatesDir, ".gitignore")
      });

      // Allow non-existent gitignore.
      if (!ignoreFile) { return void cb(); }

      // Read source gitignore from templated or real filename.
      fs.readFile(ignoreFile.path, cb);
    }],

    filterTemplates: ["templatesDir", "walkTemplates", "loadIgnore", function (results, cb) {
      // Get ignore filter (if any).
      var ignoreSrc = (results.loadIgnore || "").toString();
      if (!ignoreSrc) {
        return void cb(null, results.walkTemplates);
      }

      // Have ignores. Process and filter.
      var gitignore = ignoreParser.compile(ignoreSrc);
      var filtered = results.walkTemplates.filter(function (stat) {
        var relPath = path.relative(results.templatesDir, stat.path);
        return gitignore.accepts(relPath);
      });

      cb(null, filtered);
    }],

    // ------------------------------------------------------------------------
    // Read source templates and process in memory.
    // ------------------------------------------------------------------------
    readTemplates: ["templatesDir", "filterTemplates", function (results, cb) {
      async.map(results.filterTemplates, function (item, tmplCb) {
        var relPath = path.relative(results.templatesDir, item.path);
        var dest = path.resolve(self.dest, relPath);

        self.readTemplate({
          src: item.path,
          dest: dest
        }, tmplCb);
      }, cb);
    }]
  }, function (err, results) {
    callback(err, (results || {}).readTemplates);
  });
};

/**
 * Read, process, and write out templates.
 *
 * Array of processed template data objects is returned.
 *
 * @param {Function} callback  Callback function `(err, data)`
 * @returns {void}
 */
Templates.prototype.process = function (callback) {
  var self = this;

  async.auto({
    // ------------------------------------------------------------------------
    // Load all templates from disk.
    // ------------------------------------------------------------------------
    load: self.load.bind(self),

    // ------------------------------------------------------------------------
    // Process templates in memory.
    // ------------------------------------------------------------------------
    procTemplates: ["load", function (results, cb) {
      async.map(results.load, self.processTemplate.bind(self), cb);
    }],

    // ------------------------------------------------------------------------
    // Validate processed templates.
    // ------------------------------------------------------------------------
    validateTemplates: ["procTemplates", function (results, cb) {
      var tmpls = results.procTemplates;

      // Check that all paths are unique after template processing.
      // We're trying to avoid a perverse situation wherein an expanded template
      // name clashes with a static file path.
      var nameConflicts = _(tmpls)
        // Convert to groups of `NAME: COUNT`
        .groupBy("dest")
        .mapValues(function (items) { return items.length; })
        // Switch to `[NAME, COUNT]`
        .toPairs()
        // Keep only COUNT > 1 (aka "not unique")
        .filter(function (pair) { return pair[1] > 1; })
        // Return our offending keys.
        .map(function (pair) { return pair[0]; })
        .value();

      var numConflicts = nameConflicts.length;
      if (numConflicts > 0) {
        return void cb(new Error("Encountered " + numConflicts +
          " file path conflict" + (numConflicts > 1 ? "s" : "") +
          " when resolving: " + nameConflicts.join(", ")));
      }

      // Valid: Just proxy on original templates.
      cb(null, tmpls);
    }],

    // ------------------------------------------------------------------------
    // Write processed templates to disk.
    // ------------------------------------------------------------------------
    writeTemplates: ["validateTemplates", function (results, cb) {
      async.map(results.procTemplates, self.writeTemplate.bind(self), cb);
    }]
  }, function (err, results) {
    // Callback with full processed templates.
    callback(err, (results || {}).procTemplates);
  });
};
