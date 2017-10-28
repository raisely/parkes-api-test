const _ = require('lodash');
const request = require('supertest');

const chai = require('chai');
const chaiSubset = require('chai-subset');
const chaiSubsetJestDiff = require('chai-subset-jest-diff');

chai.use(chaiSubset);
chai.use(chaiSubsetJestDiff());
const chaiExpect = chai.expect;

function describeApi(title, server, routes, options = {}) {
	describe(title, () => {
		afterEach(() => {
			server.close();
		});

		beforeAll(async () => {
			executeIfFunction(options.beforeAll);
		});

		afterAll(async () => {
			executeIfFunction(options.afterAll);
		});

		routes.forEach((route) => {
			route.method = route.method || 'GET';
			route.name = route._name || `${route.method} ${route.path} ${route.name || ''}`;
			route.status = route.status || 200;

			describe(route.name, () => {
				beforeEach(async () => {
					await executeIfFunction(route.before);
				});

				if (route.assert) {
					it('custom assert', async () => {
						const executedRoute = await executeRoute(route.name, route, server);

						await route.assert(executedRoute.response, executedRoute);

						if (route.after) {
							await route.after(executedRoute.response, executedRoute);
						}
					});
				}

				it(`returns ${route.status} with expected body`, async () => {
					const executedRoute = await executeRoute(route.name, route, server);

					// If an expected result is provided, check that
					// the body contains those keys
					if (executedRoute.expect) {
						if (typeof expected === 'string') {
							chaiExpect(executedRoute.response.text).to.eq(executedRoute.expect);
						} else {
							chaiExpect(executedRoute.response.body).to.containSubset(executedRoute.expect);
						}
					}

					if (route.after) {
						await route.after(executedRoute.response, executedRoute);
					}
				});
			});
		});
	});
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

async function executeRoute(name, route, server) {
	// Get the results from any function parameters
	const dynamicProperties = await executeProperties(route, [
		'body', '_body', 'path', '_expect', 'expect', 'headers',
	]);
	let { body } = dynamicProperties;
	const { path } = dynamicProperties;

	body = body ? { data: body } : dynamicProperties._body || {};

	// Set up the route
	let req = request(server)[route.method.toLowerCase()](path);

	req = addHeaders(req, dynamicProperties.headers);

	// add body if post/update
	if (route.method !== 'GET' && route.method !== 'DELETE') req.send(body);

	// run request
	const response = await req;

	checkStatus(response, route.status);

	const expected = dynamicProperties.expect ?
		{ data: dynamicProperties.expect } :
		dynamicProperties._expect;

	const executedRoute = _.pick(route, ['method', 'status', 'after', 'before']);
	Object.assign(executedRoute, {
		body,
		name,
		path,
		response,
		headers: dynamicProperties.headers,
		expect: expected,
	});

	return executedRoute;
}

module.exports = describeApi;
