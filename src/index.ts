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

	if (!documentData || !question) {
		return c.json({ message: 'Missing documentData or question.' }, 400);
	}

	try {
		const chatCompletion = await openai.chat.completions.create({
			model: 'gpt-5-nano',
			// No `temperature`: gpt-5 models reject any value other than the
			// default of 1 with a 400.
			messages: [
				{
					role: 'system',
					content: [
						'You are an assistant helping a user chat with a document.',
						'The document is provided below as markdown.',
						"Answer the user's question as clearly as possible using only that document.",
						'If the answer is not in the document, say so rather than guessing.',
						'',
						'--- DOCUMENT ---',
						documentData,
					].join('\n'),
				},
				{
					role: 'user',
					content: `My question is: ${question}`,
				},
			],
		});

		const message = chatCompletion.choices[0]?.message?.content?.trim();

		// content is typed `string | null`, and reasoning models can burn their
		// whole budget on internal reasoning and return nothing.
		if (!message) {
			return c.json({
				message: 'The model did not return an answer. Try rephrasing your question.',
			});
		}

		return c.json({ message });
	} catch (error) {
		console.error('chat-to-document failed:', error);

		return c.json({ message: error instanceof Error ? error.message : 'Unknown error calling OpenAI.' }, 500);
	}
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
