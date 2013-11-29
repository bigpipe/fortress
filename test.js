/*globals suite, test*/
'use strict';

var Fortress = require('./index.js')
  , assert = require('assert');

describe('fortress', function () {
  it('exposes the Container', function () {
    assert.equal(typeof Fortress.Container, 'function');
  });

  it('exposes the Image', function () {
    assert.equal(typeof Fortress.Image, 'function');
  });

  it('should not throw an error when a new instance is created', function () {
    var fort = new Fortress();

    assert.ok(fort instanceof Fortress);
  });

  it('should create a new fortress instance if its not created using new', function () {
    var fortress = Fortress // This is just here to please my JSHint preferences
      , fort = fortress();

    assert.ok(fort instanceof Fortress, 'should be an instance of Fortress');
  });

  describe('#id', function () {
    var iterations = 1000;

    it('should generate a js variable compatible id', function () {
      var fort = new Fortress();

      assert.ok(!!~fort.id().indexOf('fortress'), 'id should be prefixed');

      for (var i = 0; i < iterations; i++) {
        var x = new Function('var '+ fort.id() + ' = 10; return 0;');
        assert.equal(x(), 0, 'should return the compiled functions result');
      }
    });

    it('should generate unique ids', function () {
      var fort = new Fortress()
        , ids = {};

      for (var i = 0; i < iterations; i++) {
        var id = fort.id();

        assert.ok(!(id in ids), 'id should be unique');
        ids[id] = 1;
      }
    });
  });

  describe('#get', function () {
    it('returns undefined when the container is not found', function () {
      var fort = new Fortress();

      assert.equal(fort.get('foo'), undefined, 'This does not exist');
    });

    it('returns the container when given the correct id', function () {
      var fort = new Fortress()
        , container = fort.create();

      assert.ok(container instanceof Fortress.Container);
      assert.ok(container === fort.get(container.id));
    });
  });

  describe('#all', function () {
    it('returns an empty array', function () {
      var fort = new Fortress()
        , all = fort.all();

      assert.equal(all.length, 0, 'no length as we have no containers');
    });

    it('returns array with container instances', function () {
      var fort = new Fortress()
        , container = fort.create()
        , all = fort.all();

      assert.ok(container instanceof Fortress.Container);
      assert.equal(all.length, 1, 'we only created 1 container');
      assert.equal(all[0], container, 'fort.create returns container');
    });
  });
});
