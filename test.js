/*globals suite, test*/
'use strict';

var Fortress = require('./index.js')
  , assert = require('assert');

suite('fortress');

test('it should not throw an error when a new instance is created', function () {
  var fort = new Fortress();
});

test('it should create a new fortress instance if its not created using new', function () {
  var fort = Fortress();

  assert.ok(fort instanceof Fortress, 'should be an instance of Fortress');
});
