import { inngest } from "./client";
import { db } from "../db/db.server";
import { scrapes } from "../db/schema";
import { eq } from "drizzle-orm";
import { HfInference } from "@huggingface/inference";

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

interface ScrapeEvent {
	data: {
		scrapeId: string;
	};
}

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

async function extractInfoWithLLM(
	text: string,
	scrapeInstructions: string[]
): Promise<string[] | null> {
	const prompt = `Given the following text, extract the information based on these instructions and return ONLY an array of strings in JSON format. Each instruction should produce one string result. If information cannot be found, use "N/A".

Text:
${text}

Instructions:
${scrapeInstructions.map((inst, i) => `${i + 1}. ${inst}`).join("\n")}

Return format: ["result1", "result2", ...]

JSON Output:`;

	try {
		const response = await hf.chatCompletion({
			model: "meta-llama/Llama-3.1-8B-Instruct",
			messages: [{ role: "user", content: prompt }],
			max_tokens: 1000,
			temperature: 0.1,
			provider: "auto",
		});

		let llmOutput = response.choices[0].message.content;

		const jsonMatch = llmOutput.match(/\[[\s\S]*\]/);
		if (!jsonMatch) {
			console.error("No JSON array found in LLM output:", llmOutput);
			return null;
		}

		const jsonString = jsonMatch[0];

		try {
			const parsedOutput = JSON.parse(jsonString);
			if (Array.isArray(parsedOutput)) {
				return parsedOutput.map((item) => String(item));
			}
			return null;
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
		const { scrapeId } = event.data;

		try {
			const scrapeRecord = await step.run("fetch-scrape-record", async () => {
				const records = await db
					.select()
					.from(scrapes)
					.where(eq(scrapes.id, scrapeId));

				if (records.length === 0) {
					throw new Error(`Scrape record with ID ${scrapeId} not found`);
				}

				return records[0];
			});

			const { links, scrape: scrapeInstructions } = scrapeRecord.data as {
				links: string[];
				scrape: string[];
				data: string[][];
			};

			const scrapedResults: string[][] = [];

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
					scrapedResults.push(
						scrapeInstructions.map(() => "Error fetching content")
					);
					continue;
				}

				const extractedInfo = await step.run(`extract-info-${link}`, () =>
					extractInfoWithLLM(content, scrapeInstructions)
				);

				if (extractedInfo) {
					scrapedResults.push(extractedInfo);
				} else {
					scrapedResults.push(scrapeInstructions.map(() => "N/A"));
				}
			}

			await step.run("update-scrape-record", async () => {
				await db
					.update(scrapes)
					.set({
						status: "finished",
						data: {
							links,
							scrape: scrapeInstructions,
							data: scrapedResults,
						},
					})
					.where(eq(scrapes.id, scrapeId));
			});

			return { status: "finished", results: scrapedResults };
		} catch (error) {
			console.error("Error in scraper function:", error);

			await step.run("update-scrape-error", async () => {
				await db
					.update(scrapes)
					.set({
						status: "error",
					})
					.where(eq(scrapes.id, scrapeId));
			});

			throw error;
		}
	}
);
