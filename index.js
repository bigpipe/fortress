'use strict';

var EventEmitter = require('eventemitter3')
  , Container = require('./container')
  , iframe = require('./iframe');

/**
 * Fortress: Container and Image management for front-end code.
 *
 * @constructor
 * @param {Object} options Fortress configuration
 * @api private
 */
function Fortress(options) {
  if (!(this instanceof Fortress)) return new Fortress(options);
  options = options || {};

  //
  // Create a small dedicated container that houses all our iframes. This might
  // add an extra DOM node to the page in addition to each iframe but it will
  // ultimately result in a cleaner DOM as everything is nicely tucked away.
  //
  var scripts = document.getElementsByTagName('script')
    , append = scripts[scripts.length - 1] || document.body
    , div = document.createElement('div');

  append.parentNode.insertBefore(div, append);

  this.global = (function () { return this; })() || window;
  this.containers = {};
  this.mount = div;

  scripts = null;

  EventEmitter.call(this);
}

Fortress.prototype = new EventEmitter();

/**
 * Detect HTMLfile support.
 *
 * @type {Boolean}
 * @api private
 */
Fortress.prototype.htmlfile = false;

try { Fortress.prototype.htmlfile = !!new ActiveXObject('htmlfile'); }
catch (e) {}

/**
 * Detect the current globals that are loaded in to this page. This way we can
 * see if we are leaking data.
 *
 * @param {Array} old Optional array with previous or known leaks.
 * @returns {Array} Names of the leaked globals.
 * @api private
 */
Fortress.prototype.globals = function globals(old) {
  var i = iframe(this.mount, Date.now())
    , global = this.global;

  this.mount.removeChild(i.frame);

  //
  // Detect the globals and return them.
  //
  return Object.keys(global).filter(function filter(key) {
    var introduced = !(key in i.window);

    //
    // We've been given an array, so we should use that as the source of previous
    // and acknowledged leaks and only return an array that contains newly
    // introduced leaks.
    //
    if (introduced && old && old.length) return ~old.indexOf(introduced)
      ? false
      : true;

    return introduced;
  });
};

/**
 * List all active containers.
 *
 * @returns {Array} Active containers.
 * @api public
 */
Fortress.prototype.all = function all() {
  var everything = [];

  for (var id in this.containers) {
    everything.push(this.containers[id]);
  }

  return everything;
};

/**
 * Generate an unique, unknown id that we can use for our container storage.
 *
 * @returns {String}
 * @api private
 */
Fortress.prototype.id = function id() {
  for (var i = 0, generated = []; i < 4; i++) {
    generated.push(Math.random().toString(36).substring(2));
  }

  generated = 'fortress_'+ generated.join('_');

  //
  // Ensure that we didn't generate a pre-existing id, if we did, generate
  // another id.
  //
  if (generated in this.containers) return this.id();
  return generated;
};

/**
 * Create a new container.
 *
 * @param {String} code
 * @param {Object} options Options for the container
 * @returns {Container}
 * @api public
 */
Fortress.prototype.create = function create(code, options) {
  var container = new Container(this.mount, this.id(), code, options);
  this.containers[container.id] = container;

  return container;
};

/**
 * Get a container based on it's unique id.
 *
 * @param {String} id The container id.
 * @returns {Container}
 * @api public
 */
Fortress.prototype.get = function get(id) {
  return this.containers[id];
};

/**
 * Inspect a running Container in order to get more detailed information about
 * the process. In recent browsers we can access:
 *
 * - console.memory(), performance.memory
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.inspect = function inspect(id) {
  return this;
};

/**
 * Start the container with the given id.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.start = function start(id) {
  var container = this.get(id);
  if (!container) return this;

  container.start();
  return this;
};

/**
 * Stop a running container, this does not fully destroy the container. It
 * merely stops it from running. Stopping an container will cause the container
 * to start from the beginning again once it's started. This is not a pause
 * function.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.stop = function stop(id) {
  var container = this.get(id);
  if (!container) return this;

  container.stop();
  return this;
};

/**
 * Restart a container. Basically, just a start and stop.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.restart = function restart(id) {
  var container = this.get(id);
  if (!container) return this;

  container.stop().start();

  return this;
};

/**
 * Completely remove and shutdown the given container id.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.kill = function kill(id) {
  var container = this.get(id);
  if (!container) return this;

  container.destroy();
  delete this.containers[id];

  return this;
};

/**
 * Start streaming logging information and cached logs.
 *
 * @param {String} id
 * @api public
 */
Fortress.prototype.attach = function attach(id) {
  return this;
};

/**
 * Destroy all active containers and clean up all references. We expect no more
 * further calls to this Fortress instance.
 *
 * @api public
 */
Fortress.prototype.destroy = function destroy() {
  for (var id in this.containers) {
    this.kill(id);
  }

  this.mount.parentNode.removeChild(this.mount);
  this.global = this.mount = this.containers = null;
};

//
// Expose our Container and Image so it can be extended by third party.
//
Fortress.Container = Container;
Fortress.Image = Image;

//
// Expose the module.
//
module.exports = Fortress;
