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
      console.log(container.id, 'stop');
      container.stop();
    });

    container.on('stop', done);
    container.load(fixture.console).start();
  });
  it('sets the correct readyStates');

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
    it('returns an empty object when the container is down');
    it('returns the memory of the VM when the browser supports it');
    it('returns the uptime');
  });

  describe('#bound', function () {
    it('binds the given function');
    it('allows optional context');
    it('currys the args');
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
    it('returns the result of the evaluated cmd');
    it('captures errors in the evaluated cmd');
  });

  describe('#load', function () {
    it('loads the new code in an image');
  });

  describe('#destroy', function () {
    it('removes all listeners');
    it('cleans up all references');
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
