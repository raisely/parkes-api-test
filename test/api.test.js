'use strict';

/* eslint-disable object-curly-newline, object-property-newline */
/* globals beforeRoute, afterRoute */

const app = require('./testServer');

const chai = require('chai');
const chaiSubset = require('chai-subset');
const chaiSubsetJestDiff = require('chai-subset-jest-diff');

chai.use(chaiSubset);
chai.use(chaiSubsetJestDiff());
const chaiExpect = chai.expect;

const describeApi = require('../');

// Support jest or mocha
const afterAll = global.afterAll || global.after;
const beforeAll = global.beforeAll || global.before;

const title = 'Speaking of Earth';
const body = {
	title,
	authors: [
		{ name: 'Rachel Carson' },
		{ name: 'Ken Saro-Wiwa' },
	],
};

const keywords = ['environment', 'speaking'];
const rootBody = {
	keywords,
	books: body,
};

const deepPartial = {
	authors: [{ name: 'Ken Saro-Wiwa' }],
};

const headers = {
	client: 'Parkes Test',
};

const getServer = describeApi.autorun(app);

function assertResponse(res) {
	chaiExpect(res.req.path).to.equal('/');
}

function assertRoute(res, route) {
	chaiExpect(route.name).to.equal('GET / (assert receives resolved route)');
}

function simpleApi() {
	describe('api test', () => {
		describeApi({ server: getServer, routes: [
			{ path: '/' },
			{ method: 'DELETE' },
			{ path: '/error', status: 400 },
			{ method: 'POST', path: '/reflect/body', name: '(in data)', body, expect: deepPartial },
			{ method: 'POST', path: '/reflect/body', name: '(raw)', _body: rootBody, _expect: { keywords } },
			{ method: 'GET', path: '/reflect/headers', headers, _expect: headers },
			{ note: '(assert receives response)', path: '/', describe: () => {
				it('passes response to "it"', assertResponse);
			} },
			{ note: '(assert receives resolved route)', path: '/', describe: () => {
				it('passes route to "it"', assertRoute);
			} },
			{ path: '/text-error', status: 400, _expect: 'Text error' },
		] });
	});
}

function testHooks() {
	describe('hooks', () => {
		let hooks;

		const hookNames = ['beforeApi', 'beforeRoute', 'afterRoute'];
		const hookFn = {};
		hookNames.forEach((hook) => {
			hookFn[hook] = () => {
				// Reset the hook so past tests don't confuse things
				hooks = {};
				hooks[hook] = true;
			};
		});

		hookFn.afterApi = function afterAllHook() {
			hooks.afterApi = true;
		};

		// Assert afterAll was called at the end of the suite
		afterAll(() => {
			chaiExpect(hooks).to.containSubset({ afterApi: true, afterRoute: true });
		});

		function assertHook(response, route) {
			const expected = {};
			expected[route.name] = true;
			chaiExpect(hooks).to.containSubset(expected);
		}

		describe('api context', () => {
			beforeAll(() => {
				hookFn.beforeApi();
			});
			afterAll(() => {
				hookFn.afterApi();
			});

			describeApi({ server: getServer, routes: [
				{ path: '/', name: 'beforeApi', describe: () => {
					it('runs custom it', assertHook);
				} },
				{ path: '/', name: 'beforeRoute', describe: () => {
					beforeRoute(hookFn.beforeRoute);
					it('runs before route', assertHook);
				} },
				{ path: '/', name: 'afterRoute', describe: () => {
					afterRoute(hookFn.afterRoute);
				} },
			] });
		});
	});
}

const path = '/reflect/body';
const params = { path, body, expect: { title }, headers };

function assertHeaders(res) {
	// eslint-disable-next-line no-underscore-dangle
	chaiExpect(res.req._headers).to.containSubset(headers);
}

function testFunctionArguments(name, isAsync) {
	const fnParams = {};
	// Wrap dynamic parameters in a function
	// so we can see if it's executed
	Object.keys(params).forEach((param) => {
		fnParams[param] = isAsync ?
			async () => params[param] :
			() => params[param];
	});

	const rootPaths = {
		headers: fnParams.headers,
		path: fnParams.path,
		_body: fnParams.body,
		_expect: fnParams.expect,
	};

	const commonParams = {
		method: 'POST',
		describe: () => {
			it('resolves header', assertHeaders);
		},
	};

	describe(name, () => {
		describeApi(getServer, [
			Object.assign({ name: '(wrapped)' }, commonParams, fnParams),
			Object.assign({ name: '(raw)' }, commonParams, rootPaths),
		]);
	});
}

function testNestedDescribeApi() {
	describe('api', () => {
		describeApi(getServer, '/reflect', [], () => {
			describe('WHEN nested', () => {
				describeApi([
					{ method: 'POST', path: '/body' },
					{ method: 'POST' },
				]);
			});
		});
	});
}

function testModifiers() {
	describe('route modifiers', () => {
		const setUser = route => Object.assign({
			bearer: route.user,
		}, route);

		describeApi({ server: getServer, routeModifier: setUser, routes: [
			{
				method: 'GET', path: '/reflect/headers', user: 'bob', headers, _expect: {
					client: 'Parkes Test',
					authorization: 'Bearer bob',
				},
			},
		] });
	});
}

simpleApi();
testHooks();
testFunctionArguments('function arguments', false);
testFunctionArguments('async function arguments', true);
testNestedDescribeApi();
testModifiers();
