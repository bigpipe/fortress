/*globals suite, test*/
'use strict';

var EventEmitter = require('eventemitter3')
  , Fortress = require('./index.js')
  , Container = Fortress.Container
  , assert = require('assert')
  , Images = Fortress.Image;

//
// Fixtures.
//
var fixture = {
    console: 'console.log("foo");'
  , blocking: 'alert("foo"); confirm("bar"); prompt("baz");'
  , throws: 'throw new Error("error thrown")'
  , freeze: 'while(true) { if (window.bar) break; }'
  , recursive: 'function x(a) { foo(a++) } function foo(a) { x(a++) } x(10);'
};

describe('Fortress', function () {
  var fort;

  beforeEach(function () {
    fort = new Fortress();
  });

  afterEach(function () {
    fort.destroy();
  });

  it('is a function', function () {
    assert.equal(typeof Fortress, 'function');
  });

  it('exposes the Container', function () {
    assert.equal(typeof Fortress.Container, 'function');
  });

  it('exposes the Image', function () {
    assert.equal(typeof Fortress.Image, 'function');
    assert.ok(Fortress.Image !== Image);
  });

  it('inherits from EventEmitter3', function () {
    assert.ok(fort instanceof EventEmitter);
  });

  it('should not throw an error when a new instance is created', function () {
    assert.ok(fort instanceof Fortress);
  });

  it('should create a new fortress instance if its not created using new', function () {
    var fortress = Fortress // This is just here to please my JSHint preferences
      , fort = fortress();

    assert.ok(fort instanceof Fortress, 'should be an instance of Fortress');

    fort.destroy();
  });

  describe('#id', function () {
    var iterations = 1000;

    it('should generate a js variable compatible id', function () {
      assert.ok(!!~fort.id().indexOf('fortress'), 'id should be prefixed');

      for (var i = 0; i < iterations; i++) {
        var x = new Function('var '+ fort.id() + ' = 10; return 0;');
        assert.equal(x(), 0, 'should return the compiled functions result');
      }
    });

    it('should generate unique ids', function () {
      var ids = {};

      for (var i = 0; i < iterations; i++) {
        var id = fort.id();

        assert.ok(!(id in ids), 'id should be unique');
        ids[id] = 1;
      }
    });
  });

  describe('#get', function () {
    it('returns undefined when the container is not found', function () {
      assert.equal(fort.get('foo'), undefined, 'This does not exist');
    });

    it('returns the container when given the correct id', function () {
      var container = fort.create();

      assert.ok(container instanceof Fortress.Container);
      assert.ok(container === fort.get(container.id));
    });
  });

  describe('#globals', function () {
    it('detects the introduced `foo` global', function () {
      var current = fort.globals();

      assert.ok(current.length > 0, 'We should have introduced atleast one global');

      window.foo = 'bar';
      var introduced = fort.globals(current);

      assert.equal(introduced.length, 1, 'we introduced one global');
      assert.equal(introduced[0], 'foo', 'the global has the name foo');

      // Remove global.
      try { delete window.foo; }
      catch (e) {}
    });
  });

  describe('#all', function () {
    it('returns an empty array', function () {
      assert.equal(fort.all().length, 0, 'no length as we have no containers');
    });

    it('returns array with container instances', function () {
      var container = fort.create()
        , all = fort.all();

      assert.ok(container instanceof Fortress.Container);
      assert.equal(all.length, 1, 'we only created 1 container');
      assert.equal(all[0], container, 'fort.create returns container');
    });
  });

  describe('#create', function () {
    describe('with code', function () {
      it('runs our console code', function () {
        var container = fort.create(fixture.console);
      });
    });
  });
});

