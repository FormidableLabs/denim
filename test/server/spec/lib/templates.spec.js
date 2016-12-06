"use strict";

var _ = require("lodash");
var async = require("async");
var Templates = require("../../../../lib/templates");
var base = require("../base.spec");

describe("lib/templates", function () {

  describe("#resolveFilename", function () {
    var resolveFilename;

    before(function () {
      // Reuse object
      var instance = new Templates({
        data: {
          fruit: "apple",
          vegetable: "tomato"
        }
      });
      resolveFilename = instance.resolveFilename.bind(instance);
    });

    it("handles base cases", function () {
      expect(resolveFilename()).to.equal("");
      expect(resolveFilename(null)).to.equal("");
      expect(resolveFilename(undefined)).to.equal("");
    });

    it("passes through non-template strings", function () {
      expect(resolveFilename("a")).to.equal("a");
      expect(resolveFilename("{{}}")).to.equal("{{}}");
      expect(resolveFilename("{singlecurly}.js")).to.equal("{singlecurly}.js");
      expect(resolveFilename("foo/bar.txt")).to.equal("foo/bar.txt");
    });

    it("resolves single tokens", function () {
      expect(resolveFilename("{{fruit}}.js")).to.equal("apple.js");
      expect(resolveFilename("foo/{{vegetable}}/bar.txt")).to.equal("foo/tomato/bar.txt");
    });

    it("resolves multiple tokens", function () {
      expect(resolveFilename("foo/{{vegetable}}/{{fruit}}.txt")).to.equal("foo/tomato/apple.txt");
    });

    it("throws error on unmatched tokens", function () {
      expect(function () {
        resolveFilename("{{tree}}.js");
      }).to.throw(/Unknown/);
      expect(function () {
        resolveFilename("foo/{{vegetable}}/{{extra}}/{{fruit}}.txt");
      }).to.throw(/Unknown/);
    });

    it("throws errors on tokens in tokens", function () {
      expect(function () {
        resolveFilename("{{ihaz{{fruit}}}}.js");
      }).to.throw(/Forbidden/);
      expect(function () {
        resolveFilename("{{{{fruit}}}}.js");
      }).to.throw(/Forbidden/);
    });
  });


  describe("#processTemplate", function () {
    var instance;
    var _processTemplate;
    var expectFn = function (input, expected) {
      return function (cb) {
        _processTemplate(input, function (err, actual) {
          if (err) { return void cb(err); }

          expect(actual).to.deep.equal(_.extend({}, actual, expected));

          cb();
        });
      };
    };

    beforeEach(function () {
      instance = new Templates();
      _processTemplate = instance.processTemplate.bind(instance);
    });

    it("handles non-parsed content", function (done) {
      async.series([
        expectFn({ dest: "foo", buffer: new Buffer([]) }, { content: null }),
        expectFn({ dest: "bar/bar", buffer: new Buffer("Hi") }, { content: null }),
        expectFn({ dest: "foo", buffer: base.fixtures["formidagon.svg"] }, { content: null })
      ], done);
    });

    it("ignores non-text files", function (done) {
      async.series([
        expectFn({ dest: "foo", buffer: new Buffer([0x00]) }, { content: null }),
        expectFn({ dest: "foo", buffer: new Buffer([0xFF]) }, { content: null }),
        expectFn({ dest: "foo", buffer: base.fixtures["formidagon.png"] }, { content: null })
      ], done);
    });

    it("parses SVGs", function (done) {
      instance.data = { fillColor: "#003399", message: "I'm a logo" };

      _processTemplate({
        dest: "foo",
        buffer: base.fixtures["formidagon.tmpl.svg"]
      }, function (err, data) {
        if (err) { return void done(err); }

        expect(data).to.have.property("content")
          .that.contains("fill:#003399;").and
          .that.contains("class=\"text0 text1\">I'm a logo</text>");

        done();
      });
    });

    it("leaves ES template strings untouched", function (done) {
      async.series([
        expectFn({ dest: "foo", buffer: new Buffer("var foo = `${bar} yo`;") }, { content: null }),
        expectFn({ dest: "foo", buffer: new Buffer("var foo = { bar: `${bar} yo` };") },
          { content: null })
      ], done);
    });

    it("parses file content", function (done) {
      instance.data = { bar: "42" };

      async.series([
        expectFn({ dest: "foo", buffer: new Buffer("var foo = <%=bar%>;") },
          { content: "var foo = 42;" }),
        expectFn({ dest: "foo", buffer: new Buffer("var foo = {bar: <%= bar %>};") },
          { content: "var foo = {bar: 42};" })
      ], done);
    });

    it("handles bad template strings", function (done) {
      instance.data = { bar: "42" };

      async.series([
        expectFn({ dest: "foo", buffer: new Buffer("var foo = <%=bar;") }, { content: null }),
        expectFn({ dest: "foo", buffer: new Buffer("var foo = {bar: bar %>};") }, { content: null })
      ], done);
    });

    it("parses file names", function (done) {
      instance.data = { file: "the-stuffz", bar: "23" };

      async.series([
        expectFn({ dest: "{{file}}.js", buffer: new Buffer("var foo = <%=bar%>;") },
          { dest: "the-stuffz.js", content: "var foo = 23;" }),
        expectFn({ dest: "{{file}}/bar/{{bar}}.js", buffer: new Buffer("HI") },
          { dest: "the-stuffz/bar/23.js", content: null })
      ], done);
    });
  });

  describe("#process", function () {
    var _process;

    describe("nonexistent templates directory", function () {
      var instance;

      beforeEach(function () {
        instance = new Templates({
          src: "",
          dest: "nonexistent-dir-dest",
          data: {
            _templatesDir: "nonexistent-dir"
          }
        });
        _process = instance.process.bind(instance);
      });

      it("forbids nonexistent templates directory", function (done) {
        _process(function (err) {
          expect(err).to.have.property("message")
            .that.contains("nonexistent-dir' directory not found");
          done();
        });
      });
    });

    describe("empty templates directory", function () {
      var instance;

      beforeEach(function () {
        base.mockFs({
          "extracted/empty-dir": {
            "another-empty-dir": {}
          }
        });

        instance = new Templates({
          src: "",
          dest: "empty-dir-dest",
          data: {
            _templatesDir: "empty-dir"
          }
        });
        _process = instance.process.bind(instance);
      });

      it("allows empty directory", function (done) {
        _process(function (err) {
          expect(err).to.not.be.ok;
          done();
        });
      });
    });

    describe("gitignore file", function () {
      var instance;

      beforeEach(function () {
        base.mockFs({
          "extracted/templates": {
            ".gitignore": "coverage",
            "COPY.txt": "Should be copied",
            coverage: {
              "NO_COPY.txt": "Should not be copied"
            }
          }
        });

        instance = new Templates({
          src: "",
          dest: "dest",
          data: base.addPromptDefaults() // Always get these from prompts
        });
        _process = instance.process.bind(instance);
      });

      it("ignores .gitignore'd files", function (done) {
        _process(function (err) {
          if (err) { return void done(err); }

          expect(base.fileRead("dest/.gitignore")).to.equal("coverage");
          expect(base.fileRead("dest/COPY.txt")).to.equal("Should be copied");
          expect(base.fileExists("dest/coverage")).to.be.false;
          expect(base.fileExists("dest/coverage/NO_COPY.txt")).to.be.false;

          done();
        });
      });
    });

    describe("gitignore template", function () {
      var instance;

      beforeEach(function () {
        base.mockFs({
          "extracted/templates": {
            "{{_gitignore}}": "coverage", // Use token name per our guidelines
            "COPY.txt": "Should be copied",
            coverage: {
              "NO_COPY.txt": "Should not be copied"
            }
          }
        });

        instance = new Templates({
          src: "",
          dest: "dest",
          data: base.addPromptDefaults() // Always get these from prompts
        });
        _process = instance.process.bind(instance);
      });

      it("ignores .gitignore'd files", function (done) {
        _process(function (err) {
          if (err) { return void done(err); }

          expect(base.fileRead("dest/.gitignore")).to.equal("coverage");
          expect(base.fileRead("dest/COPY.txt")).to.equal("Should be copied");
          expect(base.fileExists("dest/coverage")).to.be.false;
          expect(base.fileExists("dest/coverage/NO_COPY.txt")).to.be.false;

          done();
        });
      });
    });

    describe("eslintrc file", function () {
      var instance;

      beforeEach(function () {
        base.mockFs({
          "extracted/templates": {
            "{{_eslintrc}}": "---"  // Use token name per our guidelines
          }
        });

        instance = new Templates({
          src: "",
          dest: "dest",
          data: base.addPromptDefaults() // Always get these from prompts
        });
        _process = instance.process.bind(instance);
      });

      it("supports .eslintrc file template", function (done) {
        _process(function (err) {
          if (err) { return void done(err); }

          expect(base.fileRead("dest/.eslintrc")).to.equal("---");
          done();
        });
      });
    });

    describe("basic templates", function () {
      var basicTemplates;

      beforeEach(function () {
        // Mock filesystem
        base.mockFs({
          "extracted/basic": {
            src: {
              "index.js": "var <%= codeName %> = require(\"./<%= code %>.js\");\n\n" +
                "module.exports[<%= codeName %>] = <%= codeName %>;\n",
              "{{code}}.js": "module.exports = {\n" +
                "  greeting: \"Hello <%= username %>\"\n" +
                "};"
            },
            "README.md": "# Basic Tests\n\n" +
              "These files are to test out basic interpolation for file name and contents.\n",
            "{{text}}.md": "<%= username %>'s very own file\n"
          }
        });

        // Leave `data` empty for later hacking.
        basicTemplates = new Templates({
          src: ".",
          dest: "basic-dest",
          data: {
            _templatesDir: "basic"
          }
        });

        _process = basicTemplates.process.bind(basicTemplates);
      });

      it("errors on missing data value", function (done) {
        // Data is missing `text`.
        basicTemplates.data = _.merge(basicTemplates.data, {
          code: "the-codez",
          codeName: "TheCodez",
          username: "Billy"
        });

        _process(function (err) {
          expect(err)
            .to.be.ok.and
            .to.have.property("message").and
              .to.contain("Unknown").and
              .to.contain("text");

          done();
        });
      });

      it("errors on file name expansion clash", function (done) {
        // `text` value clashes with real file.
        basicTemplates.data = _.merge(basicTemplates.data, {
          code: "the-codez",
          codeName: "TheCodez",
          text: "README",
          username: "Billy"
        });

        _process(function (err) {
          expect(err)
            .to.be.ok.and
            .to.have.property("message").and
              .to.contain("Encountered 1 file path conflict").and
              .to.contain("README");

          done();
        });
      });

      it("writes out correct templates", function (done) {
        // Hack in valid data.
        basicTemplates.data = _.merge(basicTemplates.data, {
          code: "the-codez",
          codeName: "TheCodez",
          text: "the-textz",
          username: "Billy"
        });

        _process(function (err) {
          if (err) { return void done(err); }

          expect(base.fileRead("basic-dest/README.md")).to.contain("Basic Tests");
          expect(base.fileRead("basic-dest/the-textz.md")).to.contain("Billy");
          expect(base.fileRead("basic-dest/src/index.js"))
            .to.contain("TheCodez").and
            .to.contain("the-codez");
          expect(base.fileRead("basic-dest/src/the-codez.js")).to.contain("Billy");

          done();
        });
      });
    });
  });
});
