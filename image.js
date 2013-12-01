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
  this.source = source;
  this.id = id;
}

/**
 * As we are running the code in a sandboxed iframe we need to make sure that
 * UI blocking code is removed or patched correctly. In addition to that we need
 * to make sure that the iframe points to the same domain as our host page in
 * order cross origin based requests to work correctly.
 *
 * @returns {String} Boilerplate code.
 * @api private
 */
Image.prototype.patch = function patch() {
  return [
    //
    // Force the same domain as our "root" script.
    //
    'document.domain="'+ document.domain +'";',

    //
    // Prevent common iframe detection scripts that do frame busting.
    //
    'top = self = parent = window;',

    //
    // Eliminate the browsers blocking dialogs, we're in a iframe not a browser.
    //
    '(function (o, h) {',
      'for (var i = 0; i < h.length; i++) o[h[i]] = function () {};',
    '})(this, ["alert", "prompt", "confirm"]);',

    //
    // Add a error listener. Adding it on the iframe it self doesn't make it
    // bubble up to the container. So in order to capture errors and notifying
    // the container we need to add a `window.onerror` listener inside the
    // iframe it self.
    // @TODO add proper stacktrace tool here?
    //
    'this.onerror = function onerror() {',
      'var a = Array.prototype.slice.call(arguments, 0);',
      this.id +'({ type: "error", scope: "window.onerror", args: a });',
      'return true;',
    '};',
  ].join('\n');
};

/**
 * Override the build-in console.log so we can transport the logging messages to
 * the actual page.
 *
 * @returns {String} Boilerplate code.
 * @api private
 */
Image.prototype.consolas = function consolas() {
  return [
    '(function (o, c, m) {',
      'o.console = {};',
      'for (var i = 0; i < m.length; i++) (function (y) {',
        //
        // Ensure that this host environment always has working console.
        //
        'o.console[y] = function () {',
          'var a = Array.prototype.slice.call(arguments, 0);',
          //
          // If the host supports this given method natively, execute it.
          //
          'if (y in c) c[y].apply(c, a);',

          //
          // Proxy messages to the container.
          //
          this.id +'({ type: "console", scope: y, args: a });',
        '};',
      '}(m[i]));',
    '}(this, typeof console !== "undefined" ? console : {}, ["debug","error","info","log","warn","dir","dirxml","table","trace","assert","count","markTimeline","profile","profileEnd","time","timeEnd","timeStamp","timeline","timelineEnd","group","groupCollapsed","groupEnd","clear", "select"]));'
  ].join('\n');
};

/**
 * Limit the access scope of local storage. We are sharing the browser with
 * a couple of other scripts and we don't want them to access our local storage
 * and session storage.
 *
 * @param {Number} size The total storage this has.
 * @returns {String} Boilerplate code.
 * @api private
 */
Image.prototype.storage = function storage(size) {
  return '';
};

/**
 * Return the actual contents as the image is concatenated with some other
 * strings.
 *
 * @return {String}
 * @api private
 */
Image.prototype.toString = function toString() {
  return [
    //
    // Wrap the source in a `fort()` function so we can delay the execution
    // while maintaining accurate line numbers by adding our own boiler plate
    // code after the fort() function.
    //
    'function fort() {'+ this.source +'}',

    //
    // Add the custom boiler plate code.
    //
    this.patch(),
    this.storage(),
    this.consolas(),

    //
    // All boilerplate code has been loaded, execute the actual code. After
    // a slight delay so we update the window with a reference to our own
    // container.
    //
    'setTimeout(fort, 0);'
  ].join('\n');
};

module.exports = Image;
