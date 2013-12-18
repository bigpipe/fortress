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
  this.setTimeout = {};               // Stores our setTimeout references.
  this.id = id;                       // Unique id.
  this.readyState = Container.CLOSED; // The readyState of the container.

  this.created = +new Date();         // Creation EPOCH.
  this.started = null;                // Start EPOCH.

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
Container.prototype.constructor = Container;

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
  if (this.setTimeout.pong) clearTimeout(this.setTimeout.pong);

  var self = this;
  this.setTimeout.pong = setTimeout(function pong() {
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
      this.stop();
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
  if (!this.i.attached()) return {};

  var date = new Date()
    , memory;

  //
  // Try to read out the `performance` information from the iframe.
  //
  if (this.i.window() && this.i.window().performance) {
    memory = this.i.window().performance.memory;
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
        scope: packet.scope,
        epoch: +new Date(),
        args: packet.args
      });

      if (packet.attach) {
        this.emit.apply(this, ['attach::'+ packet.scope].concat(packet.args));
        this.emit.apply(this, ['attach', packet.scope].concat(packet.args));
      }
    break;

    //
    // An error happened in the iframe, process it.
    //
    case 'error':
      var failure = packet.args[0].stack ? packet.args[0] : new Error(packet.args[0]);
      failure.scope = packet.scope || 'generic';

      this.emit('error', failure);
      this.retry();
    break;

    //
    // The iframe and it's code has been loaded.
    //
    case 'load':
      if (this.readyState !== Container.OPEN) {
        this.readyState = Container.OPEN;
        this.emit('start');
      }
    break;

    //
    // The iframe is unloading, attaching
    //
    case 'unload':
      if (this.readyState !== Container.CLOSED) {
        this.readyState = Container.CLOSED;
        this.emit('stop');
      }
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
    data = this.i.add().window().eval(cmd);
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

  var self = this;

  /**
   * Simple argument proxy.
   *
   * @api private
   */
  function onmessage() {
    self.onmessage.apply(self, arguments);
  }

  //
  // Code loading is an sync process, but this COULD cause huge stack traces
  // and really odd feedback loops in the stack trace. So we deliberately want
  // to destroy the stack trace here.
  //
  this.setTimeout.start = setTimeout(function async() {
    var doc = self.i.document();

    //
    // No doc.open, the iframe has already been destroyed!
    //
    if (!doc.open || !self.i) return;

    //
    // We need to open and close the iframe in order for it to trigger an onload
    // event. Certain scripts might require in order to execute properly.
    //
    doc.open();
    doc.write('<!doctype html>'); // Smallest, valid HTML5 document possible.

    //
    // Introduce our messaging variable, this needs to be done before we eval
    // our code. If we set this value before the setTimeout, it doesn't work in
    // Opera due to reasons.
    //
    self.i.window()[self.id] = onmessage;
    self.eval(self.image.toString(), function evil(err) {
      if (err) return self.onmessage({
        type: 'error',
        scope: 'iframe.eval',
        args: [ err ]
      });
    });

    //
    // If executing the code results to an error we could actually be stopping
    // and removing the iframe from the source before we're able to close it.
    // This is because executing the code inside the iframe is actually an sync
    // operation.
    //
    if (doc.close) doc.close();
  }, 0);

  //
  // We can only write to the iframe if it's actually in the DOM. The `i.add()`
  // method ensures that the iframe is added to the DOM.
  //
  this.i.add();
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
  if (this.readyState !== Container.CLOSED && this.readyState !== Container.CLOSING) {
    this.readyState = Container.CLOSING;
  }

  this.i.remove();

  //
  // Opera doesn't support unload events. So adding an listener inside the
  // iframe for `unload` doesn't work. This is the only way around it.
  //
  this.onmessage({ type: 'unload' });

  //
  // It's super important that this removed AFTER we've cleaned up all other
  // references as we might need to communicate back to our container when we
  // are unloading or when an `unload` event causes an error.
  //
  this.i.window()[this.id] = null;

  //
  // Clear the timeouts.
  //
  for (var timeout in this.setTimeout) {
    clearTimeout(this.setTimeout[timeout]);
    delete this.setTimeout[timeout];
  }

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
  if (!this.i) return this;
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
