const _ = require('lodash');
const request = require('supertest');

const chai = require('chai');
const chaiSubset = require('chai-subset');

chai.use(chaiSubset);

const usingJest = !!(global.beforeAll);

if (usingJest) {
	try {
		// eslint-disable-next-line global-require, import/no-extraneous-dependencies
		const chaiSubsetJestDiff = require('chai-subset-jest-diff');
		chai.use(chaiSubsetJestDiff());
	} catch (e) {
		if (e.code === 'MODULE_NOT_FOUND') {
			// eslint-disable-next-line no-console
			console.warn(`It looks like you're Jest for testing, but haven't installed
chai-subset-jest-diff.
Run:

    npm install --save-dev chai-subset-jest-diff

to install it (which will make failed tests easier to understand).`);
		} else {
			throw e;
		}
	}
}

const chaiExpect = chai.expect;

// Support jest or mocha
const beforeAll = global.beforeAll || global.before;
const afterAll = global.afterAll || global.after;

/* eslint-disable no-underscore-dangle */

const servers = [];
const pathPrefixes = [];

function describeApi(...args /* server, pathPrefix, routes, block */) {
	const { server, pathPrefix, routes, block } = unpackArguments(args);
	if (server) servers.push(server);
	if (pathPrefix) pathPrefixes.push(pathPrefix);

	const currentServer = _.last(servers);
	const currentPrefix = pathPrefixes.join();

	afterEach(() => {
		currentServer.close();
	});

	try {
		routes.forEach((route) => {
			describeRoute(currentServer, route, currentPrefix);
		});

		if (block) block();
	} finally {
		// Forget things pushed on this call
		if (server) servers.pop();
		if (pathPrefix) pathPrefixes.pop();
	}
}

/**
  * Defines a route in the api
  * This method temporarily adds beforeRoute and afterRoute to the global
  * scope and overrides it so that blocks in this scope can
  * receive the response and route as parameters
  *
  * @param {object} server The server object that will server api requests
  * @param {object} route Object describing the route
  * @param {string} prefix Prefix for the path to call for the route
  */
function describeRoute(server, route, prefix) {
	route.method = route.method || 'GET';
	route.name = route.name || `${route.method} ${route.path} ${route.note || ''}`;
	route.status = route.status || 200;

	describe(route.name, () => {
		let executedRoute;
		beforeAll(async () => {
			executedRoute = await executeRoute(server, route, prefix);
		});

		if (route.describe) {
			const mochaIt = global.it;
			global.beforeRoute = beforeAll;
			global.it = (name, callback) => {
				mochaIt(name, () => {
					callback(executedRoute.response, executedRoute);
				});
			};
			global.afterRoute = (callback) => {
				afterAll(() => {
					callback(executedRoute.response, executedRoute);
				});
			};

			route.describe();

			global.it = mochaIt;
			['beforeRoute', 'afterRoute'].forEach((method) => {
				global[method] = () => {
					throw new Error(`${method} called outside of describeApi route context`);
				};
			});
		}

		if (route.expect || route._expect) {
			it(`returns ${route.status} with expected body`, async () => {
				checkStatus(executedRoute.response, executedRoute.status);

				// If the response is {}, but the response text is not {}
				// then the server probably sent an error message in plain text
				// so compare against that so that the developer can see that message
				if (_.isEqual(executedRoute.response.body, {}) && executedRoute.response.text !== '{}') {
					chaiExpect(executedRoute.response.text).to.eq(executedRoute.expect);
				} else {
					chaiExpect(executedRoute.response.body).to.containSubset(executedRoute.expect);
				}
			});
		} else {
			it(`returns ${route.status}`, () => {
				checkStatus(executedRoute.response, executedRoute.status);
			});
		}
	});
}

/**
  * Unpacks the arguments allowing for server, pathPrefix and block to be optional
  * assuming that they come in the following order
  * server, pathPrefix, routes, block
  */
function unpackArguments(args) {
	let server = false;
	let pathPrefix = false;
	let routes = false;
	let block = false;

	// Server object should define timeout property
	if (args[0].timeout) {
		server = args.shift();
	}

	if ((!server) && (!servers.length)) {
		throw new Error(`First call to describeApi must have server as the first argument (${args[0]} doesn't look like a server).`);
	}

	if (!Array.isArray(args[0])) {
		pathPrefix = args.shift();
	}

	if (Array.isArray(args[0])) {
		routes = args.shift();
	} else {
		throw new Error('describeApi must be called with an array of routes');
	}

	if (args.length) block = args.shift();

	return { server, pathPrefix, routes, block };
}

/**
  * @param fn Any javascript object
  * @param arg Argument to pass to function
  * @description if fn is a function, returns fn(arg)
  * @returns The result of the function or the arif it's not a function
  */
async function executeIfFunction(fn, arg) {
	if (_.isFunction(fn)) return fn(arg);

	return fn;
}

/**
  * Convert the specified properties to the result when they are executed
  * The properties are unchanged if they are not a function
  * @param {Object} obj The object to operate on
  * @param {string[]} properties The properties of the object to execute
  * @returns {Object} A new object containing only the specified properties
  */
async function executeProperties(obj, properties) {
	const result = {};

	for (let i = 0; i < properties.length; i++) {
		const prop = properties[i];
		// eslint-disable-next-line no-await-in-loop
		result[prop] = await executeIfFunction(obj[prop]);
	}

	return result;
}

function checkStatus(response, expectedStatus) {
	// If we didn't get a 200
	if (response.status !== expectedStatus) {
		// If it contains a body
		// Reveal the error message that the controller sent
		if (response.body && Object.keys(response.body) > 0) {
			chaiExpect(response.body).to.eq({});
		}

		if (response.text && response.text !== '') {
			chaiExpect(response.text).to.eq('');
		}

		// On the off chance it failed so bad it sent an empty body
		chaiExpect(response.status).to.eq(expectedStatus);
	}
}

function addHeaders(req, headers) {
	if (headers) {
		Object.keys(headers).forEach((header) => {
			// eslint-disable-next-line no-param-reassign
			req = req.set(header, headers[header]);
		});
	}

	return req;
}

async function executeRoute(server, route, prefix) {
	// Get the results from any function parameters
	const dynamicProperties = await executeProperties(route, [
		'body', '_body', 'path', '_expect', 'expect', 'headers',
	]);
	let { body } = dynamicProperties;
	const { path } = dynamicProperties;

	body = body ? { data: body } : dynamicProperties._body || {};

	// Set up the route
	let req = request(server)[route.method.toLowerCase()](prefix + path);

	req = addHeaders(req, dynamicProperties.headers);

	// add body if post/update
	if (route.method !== 'GET' && route.method !== 'DELETE') req.send(body);

	// run request
	const response = await req;

	const expected = dynamicProperties.expect ?
		{ data: dynamicProperties.expect } :
		dynamicProperties._expect;

	const executedRoute = _.pick(route, ['method', 'status', 'after', 'before']);
	Object.assign(executedRoute, {
		body,
		path,
		response,
		headers: dynamicProperties.headers,
		expect: expected,
		name: route.name,
	});

	return executedRoute;
}

module.exports = describeApi;
