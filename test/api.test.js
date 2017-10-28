'use strict';

const server = require('./testServer');

const chai = require('chai');
const chaiSubset = require('chai-subset');
const chaiSubsetJestDiff = require('chai-subset-jest-diff');

chai.use(chaiSubset);
chai.use(chaiSubsetJestDiff());
const chaiExpect = chai.expect;

const describeApi = require('../');

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
	expect(res.req.path).toEqual('/');
}

function assertRoute(res, route) {
	expect(route.name).toEqual('GET / (assert receives resolved route)');
}

function simpleApi() {
	describeApi('api test', server, [
		{ path: '/' },
		{ method: 'DELETE', path: '/' },
		{ path: '/error', status: 400 },
		{ method: 'POST', path: '/reflect/body', name: '(in data)', body, expect: deepPartial },
		{ method: 'POST', path: '/reflect/body', name: '(raw)', _body: rootBody, _expect: { keywords } },
		{ method: 'GET', path: '/reflect/headers', headers, _expect: headers },
		{ name: '(assert receives response)', path: '/', assertResponse },
		{ name: '(assert receives resolved route)', path: '/', assertRoute },
	]);
}
function hooks() {
	describe('hooks', () => {
		let hooks;

		const hookNames = ['beforeAll', 'before', 'after'];
		const hookFn = {};
		hookNames.forEach((hook) => {
			hookFn[hook] = () => {
				// Reset the hook so past tests don't confuse things
				hooks = {};
				hooks[hook] = true;
			};
		});

		hookFn.afterAll = function afterAll() {
			hooks.afterAll = true;
		};

		// Assert afterAll was called at the end of the suite
		afterAll(() => {
			expect(hooks).toMatchObject({ afterAll: true, after: true });
		});

		function assertHook(response, route) {
			const expected = {};
			expected[route.name] = true;
			expect(hooks).toMatchObject(expected);
		}

		describeApi(
			'api', server, [
				{ path: '/', _name: 'beforeAll', assert: assertHook },
				{ path: '/', _name: 'before', before: hookFn.before, assert: assertHook },
				{ path: '/', _name: 'after', after: hookFn.after },
			],
			// eslint-disable-next-line comma-dangle
			{ beforeAll: hookFn.beforeAll, afterAll: hookFn.afterAll }
		);
	});
}

const path = '/reflect/body';
const params = { path, body, expect: { title }, headers };

function assertHeaders(res) {
	chaiExpect(res.headers).to.containSubset(headers);
}

function testFunctionArguments(name, isAsync) {
	const fnParams = {};
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

	describeApi(name, server, [
		Object.assign({ method: 'POST', name: '(wrapped)', assertHeaders }, fnParams),
		Object.assign({ method: 'POST', name: '(raw)', assertHeaders }, rootPaths),
	]);
}

simpleApi();
hooks();
testFunctionArguments('function arguments', false);
testFunctionArguments('async function arguments', true);
