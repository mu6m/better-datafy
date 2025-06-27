import { inngest } from "./client";
import { InferenceClient } from "@huggingface/inference";

interface ScrapeResult
	extends Record<string, string | Record<string, string>> {}

interface ScrapeEvent {
	data: {
		links: string[];
		extractionPrompt: Record<string, string>;
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
		// Basic HTML stripping
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

async function extractInfoWithLLM(
	text: string,
	extractionPrompt: Record<string, string>
): Promise<ScrapeResult | null> {
	// Construct a dynamic prompt based on the extractionPrompt keys
	const promptParts: string[] = [];
	for (const key in extractionPrompt) {
		if (Object.prototype.hasOwnProperty.call(extractionPrompt, key)) {
			promptParts.push(`"${key}": "${extractionPrompt[key]}"`);
		}
	}

	const prompt = `Given the following text, extract the information as a JSON object. For each key, if the information is not found or not applicable, use "N/A" for string values. If a key from the 'Extraction structure' cannot be found, omit it from the JSON. DO NOT include any explanatory text, comments, or additional characters outside of the JSON object itself. The output MUST be a valid JSON object.

Text:
${text}

Extraction structure (use these keys exactly):
{
${promptParts.map((p) => `  ${p}`).join(",\n")}
}

JSON Output:`;

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
					max_tokens: 1_000_000,
					temperature: 0.1,
				}),
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API error: ${response.status}: ${errorText}`);
		}

		const data: LLMResponse = await response.json();
		let llmOutput = data.choices[0].message.content;

		const jsonMatch = llmOutput.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.error("No JSON object found in LLM output:", llmOutput);
			return null;
		}

		const jsonString = jsonMatch[0];

		try {
			const parsedOutput = JSON.parse(jsonString);
			return parsedOutput as ScrapeResult;
		} catch (jsonError) {
			console.error(
				"Failed to parse LLM output as JSON:",
				jsonString,
				"Error:",
				jsonError
			);
			return null;
		}
	} catch (error) {
		console.error("Error during LLM extraction:", error);
		return null;
	}
}

export const llmScraper = inngest.createFunction(
	{ id: "llm-scraper" },
	{ event: "ai/llm.scrape" },
	async ({ event, step }) => {
		const { links, extractionPrompt } = event.data;
		const scrapedResults: ScrapeResult[] = [];

		for (const link of links) {
			const content = await step.run(`fetch-content-${link}`, () =>
				fetchUrlContent(link)
			);

			if (
				content.startsWith("Failed to fetch") ||
				content.startsWith("Error fetching")
			) {
				console.warn(
					`Skipping extraction for ${link} due to content fetch error.`
				);
				continue;
			}

			const extractedInfo = await step.run(`extract-info-${link}`, () =>
				extractInfoWithLLM(content, extractionPrompt)
			);

			if (extractedInfo) {
				scrapedResults.push(extractedInfo);
			}
		}
		return { status: "finished", results: scrapedResults };
	}
);
