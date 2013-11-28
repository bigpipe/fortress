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
});
