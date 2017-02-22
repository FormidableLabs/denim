"use strict";

/**
 * These are _almost_ functional tests as we're basically invoking the entire
 * application, just:
 *
 * - Mocking filesystem
 * - Stubbing stdin to return canned responses to prompts
 */
var init = require("../../../../bin/denim");

var base = require("../base.spec");

var util = require("../../util")(base);
var stdioWrap = util.stdioWrap;
var mockFlow = util.mockFlow;

var SCRIPT = "denim";

describe("bin/" + SCRIPT, function () {

  describe("errors", function () {

    it("errors on missing templates/ and no denim.js", stdioWrap(function (done) {
      mockFlow({});
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("templates' directory not found");
        done();
      });
    }));

    it("errors on missing templates/ with denim.js", stdioWrap(function (done) {
      mockFlow({
        "denim.js": "module.exports = {};"
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("templates' directory not found");
        done();
      });
    }));

    it("errors on templates/ not a directory", stdioWrap(function (done) {
      mockFlow({
        "templates": "file, not a directory"
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message").that.contains("exists, but is not a directory");
        done();
      });
    }));

    it("errors on invalid denim.js", stdioWrap(function (done) {
      mockFlow({
        "denim.js": "BAD_CODE {",
        "templates": {
          "{{name}}.txt": "A <%= name %>."
        }
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        expect(err).to.have.property("message")
          .that.contains("[" + SCRIPT + "] Error while importing 'mock-module/denim.js'").and
          .that.contains("Unexpected token {");

        done();
      });
    }));

  });

  describe("basic", function () {

    it("allows no denim.js and empty templates/", stdioWrap(function (done) {
      mockFlow({
        "templates": {}
      });
      init({ argv: ["node", SCRIPT, "mock-module"] }, done);
    }));

    it("allows no denim.js with templates/", stdioWrap(function (done) {
      mockFlow({
        "templates": {
          "foo.js": "module.exports = { foo: 42 };"
        }
      });

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/foo.js")).to.contain("foo: 42");

        done();
      });
    }));

    it("allows overriding templates dir", stdioWrap(function (done) {
      var stubs = mockFlow({
        "denim.js": "module.exports = " + JSON.stringify({
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

    it("allows overriding templates filter", stdioWrap(function (done) {
      // Manually hack together a denim.js with functions.
      var denimJs = "module.exports = " + JSON.stringify({
        prompts: {
          textVar: { message: "a text template path variable" }
        },
        derived: {
          _templatesFilter: "TOKEN_TEMPLATES_FILTER",
          oneVar: "TOKEN_ONE_VAR"
        }
      })
        .replace("\"TOKEN_TEMPLATES_FILTER\"", function (data, cb) {
          cb(null, function (filePath, isIncluded) {
              // Start with excludes...
            return filePath.indexOf("one/") !== 0 &&  // Remove anything starting with "one/"
              filePath !== "two/nuke.txt" &&          // Exact file path exclusion
              isIncluded                              // Default
              ||
              // Then, unconditional includes that override...
              filePath === "two/alsoignored.txt";     // Override gitignore to include
          });
        }.toString())
        .replace("\"TOKEN_ONE_VAR\"", function (data, cb) {
          cb(null, "one");
        }.toString());

      var stubs = mockFlow({
        "denim.js": denimJs,
        "templates": {
          ".gitignore": "*/gitignored.txt\n*/alsoignored.txt",
          "one": {
            // Normal path. Excluded because of "one".
            "foo.js": "module.exports = { foo: 42 };"
          },
          "{{oneVar}}": {
            // Path that is resolved through template variable. Excluded because of "one".
            "bar.js": "module.exports = { bar: 'bar' };"
          },
          "two": {
            // Should be kept.
            "baz.js": "module.exports = { baz: 'baz' };",
            "{{textVar}}.txt": "texty mctextface",
            // Git ignored, but custom filter overrides with include.
            "alsoignored.txt": "kept with custom fn",
            // Should be excluded by "two/nuke.txt" match.
            "nuke.txt": "nuke me",
            // Should be excluded by .gitignore.
            "gitignored.txt": "git hates me"
          }
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("text")
        .onCall(1).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/.gitignore")).to.contain("gitignored.txt");
        expect(base.fileRead("dest/two/baz.js")).to.contain("module.exports = { baz: 'baz' };");
        expect(base.fileRead("dest/two/text.txt")).to.contain("texty mctextface");
        expect(base.fileRead("dest/two/alsoignored.txt")).to.contain("kept with custom fn");

        expect(base.fileExists("dest/one/foo.js")).to.be.false;
        expect(base.fileExists("dest/one/bar.js")).to.be.false;
        expect(base.fileExists("dest/two/nuke.txt")).to.be.false;
        expect(base.fileExists("dest/two/gitignored.txt")).to.be.false;

        done();
      });
    }));

    // Correctly applies git ignore rules, even with negated expressions
    // Bug: https://github.com/FormidableLabs/denim/issues/9
    // Bug: https://github.com/FormidableLabs/denim/issues/11
    it("allows npmignore, npmrc when npm is in gitignore", stdioWrap(function (done) {
      var stubs = mockFlow({
        "templates": {
          ".gitignore": "!nomatch\n.npm\n",
          ".npmignore": "holla",
          ".npmrc": "// holla too",
          ".npm": {
            "test.txt": "should be ignored"
          }
        }
      });

      // Note: These have to match prompt fields + `destination` in order.
      stubs.prompt
        .reset()
        .onCall(0).yields("dest");

      init({ argv: ["node", SCRIPT, "mock-module"] }, function (err) {
        if (err) { return void done(err); }

        expect(base.fileRead("dest/.gitignore")).to.contain(".npm");
        expect(base.fileRead("dest/.npmignore")).to.contain("holla");
        expect(base.fileRead("dest/.npmrc")).to.contain("holla");

        expect(base.fileExists(".npm/test.txt")).to.be.false;

        done();
      });
    }));

    it("initializes a basic project", stdioWrap(function (done) {
      var stubs = mockFlow({
        "denim.js": "module.exports = " + JSON.stringify({
          prompts: {
            fileName: { message: "a file name" },
            varName: { message: "a variable name" }
          }
        }) + ";",
        "templates": {
          "{{_npmignore}}": "coverage",
          "{{_gitignore}}": "coverage",
          "README.md": "My readme",
          "{{fileName}}.js": "module.exports = { <%= varName %>: 'foo' };",
          "test": {
            "client": {
              "spec": {
                "{{fileName}}.spec.js": "describe('<%= fileName %>');"
              }
            }
          }
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

        expect(base.fileRead("dest/.npmignore")).to.contain("coverage");
        expect(base.fileRead("dest/.gitignore")).to.contain("coverage");
        expect(base.fileRead("dest/README.md")).to.contain("My readme");
        expect(base.fileRead("dest/file-name.js")).to.contain("myCoolVar: 'foo'");
        expect(base.fileRead("dest/test/client/spec/file-name.spec.js"))
          .to.contain("describe('file-name');");

        done();
      });
    }));

  });
});
