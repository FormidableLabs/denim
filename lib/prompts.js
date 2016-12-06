"use strict";

var fs = require("fs");
var path = require("path");
var _ = require("lodash");
var async = require("async");
var inquirer = require("inquirer");

/**
 * Default prompts values added to all prompt calls.
 */
var DEFAULTS = {
  destination: {
    message: "Destination directory to write",
    validate: function (val) {
      var done = this.async();

      if (!val) {
        return void done("Must specify a destination directory");
      }

      fs.stat(val, function (err) {
        if (err && err.code === "ENOENT") { return void done(true); }

        return void done("Destination directory must not already exist");
      });
    }
  },
  derived: {
    // Directory containing templates
    _templatesDir: function (data, cb) { cb(null, "templates"); },

    // `.npmignore` and `.gitignore` need to be proxied as a template to avoid
    //  NPM losing dev files in `init/` when uploading and executing `npm pack`
    // so we provide them by default here.
    _npmignore: function (data, cb) { cb(null, ".npmignore"); },
    _gitignore: function (data, cb) { cb(null, ".gitignore"); },
    _eslintrc: function (data, cb) { cb(null, ".eslintrc"); },
    _npmrc: function (data, cb) { cb(null, ".npmrc"); }
  }
};

/**
 * Special extra data fields to add after prompts are proceed.
 */
var EXTRA_DATA_FIELDS = {
  _extractedModulePath: function (opts) {
    return opts.src ? path.join(opts.src, "extracted") : null;
  }
};

/**
 * Prompt user for input, validate, and add derived fields to final data object.
 *
 * @param {Object}    opts            Options object
 * @param {Object}    opts.init       Initialization configuration (`prompts`, `derived`)
 * @param {Object}    opts.defaults   Defaults merged in with lib defaults (`prompts`, `derived`)
 * @param {Object}    opts.src        Extracted module path.
 * @param {Function}  callback        Calls back with `(err, data)`
 * @returns {void}
 */
// eslint-disable-next-line max-statements, complexity
module.exports = function (opts, callback) {
  // Params
  opts = _.clone(opts || {});
  var defaults = opts.defaults || {};
  var derivedBase = _.extend({}, DEFAULTS.derived, defaults.derived);

  // Validate.
  var init = opts.init || null;
  if (!init) { return void callback(new Error("Invalid init object")); }
  if (init.prompts) {
    if (!(_.isArray(init.prompts) || _.isObject(init.prompts))) {
      return void callback(new Error("Invalid prompts type: " + typeof init.prompts));
    } else if (_.some(init.prompts, function (v, k) {
      // Disallow `_` prompts that **aren't** special variables
      return k.indexOf("_") === 0 && !derivedBase[k];
    })) {
      return void callback(new Error(
        "User prompts cannot start with '_' unless overriding special variables: " +
        JSON.stringify(init.prompts)));
    }
  }

  var promptsBase = init.prompts && !_.isArray(init.prompts) ? {} : [];
  var prompts = _.extend(promptsBase, DEFAULTS.prompts, defaults.prompts, init.prompts);
  var dest = _.extend({}, DEFAULTS.destination, defaults.destination, init.destination);

  // Mutate objects to arrays if needed.
  prompts = _.isArray(prompts) ? prompts : _.map(prompts, function (val, key) {
    return _.extend({ name: key }, val);
  });

  // Add in special `destination` prompt field if not provided by `init.js`
  if (!_.includes(prompts, { name: "destination" })) {
    prompts.push(_.merge({ name: "destination" }, dest));
  }

  // Prompt overrides to skip actual user input.
  var overrides;
  if (init.overrides) {
    try {
      overrides = module.exports._parseOverrides(init.overrides);
    } catch (err) {
      return void callback(new Error("Prompt overrides loading failed with: " + err.message));
    }
  }

  // Execute prompts, then derive final data.
  async.auto({
    extra: function (cb) {
      var data = _.reduce(EXTRA_DATA_FIELDS, function (memo, fn, field) {
        memo[field] = fn(opts);
        return memo;
      }, {});

      cb(null, data);
    },

    prompts: function (cb) {
      // Allow `--prompts=JSON_STRING` overrides.
      if (overrides) { return void cb(null, overrides); }

      // Get user prompts. No error, because will prompt user for new input.
      inquirer.prompt(prompts, function (data) { cb(null, data); });
    },

    derived: ["extra", "prompts", function (results, cb) {
      // Create object of functions bound to user input data and invoke.
      var data = _.merge({}, results.extra, results.prompts);

      // Add deriveds in order of built-in defaults, program, then init.
      //
      // **Note**: This _does_ mean that simply overriding a default will not
      // prevent it's execution. But it also allows us to chain together groups
      // of defaults. We _may_ revisit this logic in the future.
      //
      // Takeaway: Ensure it's OK that any defaults run.
      async.eachSeries([
        DEFAULTS.derived,
        defaults.derived,
        init.derived
      ], function (derivedObj, eachCb) {

        var fns = _(derivedObj)
          // Remove keys that are set from prompts.
          .pickBy(function (fn, key) {
            return !_.has(results.prompts, key);
          })
          // Add in our mutating data object.
          .mapValues(function (fn) {
            return fn.bind(null, data);
          })
          .value();

        async.auto(fns, function (err, eachResults) {
          // Mutate data.
          data = _.merge(data, eachResults);

          eachCb(err);
        });
      }, function (err) {
        cb(err, data);
      });
    }]
  }, function (err, results) {
    var data = results ? _.extend({}, results.prompts, results.derived) : null;
    callback(err, data);
  });
};

/**
 * Parse overrides string into object.
 *
 * Also handles a few scenarios like surrounding single / double quotes.
 *
 * @param   {String} str  JSON string
 * @returns {Object}      JS object
 */
module.exports._parseOverrides = function (str) {
  // Remove quotes.
  str = str
    .trim()
    .replace(/^"{(.*)}"$/, "{$1}")
    .replace(/^'{(.*)}'$/, "{$1}");

  return JSON.parse(str);
};

// Expose helpers for testing.
module.exports._DEFAULTS = DEFAULTS;
module.exports._EXTRA_DATA_FIELDS = EXTRA_DATA_FIELDS;

