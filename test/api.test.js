'use strict';

/* eslint-disable object-curly-newline, object-property-newline */

const server = require('./testServer');

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

function assertResponse(res) {
	chaiExpect(res.req.path).to.equal('/');
}

function assertRoute(res, route) {
	chaiExpect(route.name).to.equal('GET / (assert receives resolved route)');
}

function simpleApi() {
	describe('api test', () => {
		describeApi(server, [
			{ path: '/' },
			{ method: 'DELETE', path: '/' },
			{ path: '/error', status: 400 },
			{ method: 'POST', path: '/reflect/body', name: '(in data)', body, expect: deepPartial },
			{ method: 'POST', path: '/reflect/body', name: '(raw)', _body: rootBody, _expect: { keywords } },
			{ method: 'GET', path: '/reflect/headers', headers, _expect: headers },
			{ name: '(assert receives response)', path: '/', assertResponse },
			{ name: '(assert receives resolved route)', path: '/', assertRoute },
		]);
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

		hookFn.afterApie = function afterAllHook() {
			hooks.afterAll = true;
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
				hookFn.beforeApi();
			});

			describeApi(server, [
				{ path: '/', name: 'before all routes', describe: () => {
					it('runs custom it', assertHook);
				} },
				{ path: '/', name: 'before this route', describe: () => {
					beforeRoute(hookFn.beforeRoute);
					it('runs custom it', assertHook);
				} },
				{ path: '/', name: 'after this route', describe: () => {
					afterRoute(hookFn.afterRoute);
					it('runs custom it', assertHook);
				} },
			]);
		});
	});
}

const path = '/reflect/body';
const params = { path, body, expect: { title }, headers };

function assertHeaders(res) {
	chaiExpect(res.headers).to.containSubset(headers);
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
		describeApi(server, [
			Object.assign({ name: '(wrapped)' }, commonParams, fnParams),
			Object.assign({ name: '(raw)' }, commonParams, rootPaths),
		]);
	});
}

function testNestedDescribeApi() {
	describe('api', () => {
		describeApi(server, '/reflect', [], () => {
			describe('WHEN nested', () => {
				describeApi([
					{ method: 'POST', path: '/body' },
				]);
			});
		});
	});
}

simpleApi();
testHooks();
testFunctionArguments('function arguments', false);
testFunctionArguments('async function arguments', true);
testNestedDescribeApi();
