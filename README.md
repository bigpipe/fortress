![fortress](https://raw.github.com/3rd-Eden/fortress/master/fo%CC%88rt.jpg)

Fortress is the Docker for front-end applications. It allows you to your code in
a controlled and sandboxed environment. This library was originally designed for
my [bigpipe] project which assumes that your front-end is split up in different
pagelets or containers and each of these containers run it's own code.

[bigpipe]: https://github.com/3rd-Eden/bigpipe

This project has the following ambitious goals:

- Sandbox your code and it's used JavaScript primitives so other code will not
  be affected when you extend `Array.prototype` with new methods. Nor will you
  be affected by their changes.
- Other code from getting broken or stopped when an error occurs in side your
  own client code.
- Provide a retry and reload of your code when one of these errors occurs.
- Greater control over memory usage for single page applications as memory is
  released when the container is destroyed.
- Prevent mixing of `console.*` messages as each outputted in their own
  container.

## Installation

While this library can only be used in browser environments, it's downloadable
through `npm` so it can work browserify and other packaging systems. So to get
it through npm, simply run:

```
npm install fortress
```

For all other use cases, I would advice you to download the `index.js` from the
latest stable tag. But if you are feeling adventures, you can also try the
`master` branch.

## Quick start

```js
'use strict';

//
// @TODO write actual documentations instead of this api listing.
// 
var fort = new Fortress({ options });

//
// fort.all returns all created containers.
//
fort.all();

//
// fort.id returns the container based on the id.
//
fort.id(id);

//
// fort.create creates a new container. If code is supplied it will
// automatically start the newly created container. The options allows you
// control how the container is created and which restrictions it should force
// upon the code.
//
// This method returns the created `Container` instance so it can be manually
// controlled for greater control.
//
fort.create('var code = 1', { options });

//
// Start the container based on the id given.
//
fort.start(id);

//
// Stop the container based on the given id.
//
fort.stop(id);

//
// Restart the container. This is the same as stopping and starting your
// container.
//
fort.restart(id);

//
// When you stop a container it merely removes it from DOM. It does not mean it
// has been destroyed completely. If you never want to run this container again,
// kill it.
//
fort.kill(id);
```

## License

This work is released under MIT. Pull request, contributions and bug reports are
encouraged.
