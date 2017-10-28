Concise JSON API tests for node 7.6.0+

Parkes API Test is built for the Parkes framework, but has no dependencies on
parkes or koa so you can use it to test any node server that is supported by
supertest.

# Why?

In environments that are pressed for time (and what development environment isn't?),
it's easy for tests to get put off.

Parkes API Test allows you to quickly build out some e2e tests that at least verify
that critical pathways in your API are responding with 200 and the key attributes
you'd expect.

The framework is designed to get tests up in < 5 minutes for most common cases
so that developers can focus on delivering new features.

# Getting started

Parkes API Test requires **node v7.6.0** or higher for ES2015 and async function support.

```
npm install --save-dev parkes-api-test
```

Then in your `test/api/test.js`

```js
const server = require('../../server');
const describeApi = require('../');

const person = { name: 'Harvey Milk', state: 'California' };

describeApi('my api', server, [
  { path: '/health' },
  { method: 'POST', path: '/people', body: person, expect: { state: 'California' } },
  { path: '/people/1', expect: { name: 'Harvey Milk' } },
  { path: '/admin', note: '(logged out)', status: 403 },
  { path: '/admin', headers: { Authorization: `bearer ${token}` } },
], { beforeAll, afterAll });

async function beforeAll() {
  await init();
}

async function afterAll() {
  await cleanUp();
}
```

## What it tests
`describeApi` will check that the route returns the expected status code (200 by default)
and that the JSON returned contains at least the properties in the `expect` object.

If `expect` is not defined, then only the status is checked.

Body expectations use [chai-subset](https://github.com/debitoor/chai-subset) to
do partial matching on the JSON return value.

## Defining routes to test
`describeApi` takes an array of routes to test. Each route is defined by an object
with the following keys.

All are optional except for `path`.

| key | default | description |
| --- | --- | ---- |
| method | GET | The HTTP method |
| path* | | Path to request |
| name | `${method} ${path} (${note})` | Specify if you want to override the route name |
| note | | A helpful note to differentiate the route from others |
| body* | | Body to send with the request |
| expect* | | Partial object to match JSON body against |
| headers* | | An object of headers to pass to the request |
| before | | beforeEach hook for the test |
| after | | Function to be run at the end of the test |
| assert | | Custom method to assert something else about the route |

Options marked * can be a (async) function in which case the return value of the function
will be used. The functions are evaluated during test execution.

Jest groups tests by the same name together, this could lead to unexpected results, so
if you are testing the same route more than once, you should use `note` to differentiate
the tests.

## Assumes nesting in data
Expect and body by default assume that the API nests data objects within data.
If you to specify these objects without the data wrapper, use \_body and \_expect.

```js
routes = [{ '/', expect: person }];

// Expects GET / to return
{
  data: { name: 'Harvey Milk', state: 'California' }
}

routes = [{ '/', _expect: person }];
// Expects GET / to return
{
  name: 'Harvey Milk',
  state: 'California'
}

```

# `after` and `assert`
`after` and `assert` properties take functions of the form

`function(response, resolvedRoute)`

`response` is the supertest response object

`resolvedRoute` is a copy of the route object with all dynamic attributes resolved




## Under the hood

The test runner sets up a `describe` block for the api, and a `describe` block for
each route.

Each route will have one `it` block for asserting the return status and body of
the route.

If you define `assert` then a second `it` block is defined.
This means that your route will be called _twice_ if you set up an `assert`.

```js

// Example
describeApi('my api', [
  { path: '/' }
], { beforeAll, afterAll });

// Creates

describe('my api', () => {
  beforeAll(() => {
    await options.beforeAll();
  })
  afterAll(() => {
    await options.afterAll();
  })

  describe('GET /', () => {
    it('returns 200 with expected body', () => {});
    it('custom assert', () => {});
  });
})
```

# License

© 2017 Agency Ventures

Licensed under the KWPL license.  See [`LICENSE.md`](https://github.com/raisely/parkes-api-test/blob/master/LICENSE.md) for details.
