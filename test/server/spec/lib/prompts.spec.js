"use strict";

var _ = require("lodash");
var async = require("async");
var Prompt = require("inquirer/lib/prompts/base");
var prompts = require("../../../../lib/prompts");
var base = require("../base.spec");
var addDefaults = base.addPromptDefaults.bind(base);

// Helpers
/**
 * Invoke `prompts` and callback with _expected_ error object.
 *
 * @param {Object}    init      Initialization object
 * @param {Function}  assertFn  Assertion function on `(err)`
 * @returns {void}
 */
var promptsWithErr = function (init, assertFn) {
  return function (cb) {
    prompts({ init: init }, function (err) {
      assertFn(err);
      cb();
    });
  };
};

/**
 * Invoke `prompts` and callback with data object, erroring when appropriate.
 *
 * @param {Object}    init      Initialization object
 * @param {Function}  [setupFn] (OPTIONAL) Setup state function
 * @param {Function}  assertFn  Assertion function on `(data)`
 * @returns {void}
 */
var promptsWithData = function (init, setupFn, assertFn) {
  var args = _.toArray(arguments);

  // Assert function is last.
  setupFn = args.length === 3 ? args[1] : _.noop;
  assertFn = args.length === 3 ? args[2] : args[1];

  return function (cb) {
    setupFn();
    prompts({ init: init }, function (err, data) {
      if (err) { return void cb(err); }
      assertFn(data);
      cb();
    });
  };
};


