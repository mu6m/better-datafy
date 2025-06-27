import { inngest } from "./client";
import { InferenceClient } from "@huggingface/inference";

interface ScrapeResult
	extends Record<string, string | Record<string, string>> {}

interface ScrapeEvent {
	data: {
		links: string[];
	};
}

interface LLMResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);

async function fetchUrlContent(url: string): Promise<string> {
	try {
		const fullUrl = url.startsWith("http") ? url : `https://${url}`;
		const response = await fetch(fullUrl);
		if (!response.ok) {
			return `Failed to fetch ${fullUrl}`;
		}
		const html = await response.text();
		return html
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	} catch (error) {
		console.error(`Error fetching content from ${url}:`, error);
		return `Error fetching content from ${url}`;
	}
}

async function summarizeWithLLM(text: string): Promise<string | null> {
	const prompt = `Summarize the following text concisely. DO NOT include any explanatory text, comments, or additional characters outside of the summary itself.

Text:
${text}

Summary:`;

	try {
		const response = await fetch(
			"https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messages: [{ role: "user", content: prompt }],
					max_tokens: 500,
					temperature: 0.1,
				}),
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API error: ${response.status}: ${errorText}`);
		}

		const data: LLMResponse = await response.json();
		return data.choices[0].message.content.trim();
	} catch (error) {
		console.error("Error during LLM summarization:", error);
		return null;
	}
}

export const llmRSS = inngest.createFunction(
	{ id: "rss-summarizer" },
	{ event: "ai/llm.rss" },
	async ({ event, step }) => {
		const { links } = event.data;
		const summaries: string[] = [];

		for (const link of links) {
			const content = await step.run(`fetch-content-${link}`, () =>
				fetchUrlContent(link)
			);

			if (
				content.startsWith("Failed to fetch") ||
				content.startsWith("Error fetching")
			) {
				console.warn(
					`Skipping summarization for ${link} due to content fetch error.`
				);
				continue;
			}

			const summary = await step.run(`summarize-content-${link}`, () =>
				summarizeWithLLM(content)
			);

			if (summary) {
				summaries.push(summary);
			}
		}
		return { status: "finished", summaries };
	}
);
