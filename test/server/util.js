"use strict";
/*eslint-disable max-statements*/

var childProc = require("child_process");
var crypto = require("crypto");
var temp = require("temp").track();
var _ = require("lodash");
var Prompt = require("inquirer/lib/prompts/base");

var Task = require("../../lib/task");

module.exports = function (base) {
  return {
    // It would be great to just stub stderr, stdout in beforeEach,
    // but then we don't get test output. So, we manually stub with this wrapper.
    stdioWrap: function (fn) {
      return function (done) {
        base.sandbox.stub(process.stdout, "write");

        var _done = function (err) {
          process.stdout.write.restore();
          done(err);
        };

        try {
          return void fn(_done);
        } catch (err) {
          return void _done(err);
        }
      };
    },

    // Mock key I/O parts of the flow.
    mockFlow: function (extracted, root) {
      // Returned object.
      var stubs = {};

      // Fake filesystem for before and after (stubbed) extraction.
      //
      // **Note**: Don't use `_.merge()` with `Buffer` objects in the mock fs.
      var hash = crypto.randomBytes(10).toString("hex");
      var tmpDir = "tmp-dir-" + hash;
      var fsObj = _.extend({}, root);
      fsObj[tmpDir] = {
        "mock-archetype-0.0.1.tgz": ""
      };

      var extractedObj = _.extend({}, root);
      extractedObj[tmpDir] = {
        "mock-archetype-0.0.1.tgz": ""
      };
      if (extracted) {
        extractedObj[tmpDir].extracted = extracted;
      }

      base.mockFs(fsObj);

      // Stub out creating a temp directory with a _known_ name.
      base.sandbox.stub(temp, "mkdir").yields(null, tmpDir);

      // Immediately call `close` with success exit.
      stubs.spawnOn = base.sandbox.stub();
      stubs.spawnOn.withArgs("error").returns();
      stubs.spawnOn.withArgs("close").yields(0);

      // Override the `npm pack` process to just fail / succeed.
      stubs.spawn = base.sandbox.stub(childProc, "spawn").returns({
        on: stubs.spawnOn
      });

      // Use our special hook to change the filesystem as if we expanded a
      // real download.
      base.sandbox.stub(Task.prototype, "_onExtracted", function (callback) {
        base.mockFs(extractedObj);

        return callback;
      });

      stubs.prompt = base.sandbox.stub(Prompt.prototype, "run").yields("dest");

      return stubs;
    }
  };
};
