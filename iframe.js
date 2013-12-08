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
