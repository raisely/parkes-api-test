'use strict';

const Koa = require('koa');
const KoaRouter = require('koa-router');
const bodyParser = require('koa-bodyparser');

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
	.get('/text-error', async (ctx, next) => {
		ctx.status = 400;
		ctx.body = 'Text error';
		await next();
	})
	.post('/reflect', async (ctx, next) => {
		ctx.body = ctx.request.body;
		await next();
	})
	.post('/reflect/body', async (ctx, next) => {
		ctx.body = ctx.request.body;
		await next();
	})
	.all('/reflect/headers', async (ctx, next) => {
		ctx.body = ctx.request.headers;
		await next();
	});

async function errorHandler(ctx, next) {
	try {
		await next();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(err);
	}
}

const app = new Koa();

app
	.use(errorHandler)
	.use(bodyParser())
	.use(api.middleware());

module.exports = app;
