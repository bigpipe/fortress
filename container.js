'use strict';

var EventEmitter = require('eventemitter3')
  , slice = Array.prototype.slice
  , iframe = require('./iframe')
  , BaseImage = require('./image');

/**
 * Representation of a single container.
 *
 * Options:
 *
 * - retries; When an error occurs, how many times should we attempt to restart
 *   the code before we automatically stop() the container.
 * - stop; Stop the container when an error occurs.
 * - timeout; How long can a ping packet timeout before we assume that the
 *   container has died and should be restarted.
 *
 * @constructor
 * @param {Element} mount The element we should attach to.
 * @param {String} id A unique id for this container.
 * @param {String} code The actual that needs to run within the sandbox.
 * @param {Object} options Container configuration.
 * @api private
 */
function Container(mount, id, code, options) {
  if ('object' === typeof code) {
    options = code;
    code = null;
  }

  options = options || {};

  this.i = iframe(mount, id);         // The generated iframe.
  this.mount = mount;                 // Mount point of the container.
  this.console = [];                  // Historic console.* output.
  this.id = id;                       // Unique id.
  this.readyState = Container.CLOSED; // The readyState of the container.

  this.created = +new Date();         // Creation EPOCH.
  this.started = null;                // Start EPOCH.
  this.pong = null;                   // Stores our ping timeout.

  this.retries = 'retries' in options // How many times should we reload
    ? +options.retries || 3
    : 3;

  this.timeout = 'timeout' in options // Ping timeout before we reboot.
    ? +options.timeout || 1050
    : 1050;

  //
  // Initialise as an EventEmitter before we start loading in the code.
  //
  EventEmitter.call(this);

  //
  // Optional code to load in the container and start it directly.
  //
  if (code) this.load(code).start();
}

//
// The container inherits from the EventEmitter3.
//
Container.prototype = new EventEmitter();

/**
 * Internal readyStates for the container.
 *
 * @type {Number}
 * @private
 */
Container.CLOSING = 1;
Container.OPENING = 2;
Container.CLOSED  = 3;
Container.OPEN    = 4;

/**
 * Start a new ping timeout.
 *
 * @api private
 */
Container.prototype.ping = function ping() {
  if (this.pong) clearTimeout(this.pong);

  var self = this;
  this.pong = setTimeout(function pong() {
    self.onmessage({
      type: 'error',
      scope: 'iframe.timeout',
      args: [
        'the iframe is no longer responding with ping packets'
      ]
    });
  }, this.timeout);

  return this;
};

/**
 * Retry loading the code in the iframe. The container will be restored to a new
 * state or completely reset the iframe.
 *
 * @api private
 */
Container.prototype.retry = function retry() {
  switch (this.retries) {
    //
    // This is our last attempt, we've tried to have the iframe restart the code
    // it self, so for our last attempt we're going to completely create a new
    // iframe and re-compile the code for it.
    //
    case 1:
      this.stop(); // Clear old iframe and nuke it's references
      this.i = iframe(this.mount, this.id);
      this.load(this.image.source).start();
    break;

    //
    // No more attempts left.
    //
    case 0:
      this.emit('end');
    return;

    //
    // By starting and stopping (and there for removing and adding it back to
    // the DOM) the iframe will reload it's HTML and the added code.
    //
    default:
      this.stop().start();
    break;
  }

  this.emit('retry', this.retries);
  this.retries--;

  return this;
};

/**
 * Inspect the container to get some useful statistics about it and it's health.
 *
 * @returns {Object}
 * @api public
 */
Container.prototype.inspect = function inspect() {
  var attached = this.attached()
    , date = new Date()
    , memory;

  if (!attached) return {};

  //
  // Try to read out the `performance` information from the iframe.
  //
  if (this.i.window && this.i.window.performance) {
    memory = this.i.window.performance.memory;
  }

  memory = memory || {};

  return {
    readyState: this.readyState,
    retries: this.retries,
    uptime: this.started ? (+date) - this.started : 0,
    date: date,
    memory: {
      limit: memory.jsHeapSizeLimit || 0,
      total: memory.totalJSHeapSize || 0,
      used: memory.usedJSHeapSize || 0
    }
  };
};

/**
 * Checks if the iframe is currently attached to the DOM.
 *
 * @returns {Boolean} The container is attached to the mount point.
 * @api private
 */
Container.prototype.attached = function attached() {
  return !!document.getElementById(this.id);
};

