"use strict";

/**
 * These are _almost_ functional tests as we're basically invoking the entire
 * application, just:
 *
 * - Mocking filesystem
 * - Stubbing stdin to return canned responses to prompts
 */
var _ = require("lodash");
var _init = require("../../../../lib/init");
var init = function (opts, callback) {
  return _init(_.merge({
    initFile: "my-prompts.js",
    prompts: {
      derived: {
        _templatesDir: function (data, cb) { cb(null, "my-dir"); }
      }
    }
  }, opts), callback);
};

var Task = require("../../../../lib/task");

var base = require("../base.spec");

var util = require("../../util")(base);
var stdioWrap = util.stdioWrap;
var mockFlow = util.mockFlow;

var SCRIPT = "my-template-engine";

describe("lib/init", function () {

  describe("non-init", function () {

    it("displays help on no args", stdioWrap(function (done) {
      init({ argv: ["node", SCRIPT] }, function (err) {
        if (err) { return void done(err); }

        expect(process.stdout.write).to.be.calledWithMatch(SCRIPT + " [flags] <module>");

        done();
      });
    }));

    it("displays help on -h", stdioWrap(function (done) {
      init({ argv: ["node", SCRIPT, "-h"] }, function (err) {
        if (err) { return void done(err); }

        expect(process.stdout.write).to.be.calledWithMatch(SCRIPT + " [flags] <module>");

        done();
      });
    }));

    it("displays version on -v", stdioWrap(function (done) {
      init({ argv: ["node", SCRIPT, "-v"], version: "1.2.3" }, function (err) {
        if (err) { return void done(err); }

        expect(process.stdout.write).to.be.calledWithMatch("1.2.3");

        done();
      });
    }));

  });

  describe("errors", function () {

    it("errors on missing <_templatesDir> and no <initFile>", stdioWrap(function (done) {
      mockFlow({});
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("my-dir' directory not found");
        done();
      });
    }));

    it("errors on missing <_templatesDir> with <initFile>", stdioWrap(function (done) {
      mockFlow({
        "my-prompts.js": "module.exports = {};"
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("my-dir' directory not found");
        done();
      });
    }));

    it("errors on underscored prompts in <initFile>", stdioWrap(function (done) {
      mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            _fileName: { message: "a file name" }
          }
        }) + ";",
        "my-dir": {}
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("User prompts cannot start with");
        done();
      });
    }));

    it("errors on <_templatesDir> not a directory", stdioWrap(function (done) {
      mockFlow({
        "my-dir": "file, not a directory"
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("exists, but is not a directory");
        done();
      });
    }));

    it("errors when destination already exists", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {}
      }, {
        "dest": {} // Will collide with default destination.
      });

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("dest already exists");
        done();
      });
    }));

    it("errors on failed npm pack download", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-dir": {}
      });

      // Fake npm pack download error.
      stubs.spawnOn.reset();
      stubs.spawnOn.withArgs("error").returns();
      stubs.spawnOn.withArgs("close").yields(1);

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("exited with error code: 1");
        done();
      });
    }));

    it("errors on invalid --prompts data", stdioWrap(function (done) {
      mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            name: { message: "a name" }
          }
        }) + ";",
        "my-dir": {
          "{{name}}.txt": "A <%= name %>."
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module", "--prompts=INVALID"] }, function (err) {
        expect(err).to.have.property("message").that.contains("Prompt overrides loading failed");
        done();
      });
    }));

    it("errors on invalid <initFile>", stdioWrap(function (done) {
      mockFlow({
        "my-prompts.js": "BAD_CODE {",
        "my-dir": {
          "{{name}}.txt": "A <%= name %>."
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message")
          .that.contains("[" + SCRIPT + "] Error while importing 'mock-module/my-prompts.js'").and
          .that.contains("Unexpected token {");

        done();
      });
    }));
  });

  describe(".npmignore and .gitignore complexities", function () {

    it("errors on .npmignore collision", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {
          ".npmignore": "",
          "{{_npmignore}}": ""
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message")
          .that.contains("Encountered 1 file path conflict").and
          .that.contains("npmignore");

        done();
      });
    }));

    it("errors on .gitignore collision", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {
          ".gitignore": "",
          "{{_gitignore}}": ""
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message")
          .that.contains("Encountered 1 file path conflict").and
          .that.contains("gitignore");

        done();
      });
    }));

    it("errors on .gitignore and .npmignore collisions", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {
          ".gitignore": "",
          "{{_gitignore}}": "",
          ".npmignore": "",
          "{{_npmignore}}": ""
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message")
          .that.contains("Encountered 2 file path conflicts").and
          .that.contains("gitignore").and
          .that.contains("npmignore");

        done();
      });
    }));

    it("expands .gitignore and excludes ignored files", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            fileName: { message: "a file name" },
            varName: { message: "a variable name" }
          }
        }) + ";",
        "my-dir": {
          "{{_gitignore}}": "coverage",
          "coverage": {
            "a-file": "shouldn't be copied"
          },
          "{{fileName}}.js": "module.exports = { <%= varName %>: 'foo' };"
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("file-name")
        .onCall(1).yields("myCoolVar")
        .onCall(2).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/.gitignore")).to.contain("coverage");
        expect(base.fileRead("dest/file-name.js")).to.contain("myCoolVar: 'foo'");
        expect(base.fileExists("dest/coverage/a-file")).to.be.false;

        done();
      });
    }));

  });

  describe("basic", function () {

    it("allows no <initFile> and empty <_templatesDir>", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {}
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, done);
    }));

    it("allows no <initFile> with <_templatesDir>", stdioWrap(function (done) {
      mockFlow({
        "my-dir": {
          "foo.js": "module.exports = { foo: 42 };"
        }
      });

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/foo.js")).to.contain("foo: 42");

        done();
      });
    }));

    it("allows overriding <_templatesDir> via prompts", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            _templatesDir: { message: "new templates dir" }
          }
        }) + ";",
        "different-tmpl": {
          "README.md": "My readme"
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("different-tmpl")
        .onCall(1).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/README.md")).to.contain("My readme");

        done();
      });
    }));

    it("allows overriding <_templatesDir> via derived", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          derived: {
            _templatesDir: "REPLACE_WITH_FN_TOKEN"
          }
        // Hack in a real function (while otherwise still using json stringification).
        }).replace("\"REPLACE_WITH_FN_TOKEN\"",
        /*eslint-disable no-extra-parens*/(function (data, cb) {
          cb(null, "different-tmpl");
        }).toString())/* eslint-enable no-extra-parens */ + ";",
        "different-tmpl": {
          "README.md": "My readme"
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(1).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/README.md")).to.contain("My readme");

        done();
      });
    }));

    it("doesn't mutate binary data (png), but will parse SVGs", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            fileName: { message: "a file name" },
            fillColor: { message: "a SVG fill color" },
            message: { message: "a SVG fill message" }
          }
        }) + ";",
        "my-dir": {
          "foo.js": "module.exports = { foo: 42 };",
          "{{fileName}}.svg": base.fixtures["formidagon.svg"],
          "from-template.svg": base.fixtures["formidagon.tmpl.svg"],
          "image.png": base.fixtures["formidagon.png"]
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("svg-file")
        .onCall(1).yields("#993300")
        .onCall(2).yields("moar messages");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/foo.js")).to.contain("foo: 42");

        expect(base.fileRead("dest/svg-file.svg"))
          .to.equal(base.fixtures["formidagon.svg"].toString());
        expect(base.fileRead("dest/from-template.svg"))
          .to.contain("fill:#993300;").and
          .to.contain("class=\"text0 text1\">moar messages</text>");

        expect(base.fileRead("dest/image.png", "base64"))
          .to.equal(base.fixtures["formidagon.png"].toString("base64"));

        done();
      });
    }));

    it("allows derived data for template file names", stdioWrap(function (done) {
      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            fileName: { message: "a file name" },
            varName: { message: "a variable name" }
          },
          derived: {
            upperFileName: "REPLACE_WITH_FN_TOKEN"
          }

        // Hack in a real function (while otherwise still using json stringification).
        }).replace("\"REPLACE_WITH_FN_TOKEN\"",
        /*eslint-disable no-extra-parens*/(function (data, cb) {
          cb(null, data.fileName.toUpperCase());
        }).toString())/* eslint-enable no-extra-parens */ + ";",
        "my-dir": {
          "{{upperFileName}}.js": "module.exports = { <%= varName %>: 'foo' };"
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("file_name")
        .onCall(1).yields("myCoolVar")
        .onCall(2).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/FILE_NAME.js")).to.contain("myCoolVar: 'foo'");

        done();
      });
    }));

    // Verifies that `<initFile>`-based `require`'s are not supported and properly
    // error-ed out with a good message.
    //
    // https://github.com/FormidableLabs/builder-init/issues/32
    it("fails on missing requires in <initFile>", stdioWrap(function (done) {
      // Update stub to just throw a `MODULE_NOT_FOUND` so that we can simulate
      // a missing `require`.
      //
      // Note that while `eval` _does_ correctly error on bad require, the
      // errors are uncatchable in our test execution context here. :(
      Task.prototype._lazyRequire.restore();
      base.sandbox.stub(Task.prototype, "_lazyRequire", function () {
        // Hack a _real_ module not found error.
        require("this-totally-doesnt-exist"); // eslint-disable-line global-require
      });

      var stubs = mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            fileName: { message: "a file name" },
            varName: { message: "a variable name" }
          }
        }) + ";",
        "my-dir": {
          "{{fileName}}.js": "module.exports = { <%= varName %>: 'foo' };"
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("file_name")
        .onCall(1).yields("myCoolVar")
        .onCall(2).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err)
          .to.be.ok.and
          .to.have.property("message").and
            .to.contain("Cannot find module").and
            .to.contain("this-totally-doesnt-exist").and
            .to.contain("[" + SCRIPT + "] Error while importing");

        done();
      });
    }));

    it("handles --prompts data", stdioWrap(function (done) {
      mockFlow({
        "my-prompts.js": "module.exports = " + JSON.stringify({
          prompts: {
            name: { message: "a name" }
          }
        }) + ";",
        "my-dir": {
          "{{name}}.txt": "A <%= _.capitalize(name) %>."
        }
      });

      var prompts = "--prompts='" + JSON.stringify({
        name: "chester",
        destination: "dest"
      }) + "'";

      init({ argv: ["node", SCRIPT, "module", prompts] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/chester.txt")).to.contain("A Chester.");

        done();
      });
    }));

  });

});
