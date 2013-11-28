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
    var fort = Fortress();

    assert.ok(fort instanceof Fortress, 'should be an instance of Fortress');
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
