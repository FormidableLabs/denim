"use strict";

var _ = require("lodash");
var Task = require("../../../../lib/task");
var createTask = function (opts) {
  return new Task(_.merge({
    initFile: "my-prompts.js",
    prompts: {
      derived: {
        _templatesDir: function (data, cb) { cb(null, "my-dir"); }
      }
    }
  }, opts));
};

var base = require("../base.spec");

var SCRIPT = "my-template-engine";

describe("lib/task", function () {

  describe("#execute", function () {

    it("selects help", function (done) {
      base.sandbox.stub(Task.prototype, "help").yields();
      var task = createTask({ argv: ["node", SCRIPT, "-h"] });
      task.execute(function () {
        expect(task.isInflate()).to.be.false;
        expect(task.help).to.be.calledOnce;
        done();
      });
    });

    it("selects version", function (done) {
      base.sandbox.stub(Task.prototype, "version").yields();
      var task = createTask({ argv: ["node", SCRIPT, "--version"] });
      task.execute(function () {
        expect(task.isInflate()).to.be.false;
        expect(task.version).to.be.calledOnce;
        done();
      });
    });

    it("selects isInflate", function (done) {
      base.sandbox.stub(Task.prototype, "inflate").yields();
      var task = createTask({ argv: ["node", SCRIPT, "foo-module"] });
      task.execute(function () {
        expect(task.isInflate()).to.be.true;
        expect(task.inflate).to.be.calledOnce;
        done();
      });
    });

  });

  describe("#help", function () {

    it("displays help", function (done) {
      base.sandbox.stub(process.stdout, "write");
      base.sandbox.spy(Task.prototype, "help");
      var task = createTask({ argv: ["node", SCRIPT, "--help"] });
      task.execute(function (err) {
        if (err) { return void done(err); }
        expect(task.help).to.be.calledOnce;
        expect(process.stdout.write)
          .to.be.calledOnce.and
          .to.be.calledWithMatch(SCRIPT + " [flags] <module>");

        done();
      });
    });

  });

  describe("#version", function () {

    it("displays version", function (done) {
      base.sandbox.stub(process.stdout, "write");
      base.sandbox.spy(Task.prototype, "version");
      var task = createTask({ argv: ["node", SCRIPT, "-v"], version: "1.2.3" });
      task.execute(function (err) {
        if (err) { return void done(err); }
        expect(task.version).to.be.calledOnce;
        expect(process.stdout.write)
          .to.be.calledOnce.and
          .to.be.calledWithMatch("1.2.3");

        done();
      });
    });

  });

  describe("#inflate", function () {

    it("displys help if no module specified", function (done) {
      base.sandbox.stub(Task.prototype, "help").yields();
      var task = createTask({ argv: ["node", SCRIPT] });
      task.execute(function () {
        expect(task.isInflate()).to.be.false;
        expect(task.help).to.be.calledOnce;
        done();
      });
    });

    it("fails if 2 module specified", function (done) {
      var task = createTask({ argv: ["node", SCRIPT, "one", "two"] });
      task.execute(function (err) {
        expect(err).to.have.property("message").to.contain("Found 2 modules");
        done();
      });
    });

  });
});
