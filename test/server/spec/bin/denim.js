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
