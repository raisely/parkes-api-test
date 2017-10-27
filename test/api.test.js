'use strict';

const server = require('./testServer');

const describeApi = require('../');

const title = { title: 'Speaking of Earth' };
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
	authors: { name: 'Ken Saro-Wiwa' },
};

const headers = {
	Client: 'Parkes Test',
};

function assert(res) {
	expect(res.path).toEqual('/');
}

function simpleApi() {
	describeApi('api test', server, [
		{ path: '/' },
		{ method: 'DELETE', path: '/' },
		{ path: '/error', status: 400 },
		{ method: 'POST', path: '/reflect/body', body, expect: deepPartial },
		{ method: 'POST', path: '/reflect/body', _body: rootBody, _expect: { keywords } },
		{ method: 'GET', path: '/reflect/headers', headers, expect: headers },
		{ path: '/', assert },
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
			expect(hooks).toMatchObject({ afterAll: true });
		});

		function assertHook(response, route) {
			const expected = {};
			expected[route._name] = true;
			expect(hooks).toMatchObject(expected);
		}

		describeApi(
			'api', server, [
				{ path: '/', _name: 'beforeAll', assert: assertHook },
				{ path: '/', _name: 'before', before: hookFn.before, assert: assertHook },
				{ path: '/', _name: 'after', after: hookFn.after, assert: assertHook },
			],
			// eslint-disable-next-line comma-dangle
			{ beforeAll: hookFn.beforeAll, afterAll: hookFn.afterAll }
		);
	});
}

const path = '/reflect/body';
const params = { path, body, expect: title };

function functionArguments() {
	const fnParams = {};
	Object.keys(params).forEach((param) => {
		fnParams[param] = () => param;
	});

	const rootPaths = {
		path: fnParams.path,
		_body: fnParams.body,
		_expect: fnParams.expect,
	};

	describeApi('function arguments', server, [
		Object.assign({ method: 'POST' }, fnParams),
		Object.assign({ method: 'POST' }, rootPaths),
	]);
}

function asyncFunctionArguments() {
	const fnParams = {};
	Object.keys(params).forEach((param) => {
		fnParams[param] = async () => param;
	});

	const rootPaths = {
		path: fnParams.path,
		_body: fnParams.body,
		_expect: fnParams.expect,
	};

	describeApi('async function arguments', server, [
		Object.assign({ method: 'POST' }, fnParams),
		Object.assign({ method: 'POST' }, rootPaths),
	]);
}

simpleApi();
hooks();
functionArguments();
asyncFunctionArguments();
