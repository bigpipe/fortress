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
    //
    // When you toString a function which is created while in strict mode,
    // firefox will add "use strict"; to the body of the function. Chrome leaves
    // the source intact. Knowing this, we cannot blindly assume that we can
    // inject code after the first opening bracked `{`.
    //
    this.fort();

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
    try { global.top = global.self = global.parent = global; }
    catch (e) { /* Damn, read-only */ }

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
    var self = this;
    setTimeout(function timeout() {
      try { self.fort(); }
      catch (e) {
        this._fortress_id_({ type: 'error', scope: 'iframe.start', args: [e] });
      }
    }, 0);
  })+').call({}, this)');

  //
  // Replace our "template tags" with the actual content.
  //
  return code
    .replace(/_fortress_domain_/g, document.domain)
    .replace(/this\._fortress_id_/g, this.id)
    .replace(/this\.fort\(\);/g, 'this.fort=function fort() {'+ this.source +'};');
};

module.exports = BaseImage;
