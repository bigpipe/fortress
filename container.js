'use strict';

var EventEmitter = require('eventemitter3')
  , slice = Array.prototype.slice
  , iframe = require('./iframe')
  , Image = require('./image');

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
  options = options || {};

  this.i = iframe(mount, id);         // The generated iframe.
  this.mount = mount;                 // Mount point of the container.
  this.console = [];                  // Historic console.* output.
  this.id = id;                       // Unique id.
  this.readyState = Container.CLOSED; // The readyState of the container.

  this.created = +new Date();         // Creation EPOCH.
  this.started = null;                // Start EPOCH.

  this.retries = 'retries' in options // How many times should we reload
    ? +options.reties || 3
    : 3;

  this.timeout = 'timeout' in options // Ping timeout before we reboot.
    ? +options.timeout || 1000
    : 1000;

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

  this.pong = setTimeout(this.bound(function pong() {
    this.onmessage({ type: "error", scope: "iframe.timeout", args: [
      'the iframe is no longer responding with ping packets'
    ] });
  }), this.timeout);

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
  var memory;

  //
  // Try to read out the `performance` information from the iframe.
  //
  if (this.i.window && this.i.window.performance) {
    memory = this.i.window.performance.memory;
  }

  memory = memory || {};

  return {
    state: this.readyState,
    uptime: +new Date() - this.started,
    attached: !!document.getElementById(this.id),
    memory: {
      limit: memory.jsHeapSizeLimit || 0,
      total: memory.totalJSHeapSize || 0,
      used: memory.usedJSHeapSize || 0
    }
  };
};

/**
 * Bind, without the .bind. This ensures that callbacks and functions are called
 * with the correct context.
 *
 * @param {Function} method The method that we should bind to.
 * @param {Mixed} context The context of the method, default to `this`
 * @returns {Function} Function that calls the method with the given context.
 * @api private
 */
Container.prototype.bound = function bound(method, context) {
  method = method || function noop() {};  // default to noop.
  context = context || this;              // default to `this`.

  var args = slice.call(arguments, 2);

  return function binded() {
    return method.apply(context, args.concat(slice.call(arguments, 0)));
  };
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
        this.emit.apply(this, ['attach::'+ packet.method].conat(packet.args));
        this.emit.apply(this, ['attach'].conat(packet.args));
      }
    break;

    //
    // An error happened in the iframe, process it.
    //
    case 'error':
      this.emit('error', new Error(packet.args[0])).retry();
    break;

    //
    // We've received a ping response from the iframe, so we know it's still
    // running as intended.
    //
    case 'ping':
      this.ping();
    break;

    //
    // Handle unknown package types by just returning false after we've emitted
    // it as an `regular` message.
    //
    default:
      this.emit('message', packet.data);
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
  try {
    this.i.window.eval(cmd);
  } catch (e) {
    return fn(e);
  }

  return fn();
};

/**
 * Error handling.
 *
 * @returns {Boolean}
 * @api private
 */
Container.prototype.onerror = function onerror() {
  var a = slice.call(arguments, 0);
  this.onmessage({ type: "error", scope: "iframe.onerror", args: a });

  return true;
};

/**
 * The container has been fully loaded and the iframe has executed it's code.
 *
 * @returns {Boolean}
 * @api private
 */
Container.prototype.onload = function onload() {
  this.readyState = Container.OPEN;
  this.emit('start');

  return true;
};

Container.prototype.onunload = function onunload() {
  this.readyState = Container.CLOSED;
  this.emit('stop');

  return true;
};

/**
 * Start the container.
 *
 * @returns {Container}
 * @api public
 */
Container.prototype.start = function start() {
  this.readyState = Container.OPENING;

  //
  // Attach various event listeners so we can update the state of the container.
  // We don't need to use `.addEventLister` as we only want and require one
  // single event listener.
  //
  this.i.window.onerror = this.bound(this.onerror);
  this.i.frame.onload = this.bound(this.onload);
  this.i.frame.onunload = this.bound(this.unload);

  //
  // If the container is already in the HTML we're going to assume that we still
  // have to load it with the Image. But if it's not in the mount point (DOM) we
  // assume that the iframe has been removed to release memory and what ever,
  // but when we re-add it to the mount point, it will automatically restart the
  // JavaScript that was originally loaded in the container.
  //
  if (!document.getElementById(this.id)) {
    this.mount.appendChild(this.i.frame);
  } else {
    var doc = this.i.document;

    doc.open();
    doc.write('<!doctype html><html><s'+'cript>'+ this.image +'</s'+'cript></html>');
    doc.close();
  }

  //
  // Introduce a custom variable in to the iframe that exposes our Container as
  // API. The Image can use this to communicate with the container and pass
  // messages back and forth.
  //
  this.i.window[this.id] = this.bound(this.onmessage);
  this.started = +new Date();

  return this;
};

/**
 * Stop running the code inside the container.
 *
 * @returns {Container}
 * @api private
 */
Container.prototype.stop = function stop() {
  if (!document.getElementById(this.id)) return this;

  this.readyState = Container.CLOSING;
  this.i.window[this.id] = null;
  this.mount.removeChild(this.i.frame);

  //
  // Known to throw errors in certain situations (IE)
  //
  try { this.i.frame.onload = null; }
  catch (e) {}

  try { this.i.frame.onunload = null; }
  catch (e) {}

  try { this.i.window.onerror = null; }
  catch (e) {}

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
  this.image = new Image(this.id, code);

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
  this.removeAllListeners();

  return this;
};

//
// Expose the module.
//
module.exports = Container;