describe('Container', function () {
  var container
    , id = 0;

  beforeEach(function () {
    container = new Container(document.body, 'test_'+ id++);
  });

  afterEach(function () {
    container.destroy();
  });

  it('inherits from EventEmitter3', function () {
    assert.ok(container instanceof EventEmitter);
  });

  it('emits an `start` event when the container is started', function (done) {
    container.on('start', done);
    container.load(fixture.console).start();
  });

  it('emits an `stop` event when the container is stopped', function (done) {
    container.on('start', function () {
      container.stop();
    });

    container.on('stop', done);
    container.load(fixture.console).start();
  });

  it('sets the correct readyStates', function (done) {
    assert.equal(container.readyState, Container.CLOSED, 'not started, readyState is CLOSED');

    container.on('start', function () {
      assert.equal(container.readyState, Container.OPEN, 'readyState is OPEN after a start');

      container.on('stop', function () {
        assert.equal(container.readyState, Container.CLOSED, 'readyState is CLOSED');

        done();
      }).stop();

      assert.equal(container.readyState, Container.CLOSING, 'readystate is CLOSING after stopping');
    });

    //
    // This is a sync call.
    //
    container.load(fixture.console).start();
    assert.equal(container.readyState, Container.OPENING, 'readyState OPENING, weve started');

  });

  describe('#ping', function () {
    it('sets a new ping timeout for the given timeout');
    it('produces an error when the iframe times out');
  });

  describe('#retry', function () {
    it('emits `retry` after each attempt');
    it('recreates the iframe on the last retry');
    it('emits `end` after the last retry');
  });

  describe('#inspect', function () {
    it('can inspect a running container', function (done) {
      container.on('start', function () {
        container.inspect();
        done();
      }).load(fixture.console).start();
    });

    it('returns the stats', function (done) {
      var start = +new Date();

      container.on('start', function () {
        var stats = container.inspect()
          , end = (+new Date()) - start;

        assert.ok(stats.uptime < end);
        assert.ok(stats.uptime > 0);

        // Enabling these three checks causes chrome to stop the test.
        // assert.equal(stats.readyState, Container.OPEN);
        // assert.ok(stats.date instanceof Date);
        // assert.equal(stats.retires, container.retries);

        done();
      }).load(fixture.console).start();
    });

    it('returns an empty object when the container is down', function () {
      var stats = container.stop().inspect();

      assert.equal(typeof stats, 'object');

      for (var key in stats) {
        if (stats.hasOwnProperty(key)) throw new Error('I should be empty');
      }
    });

    it('returns the memory of the VM when the browser supports it', function (done) {
      if (typeof performance === 'undefined') return;

      container.on('start', function () {
        var stats = container.inspect();

        assert.equal(typeof stats, 'object');
        assert.equal(typeof stats.memory, 'object');
        assert.ok(stats.memory.limit > 0);
        assert.ok(stats.memory.total > 0);
        assert.ok(stats.memory.used > 0);

        done();
      }).load(fixture.console).start();
    });
  });

  describe('#bound', function () {
    it('binds the given function', function (done) {
      function foo() {
        assert.equal(this, container);

        done();
      }

      container.bound(foo)();
    });

    it('allows optional context', function (done) {
      function foo() {
        assert.equal(this, 1);

        done();
      }

      container.bound(foo, 1)();
    });

    it('currys the args', function (done) {
      function foo(arg1, arg2, arg3) {
        assert.equal(this, 1);
        assert.equal(arg1, 'foo');
        assert.equal(arg2, 'bar');
        assert.equal(arg3, 'baz');

        done();
      }

      container.bound(foo, 1, 'foo', 'bar')('baz');
    });
  });

  describe('#onmessage', function () {
    it('returns false for non-objects');
    it('returns false if there isnt a packet type');
    it('stores console messages');
    it('emits `attach` events for packet.attach & log types');
    it('emits `attach::method` for packet.attach & log types');
    it('emits `error` for error packets');
    it('restarts the ping squence with a ping packet');
    it('emits `message` for all other responses');
  });

  describe('#eval', function () {
    it('returns the result of the evaluated cmd', function (done) {
      container.eval('({ foo: "bar" })', function (err, data) {
        if (err) return done(err);

        assert.equal(data.foo, 'bar');
        done();
      });
    });

    it('captures errors in the evaluated cmd', function (done) {
      container.on('start', function () {
        container.eval('throw new Error("mess-up all the things")', function (err, data) {
          if (!err) return done(new Error('I should have received an error'));

          assert.equal(data, undefined);
          assert.equal(err.message, 'mess-up all the things');
          assert.equal(Object.prototype.toString.call(err), '[object Error]');

          done();
        });
      });

      container.on('error', function (e) {
        throw new Error('I should never be called if an eval fails');
      });

      container.load(fixture.console).start();
    });
  });

  describe('#load', function () {
    it('loads the new code in an image', function () {
      assert.ok(!container.image);

      container.load(fixture.console);
      assert.ok(!!container.image);
      assert.equal(container.image.source, fixture.console);
    });
  });

  describe('#destroy', function () {
    it('removes all listeners', function () {
      container.on('foo', function () {
        throw new Error();
      });

      container.destroy();
      container.emit('foo');
    });

    it('cleans up all references', function (done) {
      container.on('start', function () {
        assert.ok(!!document.getElementById(container.id));
        container.destroy();
        assert.ok(!document.getElementById(container.id));
        assert.ok(!container.i && !container.image && !container.mount);
        assert.ok(container.console.length === 0);

        done();
      }).load(fixture.console).start();
    });
  });
});

describe('Image', function () {
  var source = 'var foo = "bar";';

  it('returns the tranformed string using toString', function () {
    var image = new Images('dingdong', source);

    assert.ok(image instanceof Images);
    assert.ok(!!~image.toString().indexOf(source));

    // Test again to see if it's cached internally correctly
    assert.ok(!!~image.toString().indexOf(source));
  });

  it('stores the source', function () {
    var image = new Images('dingdong', source);
    assert.equal(image.source, source);
  });
});