describe("lib/prompts", function () {
  var runStub;

  beforeEach(function () {
    // Intercept all real stdin/stdout.
    runStub = base.sandbox.stub(Prompt.prototype, "run");
  });

  describe("#_parseOverrides", function () {
    var parse = prompts._parseOverrides.bind(prompts);

    it("handles base cases", function () {
      expect(parse("{}")).to.eql({});
      expect(parse(" {}")).to.eql({});
      expect(parse(" {}   ")).to.eql({});
    });

    it("handles non-quoted strings", function () {
      expect(parse("{\"foo\":42}")).to.eql({ foo: 42 });
    });

    it("strips single quotes", function () {
      expect(parse("'{\"foo\":42}'")).to.eql({ foo: 42 });
      expect(parse("  '{\"foo\":42}'")).to.eql({ foo: 42 });
      expect(parse("'{\"foo\":42}'  ")).to.eql({ foo: 42 });
    });

    it("strips double quotes", function () {
      expect(parse("\"{\"foo\":42}\"")).to.eql({ foo: 42 });
      expect(parse("  \"{\"foo\":42}\"")).to.eql({ foo: 42 });
      expect(parse("\"{\"foo\":42}\"  ")).to.eql({ foo: 42 });
    });
  });

  it("errors on invalid init object", function (done) {
    async.series([
      promptsWithErr(undefined, function (err) {
        expect(err)
          .to.be.an.instanceOf(Error).and
          .to.have.property("message", "Invalid init object");
      }),
      promptsWithErr(null, function (err) {
        expect(err)
          .to.be.an.instanceOf(Error).and
          .to.have.property("message", "Invalid init object");
      }),
      promptsWithErr({ prompts: "invalid-string" }, function (err) {
        expect(err)
          .to.be.an.instanceOf(Error).and
          .to.have.property("message").and
            .to.contain("Invalid prompts type");
      })
    ], done);
  });

  it("handles base cases", function (done) {
    runStub.yields("destination");

    async.series([
      promptsWithData({}, function (data) {
        expect(data).to.deep.equal(addDefaults());
      }),
      promptsWithData({ prompts: [] }, function (data) {
        expect(data).to.deep.equal(addDefaults());
      }),
      promptsWithData({ prompts: {}, derived: {} }, function (data) {
        expect(data).to.deep.equal(addDefaults());
      })
    ], done);
  });

  it("overrides prompts", function (done) {
    promptsWithData({
      overrides: JSON.stringify({
        destination: "destination",
        name: "Bob"
      }),
      prompts: { name: { message: "Name" } }
    }, function (data) {
      expect(runStub).to.not.be.called;
      expect(data).to.deep.equal(addDefaults({ name: "Bob" }));
    })(done);
  });

  it("creates derived data alone", function (done) {
    runStub.yields("destination");

    async.series([
      promptsWithData({
        derived: {
          foo: function (data, cb) { cb(null, "foo"); },
          bar: function (data, cb) { cb(null, "bar"); }
        }
      }, function (data) {
        expect(data).to.deep.equal(addDefaults({ foo: "foo", bar: "bar" }));
      }),
      promptsWithData({
        derived: {
          deferred: function (data, cb) {
            // Defer, then advance faked time.
            _.defer(cb, null, "foo");
            base.sandbox.clock.tick(1);
          }
        }
      }, function (data) {
        expect(data).to.deep.equal(addDefaults({ deferred: "foo" }));
      })
    ], done);
  });

  it("handles derived data errors", function (done) {
    runStub.yields("userOrDestination");

    async.series([
      promptsWithErr({
        prompts: {
          user: { message: "user" }
        },
        derived: {
          foo: function (data, cb) { cb(new Error("Derived Foo")); }
        }
      }, function (err) {
        expect(err)
          .to.be.an.instanceOf(Error).and
          .to.have.property("message").and
            .to.contain("Derived Foo");
      }),
      promptsWithErr({
        derived: {
          foo: function (data, cb) { cb(null, "foo"); },
          bar: function (data, cb) { cb(new Error("Derived Bar")); },
          baz: function (data, cb) { cb(null, "baz"); }
        }
      }, function (err) {
        expect(err)
          .to.be.an.instanceOf(Error).and
          .to.have.property("message").and
            .to.contain("Derived Bar");
      })
    ], done);
  });

  it("creates prompts data alone", function (done) {
    async.series([
      promptsWithData({
        prompts: {
          licenseDate: { message: "License date", default: "2016" }
        }
      }, function () {
        runStub
          .reset()
          .onCall(0).yields("2016")
          .onCall(1).yields("destination");
      }, function (data) {
        expect(data).to.deep.equal(addDefaults({ licenseDate: "2016" }));
      }),

      promptsWithData({
        prompts: {
          packageName: { message: "Package name" },
          packageDescription: { message: "Package description" }
        }
      }, function () {
        runStub
          .reset()
          .onCall(0).yields("whiz-bang")
          .onCall(1).yields("The Whiz Bang")
          .onCall(2).yields("destination");
      }, function (data) {
        expect(data).to.deep.equal(addDefaults({
          packageName: "whiz-bang",
          packageDescription: "The Whiz Bang"
        }));
      })
    ], done);
  });

  it("creates prompts and derived data", function (done) {
    promptsWithData({
      prompts: {
        year: { message: "License year" }
      },
      derived: {
        reverseYear: function (data, cb) {
          cb(null, data.year.split("").reverse().join(""));
        },
        independent: function (data, cb) { cb(null, "independent"); }
      }
    }, function () {
      runStub
        .reset()
        .onCall(0).yields("2016")
        .onCall(1).yields("destination");
    }, function (data) {
      expect(data).to.deep.equal(addDefaults({
        year: "2016",
        reverseYear: "6102",
        independent: "independent"
      }));
    })(done);
  });

  it("chooses prompts over derived data keys", function (done) {
    promptsWithData({
      prompts: {
        foo: { message: "The foo" }
      },
      derived: {
        foo: function (data, cb) { cb(null, "derived"); }
      }
    }, function () {
      runStub
        .reset()
        .onCall(0).yields("prompts")
        .onCall(1).yields("destination");
    }, function (data) {
      expect(data).to.deep.equal(addDefaults({
        foo: "prompts"
      }));
    })(done);
  });
});
