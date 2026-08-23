/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `pnpm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `pnpm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import OpenAI from 'openai';

type Bindings = {
	OPEN_AI_KEY: string;
	AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
	'/*',
	cors({
		origin: '*', // Change to vercel prod
		allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type'],
		allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT'],
		exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
		maxAge: 600,
		credentials: true,
	}),
);

app.post('/chat-to-document', async (c) => {
	const openai = new OpenAI({
		apiKey: c.env.OPEN_AI_KEY,
	});

	const { documentData, question } = await c.req.json();

	const chatCompletion = await openai.chat.completions.create({
		messages: [
			{
				role: 'system',
				content:
					`
						You are an assistant helping a user to chat with a document, I am roviding a JSON file of the markdown for the document. Using this, answer the user's question
						in the clearest way possible. The document is about 					
					` + documentData,
			},
			{
				role: 'user',
				content: `My question is: ` + question,
			},
		],
		model: 'gpt-5-nano',
		temperature: 0.5,
	});

	const res = chatCompletion.choices[0].message.content;

	return c.json({
		message: res,
	});
});

app.post('/translate-document-summary', async (c) => {
	const { documentData, targetLanguage } = await c.req.json();

	/** Generate a summary */
	const summaryResponse = await c.env.AI.run('@cf/facebook/bart-large-cnn', {
		input_text: documentData,
		max_length: 1000,
	});

	/** Translate Summary to another language */
	const res = await c.env.AI.run('@cf/meta/m2m100-1.2b', {
		text: summaryResponse.summary,
		source_lang: 'english',
		target_lang: targetLanguage,
	});

	return new Response(JSON.stringify(res));
});

export default app;
