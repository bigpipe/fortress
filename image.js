'use strict';

/**
 * The Image that is loaded on to the container.
 *
 * @constructor
 * @param {String} id The id of the container.
 * @param {String} source The actual code.
 * @api private
 */
function Image(id, source) {
  this.compiled = null;
  this.source = source;
  this.id = id;
}

/**
 * Assume that the source of the Image is loaded using toString() so it will be
 * automatically transformed when the Image instance is concatenated or added to
 * the DOM.
 *
 * @returns {String}
 * @api public
 */
Image.prototype.toString = function toString() {
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
Image.prototype.transform = function transform() {
  var code = ('('+ (function fort(global) {
    /**
     * Simple helper function to do nothing.
     *
     * @type {Function}
     * @api private
     */
    function noop() {}

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
    // @TODO add proper stacktrace tool here?
    //
    global.onerror = function onerror() {
      var a = Array.prototype.slice.call(arguments, 0);
      this._fortress_id_({ type: 'error', scope: 'window.onerror', args: a });
      return true;
    };

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    for (var i = 0, b = ['alert', 'prompt', 'confirm']; i < b.length; i++) {
      global[b[i]] = noop;
    }

    //
    // Override the build-in console.log so we can transport the logging messages to
    // the actual page.
    //
    var methods = [
        'debug', 'error', 'info', 'log', 'warn', 'dir', 'dirxml', 'table', 'trace'
      , 'assert', 'count', 'markTimeline', 'profile', 'profileEnd', 'time'
      , 'timeEnd', 'timeStamp', 'timeline', 'timelineEnd', 'group'
      , 'groupCollapsed', 'groupEnd', 'clear', 'select'
    ], fconsole = typeof console !== 'undefined' ? console : {};
    global.console = {};

    /**
     * Helper method to polyfil our global console method so we can proxy it's
     * usage to the
     */
    function polyconsole(method) {
      //
      // Ensure that this host environment always has working console.
      //
      global.console[method] = function () {
        var args = Array.prototype.slice.call(arguments, 0);

        //
        // If the host supports this given method natively, execute it.
        //
        if (method in fconsole) fconsole[method].apply(fconsole, args);

        //
        // Proxy messages to the container.
        //
        this._fortress_id_({ type: 'console', scope: method, args: args });
      };
    }

    for (i = 0; i < methods.length; i++) {
      polyconsole(methods[i]);
    }

    //
    // All boilerplate code has been loaded, execute the actual code. After
    // a slight delay so we update the window with a reference to our own
    // container.
    //
    setTimeout(this.fort, 0);
  })+')(this)');

  //
  // Replace our "template tags" with the actual content.
  //
  code = code
    .replace(/_fortress_domain_/, document.domain)
    .replace(/this\._fortress_id_/, this.id);

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

module.exports = Image;