/**
 * Parse and process incoming messages from the iframe. The incoming messages
 * should be objects that have a `type` property. The main reason why we have
 * this as a separate method is to give us flexibility. We are leveraging iframes
 * at the moment, but in the future we might want to leverage WebWorkers for the
 * sand boxing of JavaScript.
 *
 * @param {Object} packet The incoming message.
 * @returns {Boolean} Message was handled y/n.
 * @api private
 */
Container.prototype.onmessage = function onmessage(packet) {
  if ('object' !== typeof packet) return false;
  if (!('type' in packet)) return false;

  packet.args = packet.args || [];

  switch (packet.type) {
    //
    // The code in the iframe used the `console` method.
    //
    case 'console':
      this.console.push({
        method: packet.method,
        epoch: +new Date(),
        args: packet.args
      });

      if (packet.attach) {
        this.emit.apply(this, ['attach::'+ packet.method].concat(packet.args));
        this.emit.apply(this, ['attach', packet.method].concat(packet.args));
      }
    break;

    //
    // An error happened in the iframe, process it.
    //
    case 'error':
      var failure = new Error(packet.args[0]);
      failure.scope = packet.scope || 'generic';

      this.emit('error', failure);
      this.retry();
    break;

    //
    // The iframe and it's code has been loaded.
    //
    case 'load':
      this.readyState = Container.OPEN;
      this.emit('start');
    break;

    //
    // The iframe is unloading, attaching
    //
    case 'unload':
      this.readyState = Container.CLOSED;
      this.emit('stop');
    break;

    //
    // We've received a ping response from the iframe, so we know it's still
    // running as intended.
    //
    case 'ping':
      this.ping();
      this.emit('ping');
    break;

    //
    // Handle unknown package types by just returning false after we've emitted
    // it as an `regular` message.
    //
    default:
      this.emit.apply(this, ['message'].concat(packet.args));
    return false;
  }

  return true;
};

/**
 * Small wrapper around sandbox evaluation.
 *
 * @param {String} cmd The command to executed in the iframe.
 * @param {Function} fn Callback
 * @api public
 */
Container.prototype.eval = function evil(cmd, fn) {
  var data;

  try {
    data = this.i.window.eval(cmd);
  } catch (e) {
    return fn(e);
  }

  return fn(undefined, data);
};

/**
 * Start the container.
 *
 * @returns {Container}
 * @api public
 */
Container.prototype.start = function start() {
  this.readyState = Container.OPENING;

  var self = this
    , doc;

  /**
   * Simple argument proxy.
   *
   * @api private
   */
  function onmessage() {
    self.onmessage.apply(self, arguments);
  }

  this.started = +new Date();

  //
  // If the container is already in the HTML we're going to assume that we still
  // have to load it with the Image. But if it's not in the mount point (DOM) we
  // assume that the iframe has been removed to release memory and what ever,
  // but when we re-add it to the mount point, it will automatically restart the
  // JavaScript that was originally loaded in the container.
  //
  if (!this.attached()) {
    this.mount.appendChild(this.i.frame);
    this.i.window[this.id] = onmessage;
  } else {
    this.i.window[this.id] = onmessage;

    doc = this.i.document;
    doc.open();
    doc.write('<!doctype html><html><s'+'cript>'+ this.image +'</s'+'cript></html>');
    doc.close();
  }

  return this;
};

/**
 * Stop running the code inside the container.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.stop = function stop() {
  if (!this.attached()) return this;

  this.readyState = Container.CLOSING;
  this.mount.removeChild(this.i.frame);

  //
  // It's super important that this removed AFTER we've cleaned up all other
  // references as we might need to communicate back to our container when we
  // are unloading or when an `unload` event causes an error.
  //
  this.i.window[this.id] = null;

  //
  // Clear the timeout, so we don't trigger ping timeout errors.
  //
  if (this.pong) clearTimeout(this.pong);

  return this;
};

/**
 * Load the given code as image on to the container.
 *
 * @param {String} code The code that should run on the container.
 * @returns {Container}
 * @api public
 */
Container.prototype.load = function load(code) {
  this.image = new BaseImage(this.id, code);

  return this;
};

/**
 * Completely destroy the given container and ensure that all references are
 * nuked so we can clean up as much memory as possible.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.destroy = function destroy() {
  this.stop();

  //
  // Remove all possible references to release as much memory as possible.
  //
  this.mount = this.image = this.id = this.i = this.created = null;
  this.console.length = 0;

  this.removeAllListeners();

  return this;
};

//
// Expose the module.
//
module.exports = Container;
