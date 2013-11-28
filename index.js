'use strict';

/**
 * Create a new pre-configured iframe.
 *
 * @TODO add support for the HTML5 sandbox attribute.
 * @param {Element} el DOM element where the iframe should be added on.
 * @param {String} id A unique name/id for the iframe.
 * @return {Object}
 * @api private
 */
function iframe(el, id) {
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
  i.style.top = i.style.left = -10000;
  i.style.position = 'absolute';
  i.style.display = 'none';
  i.id = id;

  //
  // Insert before first child to avoid `Operation Aborted` error in IE6.
  //
  el.insertBefore(i, el.firstChild);

  return {
    document: i.contentDocument || i.contentWindow.document,
    window: i.contentWindow || i.contentDocument,
    frame: i
  };
}

/**
 * Representation of a single container.
 *
 * @constructor
 * @param {Element} mount The element we should attach to.
 * @param {String} id A unique id for this container.
 * @param {String} code The actual that needs to run within the sandbox.
 * @api private
 */
function Container(mount, id, code) {
  this.created = new Date();      // Creation date.
  this.mount = mount;             // Mount point of the container.
  this.id = id;                   // Unique id
  this.i = iframe(mount, id);     // The generated iframe.

  //
  // Optional code to load in the container and start it directly
  //
  if (code) {
    this.image = new Image(code);
    this.start();
  }
}

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

  return function binded() {
    method.apply(context, arguments);
  };
};

/**
 * Start the container.
 *
 * @returns {Container}
 * @api public
 */
Container.prototype.start = function start() {
  //
  // Attach various event listeners so we can update the state of the container.
  // We don't need to use `.addEventLister` as we only want and require one
  // single event listener.
  //
  this.i.frame.onerror = this.bound(this.onerror);
  this.i.frame.onload = this.bound(this.onload);

  //
  // If the container is already in the HTML we're going to assume that we still
  // have to load it with the Image. But if it's not in the mount point (DOM) we
  // assume that the iframe has been removed to release memory and what ever,
  // but when we re-add it to the mount point, it will automatically restart the
  // JavaScript that was originally loaded in the container.
  //
  if (!this.mount.getElementById(this.id)) {
    this.mount.appendChild(this.i.frame);
  } else {
    var doc = this.i.document;

    doc.open();
    doc.write('<html><s'+'cript>'+ this.image +'</s'+'cript></html>');
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
  if (!this.mount.getElementById(this.id)) return this;

  this.mount.removeChild(this.i.frame);
  this.i.frame.onerror = this.i.frame.onload = null;

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
  this.image = new Image(code);

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
  // Remove all possible references.
  //
  this.mount = this.image = this.id = this.i = this.created = null;

  return this;
};

/**
 * The Image that is loaded on to the container.
 *
 * @constructor
 * @param {String} source The actual code.
 * @api private
 */
function Image(source) {
  this.original = source;
  this.source = source;
}

/**
 * As we are running the code in a sandboxed iframe we need to make sure that
 * UI blocking code is removed or patched correctly. In addition to that we need
 * to make sure that the iframe points to the same domain as our host page in
 * order cross origin based requests to work correctly.
 *
 * @api private
 */
Image.prototype.patch = function patch() {
  return [
    //
    // Force the same domain as our "root" script.
    //
    'document.domain="'+ document.domain +'";',
    '(function (o, h) {',

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    'for (var i = 0; i < h.length; i++) o[h[i]] = function () {};',
    '})(this, ["alert", "prompt", "confirm"]);'
  ].join('\n');
};

/**
 * Override the build-in console.log so we can transport the logging messages to
 * the actual page.
 *
 * @api private
 */
Image.prototype.console = function console() {
  return;
};

/**
 * Limit the access scope of local storage. We are sharing the browser with
 * a couple of other scripts and we don't want them to access our local storage
 * and session storage.
 *
 * @param {Number} size The total storage this has.
 * @api private
 */
Image.prototype.storage = function storage(size) {

};

/**
 * Return the actual contents as the image is concatenated with some other
 * strings.
 *
 * @return {String}
 * @api private
 */
Image.prototype.toString = function toString() {
  return this.source;
};

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

  var scripts = document.getElementsByTagName('script');

  this.global = (function () { return this; })() || window;
  this.mount = scripts[scripts.length - 1] || document.body;
  this.containers = {};

  scripts = null;
}

Fortress.prototype.htmlfile = false;

try { Fortress.prototype.htmlfile = !!new ActiveXObject('htmlfile'); }
catch (e) {}

/**
 * Detect the current globals that are loaded in to this page. This way we can
 * see if we are leaking data.
 *
 * @returns {Array} Names of the leaked globals.
 * @api private
 */
Fortress.prototype.globals = function globals() {
  var i = iframe(this.mount, Date.now())
    , global = this.global;

  this.mount.removeChild(i.frame);

  //
  // Detect the globals and return them.
  //
  return Object.keys(global).filter(function filter(key) {
    return !(key in i.window);
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

  generated = generated.join('_');

  //
  // Ensure that we didn't generate a pre-existing id, if we did, generate
  // another id.
  //
  if (generated in this.containers) return id();
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

//
// Expose the module using a commonjs pattern, if people roll like that.
//
try { module.exports = Fortress; }
catch (e) {}
