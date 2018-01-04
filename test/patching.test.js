const expect = require('chai').expect;

const beforeAll = global.beforeAll || global.before;

async function fn() {
	console.log('in fn');
}

const ourTest = [{ name: 'test' }];

describeTests(ourTest);

function describeTests(tests) {
	tests.forEach((test) => {
		describe(test.name, () => {
			beforeAll(async () => {
				console.log('before called');
				await fn();
				console.log('end of before');
			});

			it('was called', () => {
				expect(1).to.eq(1);
			});
		});
	});
}
