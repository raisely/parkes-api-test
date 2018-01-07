Concise JSON API tests for node 7.6.0+

Parkes API Test is built for the Parkes framework, but has no dependencies on
parkes or koa so you can use it to test any node server that is supported by
[supertest](https://www.npmjs.com/package/supertest).

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
The tests will run in mocha or jest.

```
npm install --save-dev parkes-api-test
```

Then in your `test/api/test.js`

```js
const app = require('../../app.js');
const describeApi = require('../');

const person = { name: 'Harvey Milk', state: 'California' };

describe('my api', () => {
  const getServer = describeApi.autorun(app);

  describeApi(getServer, [
    // GET /health, expect status == 200
    { path: '/health' },
    // POST /people with person body, response should contain { state: 'California' }
    { method: 'POST', path: '/people', body: person, expect: { state: 'California' } },
    // GET /people/1 response should contain { name: 'Harvey Milk' }
    { path: '/people/1', expect: { name: 'Harvey Milk' } },
    // GET /admin should return 403 error, (logged out) appended to test name
    { path: '/admin', note: '(logged out)', status: 403 },
    // GET /admin and send auth header, expect status == 200
    { path: '/admin', headers: { Authorization: `bearer ${token}` } },
  ]);
});

describe('RESTful api', () => {
  describeApi(getServer, '/people', [
    { }, // GET /people
    { method: 'POST', body: person }, // POST /people
    { method: 'PUT', path: '/1' },    // PUT /people/1
  ],
  () => {
    context('WHEN not authorised', () => {
      // NOTE nested calls to describeApi do not require getServer to
      // be passed in again
      // assert GET /people returns 403 error
      describeApi([ { status: 403 } ]);
    });

    context('WHEN person owns pets', () => {
      describeApi('/1/pets', () => {
        // Expect GET /people/1/pets/1 to be Skippy the Bush Kangaroo
        [{ path: '/1', expect: { name: 'Skippy', kind: 'Bush Kangaroo' }}],
      });
    })
  });
});
```

## What it tests
`describeApi` will check that the route returns the expected status code (200 by default)
and that the JSON returned contains at least the properties in the `expect` object.

If `expect` is not included in the options, then only the status is checked.

Body expectations use [chai-subset](https://github.com/debitoor/chai-subset) to
do partial matching on the JSON return value.

If you're using jest, it's highly recommended you install the optional dependency
[chai-subset-jest-diff](https://github.com/raisely/chai-subset-jest-diff) so
that your test reports have nicely formatted diffs

You can specify a url prefix as the second parameter to describeApi that will be used for all
paths.

## Defining routes to test
`describeApi` takes an array of routes to test. Each route is defined by an object
with the following keys.

All are optional. An empty object will result in a test that calls GET / expects a
return status of 200.

| key | default | description |
| --- | --- | ---- |
| method | GET | The HTTP method |
| path* | '' | Path to request |
| name | \`${method} ${path} (${note})\` | Specify if you want to override the route name |
| note | | A helpful note to differentiate the route from others |
| body* | | Body to send with the request |
| expect* | | Partial object to match JSON body against (can also be text) |
| headers* | | An object of headers to pass to the request |
| describe | | Callback to execute within the context of the route's describe block |

Options marked * can be a (async) function in which case the return value of the function
will be used. The functions are evaluated during test execution.

Tests by the same name may be grouped within the same describe statement by your
test runner, this could lead to unexpected results, so if you are testing the same
route more than once, you should use `note` to differentiate the tests.

## Payloads always in `data`
Expect and body by default assume that the API nests the objects within a data attribute.
If you want to specify these objects without the data wrapper, use \_body and \_expect.

```js
routes = [{ '/', expect: person }];

// Expects GET / to return
{
  data: {
    name: 'Harvey Milk',
    state: 'California'
  }
}

routes = [{ '/', _expect: person }];
// Expects GET / to return
{
  name: 'Harvey Milk',
  state: 'California'
}

```

## Passing the server in via a function
Because tests may want to spin up the server within before and after blocks
describeApi takes a function that returns the server.

When a route is executed getServer() will be called.

To simplify this setup, describeApi provides a helper function `autorun`
which will run the necessary `before` and `after` blocks to start up the
server and close it again when done.

Autorun expects an `app` that behaves like a koa app (returns a HttpServer from
`app.listen()`)

```js
const app = require('koa')();

app.use(myMiddleware);

const getServer = describeApi.autorun(app);

describeApi(getServer, ...)
```

## Extending the describe blocks
If you need more tests or hooks in the describe block for a particular test, use the describe
callback.

```js
describe('my api', () => {
  describeApi(server, [
    {
      path: '/get_gookie',
      describe: () => {
        it('returns a cookie', (response) => {
          expect(response.headers.cookies).to.be.ok;
        });
      }
    },
  });
});
```

### afterRoute and beforeRoute
To avoid confusion due to every route running only once in it's describe block,
parkes-api-test defines `beforeRoute` and `afterRoute` which are essentially
aliases for before(All) and after(All).

### `afterRoute` and `it` inside a route's describe block

Inside route describes, `afterRoute` and `it` functions are overridden to
pass additional arguments to the callback should you need them.

`it('', (response, resolvedRoute) => {})`
`afterAll((response, resolvedRoute) => {})`

`response` is the supertest response object

`resolvedRoute` is a copy of the route object with all dynamic attributes resolved

## Nesting blocks
Because describe blocks are used, you can nest them as you would expect.

You can also nest within a describe block for your router

Nested describeApi's inherit the `getServer` method and path from the above scope

```js
describe('my api', () => {
  describeApi(server, '/people', [
    { path: '/1' },
  ],
  () => {
    describe('WHEN they have pets', () => {
      describeApi('/1/pets', [
        { path: '/1' }
      ]);
    });
  });
});
```

## Under the hood

The test runner sets up a `describe` block for each route.

Each route is called during the **beforeAll** phase of the test. This is different from
most test patterns, but in order to assert things about the result of a HTTP request
you only need to make that request once.

Each route will have one `it` block for asserting the return status and body content of
the route.

If you define `block` then all the `it` blocks logically sit within the describe
block for that route.

```js

// Example
describe('my api', () => {
  describeApi(getServer, '/user', [
    { expect: expectedJson, describe: () => {
      it('passes response to it block', (response) => {
        expect(response.status).to.be.ok;
      });
    } }
  ]);
});

// Is the equivalent of
describe('my api', () => {
  describe('GET /user', () => {
    let response;

    beforeAll(() => {
      response = await getServer().get('/');
    })

    it('status 200', () => {
      expect(response.status).to.eq(200);
    });
    it('body is correct', () => {
      expect(response.body).to.containSubset(expectedJson);
    });
    it('passes response to it block', (response) => {
      expect(response.status).to.be.ok;
    });
  });
})
```

## Known Issues
Using `mocha -w` is currently broken as the before hooks do not run on subsequent
runs.
(The same problem does not occur when using Jest)

# License

© 2017 Agency Ventures

Licensed under the JWL license.  See [`LICENSE.md`](https://github.com/raisely/parkes-api-test/blob/master/LICENSE.md) for details.
