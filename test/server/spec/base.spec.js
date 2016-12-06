"use strict";

/**
 * Base server unit test initialization / global before/after's.
 *
 * This file should be `require`'ed by all other test files.
 *
 * **Note**: Because there is a global sandbox server unit tests should always
 * be run in a separate process from other types of tests.
 */
var path = require("path");
var stream = require("stream");

var _ = require("lodash");
var mockFs = require("mock-fs");
var fs = require("fs-extra");
var async = require("async");
var sinon = require("sinon");
var zlib = require("zlib");
var _eval = require("eval");

var Task = require("../../../lib/task");
var prompts = require("../../../lib/prompts");


// ----------------------------------------------------------------------------
// Base helpers.
// ----------------------------------------------------------------------------
var base = module.exports = {
  // Generic test helpers.
  sandbox: null,
  mockFs: null,
  fixtures: {},

  // File stuff
  // NOTE: Sync methods are OK here because mocked and in-memory.
  fileRead: function (filePath, encoding) {
    return fs.readFileSync(filePath).toString(encoding);
  },
  fileExists: function (filePath) {
    return fs.existsSync(filePath);
  },

  // Prompts helpers.
  PROMPT_DEFAULTS: null,
  addPromptDefaults: function (data) {
    return _.extend({}, base.PROMPT_DEFAULTS, data);
  }
};

// ----------------------------------------------------------------------------
// Global Setup / Teardown
// ----------------------------------------------------------------------------
before(function (done) {
  // Set test environment
  process.env.NODE_ENV = process.env.NODE_ENV || "test";

  // Create mock data object.
  var data = { destination: "destination" };
  _.merge(data, _.mapValues(prompts._EXTRA_DATA_FIELDS, function (fn) {
    return fn({});
  }));

  var derived = _.mapValues(prompts._DEFAULTS.derived, function (fn) {
    return fn.bind(null, {});
  });

  // Async resolve defaults for all tests here.
  async.auto(derived, function (err, results) {
    // Hard-code in "destination" for test-sensible-default.
    base.PROMPT_DEFAULTS = _.extend(data, results);
    done(err);
  });
});

before(function (done) {
  // Before we mock out the filesystem, let's load some buffers!
  async.map([
    "formidagon.png",
    "formidagon.svg",
    "formidagon.tmpl.svg"
  ], function (fixtureName, cb) {
    fs.readFile(path.join(__dirname, "../fixtures", fixtureName), function (err, buffer) {
      if (err) { return void cb(err); }
      base.fixtures[fixtureName] = buffer;
      cb();
    });
  }, done);
});

beforeEach(function () {
  // From this point forward, all `fs` is **mocked**. This means that:
  // - File access through `fs` is mocked.
  // - Lazy `require()`'s may not work (depending on node version).
  base.mockFs = mockFs;
  base.mockFs();

  // Set up sandbox.
  base.sandbox = sinon.sandbox.create({
    useFakeTimers: true
  });

  // Mock out unzipping.
  base.sandbox.stub(zlib, "createUnzip").returns(new stream.PassThrough());

  // Node `4`+ can't `require` from the mocked filesystem, so hackily
  // approximate here.
  base.sandbox.stub(Task.prototype, "_lazyRequire", function (mod) {
    try {
      return require(mod); // eslint-disable-line global-require
    } catch (err) {
      if (err.code === "MODULE_NOT_FOUND" && base.fileExists(mod)) {
        return _eval(base.fileRead(mod), true);
      }

      throw err;
    }
  });
});

afterEach(function () {
  base.mockFs.restore();
  base.sandbox.restore();
});
