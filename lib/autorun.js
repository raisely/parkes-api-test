'use strict';

const afterAll = global.after || global.afterAll;

function autorun(app) {
	let server;

	afterAll(() => {
		if (server) {
			server.close();
			server = null;
		}
	});

	return getServer;

	function getServer() {
		if (!server) {
			server = app.listen();
		}

		return server;
	}
}

module.exports = autorun;
