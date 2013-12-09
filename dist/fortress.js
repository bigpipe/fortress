!function(e){"object"==typeof exports?module.exports=e():"function"==typeof define&&define.amd?define(e):"undefined"!=typeof window?window.Fortress=e():"undefined"!=typeof global?global.Fortress=e():"undefined"!=typeof self&&(self.Fortress=e())}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

  this.retries = 'retries' in options // How many times should we reload
    ? +options.reties || 3
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

  this.pong = setTimeout(this.bound(
    this.onmessage,
    {
      type: "error",
      scope: "iframe.timeout",
      args: [
        new Error('the iframe is no longer responding with ping packets')
      ]
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
        this.emit.apply(this, ['attach::'+ packet.method].concat(packet.args));
        this.emit.apply(this, ['attach'].concat(packet.args));
      }
    break;

    //
    // An error happened in the iframe, process it.
    //
    case 'error':
      this.emit('error', new Error(packet.args[0]));
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
  this.onmessage({ type: 'error', scope: 'iframe.onerror', args: a });

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

  //
  // If the container is already in the HTML we're going to assume that we still
  // have to load it with the Image. But if it's not in the mount point (DOM) we
  // assume that the iframe has been removed to release memory and what ever,
  // but when we re-add it to the mount point, it will automatically restart the
  // JavaScript that was originally loaded in the container.
  //
  if (!document.getElementById(this.id)) {
    this.mount.appendChild(this.i.frame);
    this.i.window[this.id] = this.bound(this.onmessage);
  } else {
    this.i.window[this.id] = this.bound(this.onmessage);

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
  this.mount.removeChild(this.i.frame);

  try { this.i.window.onerror = null; }
  catch (e) { /* Known to throw errors in certain situations (IE) */ }

  //
  // It's super important that this removed AFTER we've cleaned up all other
  // references as we might need to communicate back to our container when we
  // are unloading or when an `unload` event causes an error.
  //
  this.i.window[this.id] = null;

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
  this.removeAllListeners();

  return this;
};

//
// Expose the module.
//
module.exports = Container;

},{"./iframe":2,"./image":3,"eventemitter3":6}],2:[function(require,module,exports){
/**
 * Create a new pre-configured iframe.
 *
 * Options:
 *
 * visible: (boolean) Don't hide the iframe by default.
 * sandbox: (array) Sandbox properties.
 *
 * @param {Element} el DOM element where the iframe should be added on.
 * @param {String} id A unique name/id for the iframe.
 * @param {String} options Options.
 * @return {Object}
 * @api private
 */
function iframe(el, id, options) {
  'use strict';

  options = options || {};
  var i;

  try {
    //
    // Internet Explorer 6/7 require a unique name attribute in order to work.
    // In addition to that, dynamic name attributes cannot be added using
    // `i.name` as it will just ignore it. Creating it using this oddly <iframe>
    // element fixes these issues.
    //
    i = document.createElement('<iframe name="'+ id +'">');
  } catch (e) {
    i = document.createElement('iframe');
    i.name = id;
  }

  //
  // The iframe needs to be added in to the DOM before we can modify it, make
  // sure it's remains unseen.
  //
  if (!options.visible) {
    i.style.top = i.style.left = -10000;
    i.style.position = 'absolute';
    i.style.display = 'none';
  }

  i.setAttribute('frameBorder', 0);
  i.setAttribute('sandbox', (options.sandbox || [
    'allow-pointer-lock',
    'allow-same-origin',
    'allow-scripts',
    'allow-popups',
    'allow-forms'
  ]).join(' '));
  i.id = id;

  //
  // Insert before first child to avoid `Operation Aborted` error in IE6.
  //
  el.insertBefore(i, el.firstChild);

  return {
    document: i.contentDocument || i.contentWindow.document,
    window: i.contentWindow || i.contentDocument.parentWindow,
    frame: i
  };
}

module.exports = iframe;

},{}],3:[function(require,module,exports){
'use strict';

/**
 * The BaseImage that is loaded on to the container.
 *
 * @constructor
 * @param {String} id The id of the container.
 * @param {String} source The actual code.
 * @api private
 */
function BaseImage(id, source) {
  if (!(this instanceof BaseImage)) return new BaseImage(id, source);

  this.compiled = null;
  this.source = source;
  this.id = id;
}

/**
 * Assume that the source of the BaseImage is loaded using toString() so it will be
 * automatically transformed when the BaseImage instance is concatenated or added to
 * the DOM.
 *
 * @returns {String}
 * @api public
 */
BaseImage.prototype.toString = function toString() {
  if (this.compiled) return this.compiled;
  return this.compiled = this.transform();
};

/**
 * Apply source code transformations to the code so it can work inside an
 * iframe.
 *
 * @TODO allow custom code transformations.
 * @returns {String}
 * @api private
 */
BaseImage.prototype.transform = function transform() {
  var code = ('('+ (function fort(global) {
    /**
     * Simple helper function to do nothing.
     *
     * @type {Function}
     * @api private
     */
    function noop() { /* I do nothing useful */ }

    /**
     * AddListener polyfill
     *
     * @param {Mixed} thing What ever we want to listen on.
     * @param {String} evt The event we're listening for.
     * @param {Function} fn The function that gets executed.
     * @api private
     */
    function on(thing, evt, fn) {
      if (thing.addEventListener) {
        thing.addEventListener(evt, fn, false);
      } else if (on.attachEvent) {
        thing.attachEvent('on'+ evt, fn);
      }

      return { on: on };
    }

    //
    // Force the same domain as our 'root' script.
    //
    document.domain = '_fortress_domain_';

    //
    // Prevent common iframe detection scripts that do frame busting.
    //
    global.top = global.self = global.parent = global;

    //
    // Add a error listener. Adding it on the iframe it self doesn't make it
    // bubble up to the container. So in order to capture errors and notifying
    // the container we need to add a `window.onerror` listener inside the
    // iframe it self.
    // @TODO add proper stack trace tool here?
    //
    global.onerror = function onerror() {
      var a = Array.prototype.slice.call(arguments, 0);
      this._fortress_id_({ type: 'error', scope: 'window.onerror', args: a });
      return true;
    };

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    var blocking = ['alert', 'prompt', 'confirm', 'print', 'open'];
    for (var i = 0; i < blocking.length; i++) {
      try { global[blocking[i]] = noop; }
      catch (e) {}
    }

    //
    // Override the build-in console.log so we can transport the logging messages to
    // the actual page.
    //
    // @see https://github.com/DeveloperToolsWG/console-object/blob/master/api.md
    // for the minimum supported console.* methods.
    //
    var methods = [
        'debug', 'error', 'info', 'log', 'warn', 'dir', 'dirxml', 'table', 'trace'
      , 'assert', 'count', 'markTimeline', 'profile', 'profileEnd', 'time'
      , 'timeEnd', 'timeStamp', 'timeline', 'timelineEnd', 'group'
      , 'groupCollapsed', 'groupEnd', 'clear', 'select', 'exception'
      , 'isIndependentlyComposed'
    ], fconsole = typeof console !== 'undefined' ? console : {};
    global.console = {};

    /**
     * Helper method to polyfill our global console method so we can proxy it's
     * usage to the
     *
     * @param {String} method The console method we want to polyfill.
     * @api private
     */
    function polyconsole(method) {
      var attach = { debug: 1, error: 1, log: 1, warn: 1 };

      //
      // Ensure that this host environment always has working console.
      //
      global.console[method] = function polyfilled() {
        var args = Array.prototype.slice.call(arguments, 0);

        //
        // If the host supports this given method natively, execute it.
        //
        if (method in fconsole) fconsole[method].apply(fconsole, args);

        //
        // Proxy messages to the container.
        //
        this._fortress_id_({
          attach: method in attach,
          type: 'console',
          scope: method,
          args: args
        });
      };
    }

    for (i = 0; i < methods.length; i++) {
      polyconsole(methods[i]);
    }

    //
    // The setInterval allows us to detect if the iframe is still running of if
    // it has crashed or maybe it's just freezing up. We will be missing pings
    // or get extremely slow responses. Browsers will kill long running scripts
    // after 5 seconds of freezing:
    //
    // http://www.nczonline.net/blog/2009/01/05/what-determines-that-a-script-is-long-running/
    //
    setInterval(function ping() {
      this._fortress_id_({ type: 'ping' });
    }, 1000);

    //
    // Add load and unload listeners so we know when the iframe is alive and
    // dead.
    //
    on(global, 'unload', function unload() {
      this._fortress_id_({ type: 'unload' });
    }).on(global, 'load', function () {
      this._fortress_id_({ type: 'load' });
    });

    //
    // Ideally we load this code after our `load` event so we know that our own
    // bootstrapping has been loaded completely. But the problem is that we
    // actually cause full browser crashes in chrome when we execute this.
    //
    try { this.fort(); }
    catch (e) { this._fortress_id_({ type: 'error', scope: 'iframe.start', args: [e] }); }
  })+').call({}, this)');

  //
  // Replace our "template tags" with the actual content.
  //
  code = code
    .replace(/_fortress_domain_/g, document.domain)
    .replace(/this\._fortress_id_/g, this.id);

  //
  // Add the source on the first line so the stack traces that are returned from
  // errors still have the correct line numbers. By doing an indexOf on the
  // source we can get the first opening bracket and append the source to it.
  //
  var curly = code.indexOf('{') + 1;
  return code.slice(0, curly)
    + 'this.fort=function fort() {'+ this.source +'};'
    + code.slice(curly);
};

module.exports = BaseImage;

},{}],4:[function(require,module,exports){
'use strict';

var EventEmitter = require('eventemitter3')
  , Container = require('./container')
  , BaseImage = require('./image')
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

//
// Fortress inherits from EventEmitter3.
//
Fortress.prototype = new EventEmitter();

/**
 * Detect HTMLfile support in Internet Explorer. This might be used for more
 * advanced sand boxing in IE.
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
    if (introduced && old && old.length) {
      return ~old.indexOf(key)
      ? false
      : true;
    }

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
 * the process and the state of the container.
 *
 * @param {String} id The container id.
 * @api public
 */
Fortress.prototype.inspect = Fortress.prototype.top = function inspect(id) {
  var container = this.get(id);
  if (!container) return {};

  return container.inspect();
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
 * @param {String} id The container id.
 * @param {String} method The log method name.
 * @param {Function} fn The function that needs to be called for each stream.
 * @api public
 */
Fortress.prototype.attach = function attach(id, method, fn) {
  var container = this.get(id);
  if (!container) return this;

  if ('function' === typeof method) {
    fn = method;
    method = 'attach';
  } else {
    method += 'attach::'+ method;
  }

  container.on(method, fn);

  return this;
};

/**
 * Stop streaming logging information and cached logs.
 *
 * @param {String} id The container id.
 * @param {String} method The log method name.
 * @param {Function} fn The function that needs to be called for each stream.
 * @api public
 */
Fortress.prototype.detach = function detach(id, method, fn) {
  var container = this.get(id);
  if (!container) return this;

  if ('function' === typeof method) {
    fn = method;
    method = 'attach';
  } else {
    method += 'attach::'+ method;
  }

  if (!fn) container.removeAllListeners(method);
  else container.on(method, fn);

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

/**
 * Prepare a file or function to be loaded in to a Fortress based Container.
 * When the transfer boolean is set we assume that you want to load pass the
 * result of to a function or assign it a variable from the server to the client
 * side:
 *
 * ```
 * <script>
 * var code = <%- Fortress.stringify(code, true) %>
 * </script>
 * ```
 *
 * @param {String|Function} code The code that needs to be transformed.
 * @param {Boolean} transfer Prepare the code for transfer.
 * @returns {String}
 * @api public
 */
Fortress.stringify = function stringify(code, transfer) {
  if ('function' === typeof code) {
    //
    // We've been given a pure function, so we need to wrap it a little bit
    // after we've done a `toString` for the source retrieval so the function
    // will automatically execute when it's activated.
    //
    code = '('+ code.toString() +'())';
  } else {
    //
    // We've been given a string, so we're going to assume that it's path to file
    // that should be included instead.
    //
    code = require('fs').readFileSync(code, 'utf-8');
  }

  return transfer ? JSON.stringify(code) : code;
};

//
// Expose our Container and Image so it can be extended by third party.
//
Fortress.Container = Container;
Fortress.Image = BaseImage;

//
// Expose the module.
//
module.exports = Fortress;

},{"./container":1,"./iframe":2,"./image":3,"eventemitter3":6,"fs":5}],5:[function(require,module,exports){

},{}],6:[function(require,module,exports){
'use strict';

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() {
  this._events = {};
}

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  return Array.apply(this, this._events[event] || []);
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  if (!this._events || !this._events[event]) return false;

  var listeners = this._events[event]
    , length = listeners.length
    , handler = listeners[0]
    , len = arguments.length
    , args
    , i;

  if (1 === length) {
    switch (len) {
      case 1:
        handler.call(this);
      break;
      case 2:
        handler.call(this, a1);
      break;
      case 3:
        handler.call(this, a1, a2);
      break;
      case 4:
        handler.call(this, a1, a2, a3);
      break;
      case 5:
        handler.call(this, a1, a2, a3, a4);
      break;
      case 6:
        handler.call(this, a1, a2, a3, a4, a5);
      break;

      default:
        for (i = 1, args = new Array(len -1); i < len; i++) {
          args[i - 1] = arguments[i];
        }

        handler.apply(this, args);
    }

    if (handler.once) this.removeListener(event, handler);
  } else {
    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    for (i = 0; i < length; i++) {
      listeners[i].apply(this, args);
      if (listeners[i].once) this.removeListener(event, handler[i]);
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn) {
  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = [];
  this._events[event].push(fn);

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn) {
  fn.once = true;
  return this.on(event, fn);
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn) {
  if (!this._events || !this._events[event]) return this;

  var listeners = this._events[event]
    , events = [];

  for (var i = 0, length = listeners.length; i < length; i++) {
    if (fn && listeners[i] !== fn && listeners[i].fn !== fn) {
      events.push(listeners[i]);
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) this._events[event] = events;
  else this._events[event] = null;

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) this._events[event] = null;
  else this._events = {};

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the module.
//
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

try { module.exports = EventEmitter; }
catch (e) {}

},{}]},{},[4])
(4)
});
;