'use strict';

const Koa = require('koa');
const KoaRouter = require('koa-router');

const PORT = process.env.PORT || 3001;

const api = new KoaRouter();
api
	.all('/', async (ctx, next) => {
		ctx.body = { hello: 'world' };
		await next();
	})
	.get('/error', async (ctx, next) => {
		ctx.status = 400;
		ctx.body = { error: 'You left the iron on' };
		await next();
	})
	.post('/reflect/body', async (ctx, next) => {
		ctx.body = ctx.request.body;
		await next();
	})
	.post('/reflect/headers', async (ctx, next) => {
		ctx.body = ctx.request.headers;
		await next();
	});

const app = new Koa();

app.use(api.middleware());
const server = app.listen(PORT).on('error', (err) => {
	// eslint-disable-next-line no-console
	console.error(err);
});

module.exports = server;
