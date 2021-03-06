const _ = require('lodash');
const request = require('supertest');

const chai = require('chai');
const chaiSubset = require('chai-subset');

const autorun = require('./autorun');

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

// Support jest or mocha
const beforeAll = global.beforeAll || global.before;
const afterAll = global.afterAll || global.after;

const chaiExpect = chai.expect;

/* eslint-disable no-underscore-dangle */

const servers = [];
const pathPrefixes = [];
const definedModifiers = [];

function addDefaultModifier(routeModifier) {
	if (!_.isFunction(routeModifier)) {
		throw new Error('Route modifier must be a function');
	}
	definedModifiers.push(routeModifier);
}

function describeApi(...args) {
	const { server, pathPrefix, routes, block, routeModifier } = unpackArguments(args);

	if (server) servers.push(server);
	if (pathPrefix) pathPrefixes.push(pathPrefix);
	if (routeModifier) definedModifiers.push(routeModifier);

	const app = _.last(servers);

	const currentPrefix = pathPrefixes.join();

	try {
		routes.forEach((route) => {
			describeRoute(app, route, currentPrefix, definedModifiers);
		});

		if (block) block();
	} finally {
		// Forget things pushed on this call
		if (server) servers.pop();
		if (pathPrefix) pathPrefixes.pop();
		if (routeModifier) definedModifiers.pop();
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
function describeRoute(app, route, prefix, currentModifiers) {
	const routeModifiers = _.clone(currentModifiers);
	route.method = route.method || 'GET';
	route.name = route.name || `${route.method} ${(prefix + (route.path || '')) || '/'} ${route.note || ''}`;
	route.status = route.status || 200;

	describe(route.name, () => {
		let executedRoute;
		let beforeFunc;

		beforeAll(async function beforeRouteBlock() {
			if (beforeFunc) await beforeFunc.apply(this);
			const finalRoute = await applyModifiers(routeModifiers, route);

			return executeRoute(app(), finalRoute, prefix).then((result) => {
				executedRoute = result;
			});
		});

		if (route.describe) {
			const mochaIt = global.it;
			global.beforeRoute = (fn) => { beforeFunc = fn; };
			global.it = (name, callback) => {
				if (callback) {
					mochaIt(name, () => callback(executedRoute.response, executedRoute));
				} else {
					mochaIt(name);
				}
			};
			global.afterRoute = (callback) => {
				afterAll(() => {
					return callback(executedRoute.response, executedRoute);
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
			it(`returns ${route.status} with expected body`, () => {
				// If the response is {}, but the response text is not {}
				// then the server probably sent an error message in plain text
				// so compare against that so that the developer can see that message
				checkStatus(executedRoute.response, executedRoute.status);

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
	let objectArgs = false;

	// Server object should define timeout property
	if (args[0].listen || _.isFunction(args[0])) {
		server = args.shift();
	}

	if (args[0].routes) {
		([{ server }] = args);
		objectArgs = true;
	}

	if ((!server) && (!servers.length)) {
		throw new Error(`First call to describeApi must have server as the first argument (${args[0]} doesn't look like a server).`);
	}

	if (objectArgs) {
		return Object.assign({ block: args[1] }, args[0]);
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

async function applyModifiers(routeModifiers, route) {
	let finalRoute = route;

	for (let i = 0; i < routeModifiers.length; i++) {
		// eslint-disable-next-line no-await-in-loop
		const newRoute = await routeModifiers[i](finalRoute);
		finalRoute = newRoute || finalRoute;
	}

	return finalRoute;
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
		'body', '_body', 'path', '_expect', 'expect', 'headers', 'bearer',
	]);
	let { body } = dynamicProperties;
	const { path, bearer, headers } = dynamicProperties;

	body = body ? { data: body } : dynamicProperties._body || {};

	const expected = dynamicProperties.expect ?
		{ data: dynamicProperties.expect } :
		dynamicProperties._expect;

	if (expected) {
		// detect if it's a raw Sequelize object
		const isRaw = isRawSequalize(expected);
		if (isRaw) {
			throw new Error(`Value of expect is a Sequelize record. Aborting.
(Why? Sequelize records contain circular references, which a server will never return, so it will always fail to match and may hang your test).`);
		}
	}

	// Set up the route
	let req = request(server)[route.method.toLowerCase()]((prefix + (path || '')) || '/');

	if (bearer && !(headers.authorization)) {
		headers.authorization = `Bearer ${bearer}`;
	}

	if (process.env.TEST_BEARER) req = addHeaders(req, { Authorization: process.env.TEST_BEARER });
	req = addHeaders(req, dynamicProperties.headers);

	// add body if post/update
	if (route.method !== 'GET' && route.method !== 'DELETE') req.send(body);

	// run request
	const response = await req;

	const executedRoute = _.pick(route, ['method', 'status', 'after', 'before']);
	Object.assign(executedRoute, {
		body,
		path,
		response,
		headers,
		expect: expected,
		name: route.name,
	});

	return executedRoute;
}

function isRawSequalize(obj = {}) {
	if (!obj || !obj.data) return false; // it's some other type
	const item = Array.isArray(obj.data) ? obj.data[0] : obj.data;
	return (typeof item === 'object' && item.sequelize);
}

describeApi.autorun = autorun;
describeApi.setDefaultModifier = addDefaultModifier;

module.exports = describeApi;
