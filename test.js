/*globals suite, test*/
'use strict';

var EventEmitter = require('eventemitter3')
  , Fortress = require('./index.js')
  , Container = Fortress.Container
  , assert = require('assert')
  , Images = Fortress.Image;

window.mocha.checkLeaks = false;

//
// Fixtures.
//
var fixture = {
    console: 'console.log("foo");'
  , blocking: 'alert("foo"); confirm("bar"); prompt("baz");'
  , throws: 'throw new Error("error thrown")'
  , freeze: 'while(true) { if (window.bar) break; }'
  , recursive: 'setTimeout(function () { function x(a) { foo(a++) } function foo(a) { x(a++) } x(10);}, 500)'
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
    container.on('error', function (err) {
      if (typeof console !== 'undefined') {
        console.log('('+ container.id +') error:', err.message, err.scope, err);
      } else {
        alert('error: '+ err.message +', scope:'+ err.scope);
      }
    });
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
    it('sets a new ping timeout for the given timeout', function (done) {
      container.timeout = 100;

      container.on('error', function () {
        throw new Error('I shouldnt not error');
      }).ping();

      setTimeout(function () {
        container.ping();
      }, 90);

      setTimeout(function () {
        container.stop();
        done();
      }, 150);
    });

    it('produces an error when the iframe times out', function (done) {
      container.timeout = 40;

      var start = new Date();
      container.on('error', function (e) {
        var end = new Date() - start;

        assert.ok(end >= 40, 'should have taken longer than 40 ms');
        assert.ok(end < 100, 'and less then 100');
        assert.ok(e instanceof Error, 'instance of');
        assert.ok(e.message.indexOf('iframe') > -1, 'correct message');

        done();
      });

      container.ping();
    });
  });

  describe('#retry', function () {
    it('honors the retries limit', function (done) {
      var retries = 0;
      container.retries = 4;

      container.on('retry', function () {
        retries++;
      });

      container.once('end', function () {
        assert.equal(retries, 4);
        done();
      });

      container.load(fixture.throws).start();
    });

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

        assert.ok(stats.uptime <= end, 'took longer than expected');
        assert.ok(stats.uptime > 0, 'no uptime');
        assert.equal(stats.readyState, Container.OPEN, 'incorrect readystate');
        assert.ok(stats.date instanceof Date, 'not a valid date');
        assert.equal(stats.retries, container.retries, 'a retry happend');

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

    if (
         typeof performance === 'undefined'
      || !performance.memory
      || performance.memory.usedJSHeapSize === 0
    ) return;

    it('returns the memory of the VM when the browser supports it', function (done) {
      container.on('start', function () {
        var stats = container.inspect();

        assert.equal(typeof stats, 'object');
        assert.equal(typeof stats.memory, 'object');

        assert.ok(stats.memory.limit > 0, 'limit should be greater than 0');
        assert.ok(stats.memory.total > 0, 'total should be greater than 0');
        assert.ok(stats.memory.used > 0, 'used should be greater than 0');

        done();
      }).load(fixture.console).start();
    });
  });

  describe('#onmessage', function () {
    it('returns false for non-objects', function () {
      assert.ok(!container.onmessage('foo'), 'dont accept strings');
      assert.ok(!container.onmessage([]), 'dont accept strings');
      assert.ok(!container.onmessage(new Date), 'dont accept date');
    });

    it('returns false if there isnt a packet type', function () {
      assert.ok(!container.onmessage({ foo: 'bar '}), 'no type prop');
      assert.ok(container.onmessage({ type: 'load' }), 'has type');
    });

    it('stores console messages', function () {
      assert.equal(container.console.length, 0, 'no active console messages');
      container.onmessage({ type: 'console', scope: 'log', args: ['foo'] });
      assert.equal(container.console.length, 1, '1 active console message');
      assert.equal(container.console[0].args[0], 'foo');
    });

    it('emits `attach` events for packet.attach & log types', function (done) {
      container.on('attach', function (scope, data) {
        assert.equal(scope, 'log');
        assert.equal(data, 'foo');

        done();
      }).onmessage({
        type: 'console',
        scope: 'log',
        args: ['foo'],
        attach: true
      });
    });

    it('emits `attach::scope` for packet.attach & log types', function (done) {
      container.on('attach::log', function (data) {
        assert.equal(data, 'foo');
        done();
      }).onmessage({
        type: 'console',
        scope: 'log',
        args: ['foo'],
        attach: true
      });
    });

    it('emits `error` for error packets', function (done) {
      container.on('error', function (err) {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'foo');

        done();
      }).onmessage({
        type: 'error',
        args: ['foo']
      });
    });

    it('emits `message` for all other responses', function (done) {
      container.on('message', function (data) {
        assert.equal('foo', data);
        done();
      }).onmessage({
        type: 'banana',
        args: ['foo']
      });
    });

    it('restarts the ping sequence with a ping packet', function (done) {
      assert.ok(!container.setTimeout.pong);
      container.on('ping', function () {
        assert.ok(!!container.setTimeout.pong);

        container.stop();
        done();
      }).onmessage({
        type: 'ping'
      });
    });
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
