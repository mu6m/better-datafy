import { inngest } from "./client";
import { HfInference } from "@huggingface/inference";
import { db } from "~/db/db.server";
import { rssFeed } from "~/db/schema";
import { eq } from "drizzle-orm";

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

async function fetchRssContent(url: string): Promise<string> {
	try {
		const fullUrl = url.startsWith("http") ? url : `https://${url}`;
		const response = await fetch(fullUrl);
		if (!response.ok) {
			return `Failed to fetch ${fullUrl}`;
		}
		const content = await response.text();

		// Basic RSS/XML parsing - extract text content
		return content
			.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
			.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
			.replace(/<[^>]*>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.substring(0, 8000); // Limit content for LLM processing
	} catch (error) {
		console.error(`Error fetching RSS content from ${url}:`, error);
		return `Error fetching content from ${url}`;
	}
}

async function summarizeWithLLM(text: string): Promise<string | null> {
	const prompt = `Summarize the following RSS feed content concisely.

RSS Content:
${text}

Summary:`;

	try {
		const response = await hf.chatCompletion({
			model: "meta-llama/Llama-3.1-8B-Instruct",
			messages: [{ role: "user", content: prompt }],
			max_tokens: 500,
			temperature: 0.1,
			provider: "auto",
		});

		return response.choices[0].message.content.trim();
	} catch (error) {
		console.error("Error during LLM summarization:", error);
		return null;
	}
}

export const llmRSS = inngest.createFunction(
	{
		id: "rss-summarizer",
		// Run every 30 minutes
		cron: "*/30 * * * *",
	},
	[
		{ event: "ai/llm.rss" }, // Manual trigger
		{ cron: "*/30 * * * *" }, // Automatic trigger every 30 minutes
	],
	async ({ event, step }) => {
		let rssFeedId: string;

		// If triggered manually, get the ID from event data
		if (event?.data?.rssFeedId) {
			rssFeedId = event.data.rssFeedId;
		} else {
			// If triggered by cron, get all running RSS feeds
			const runningFeeds = await step.run("fetch-running-feeds", async () => {
				return await db
					.select()
					.from(rssFeed)
					.where(eq(rssFeed.status, "running"));
			});

			// Process each running feed
			for (const feed of runningFeeds) {
				await processRssFeed(feed.id, step);
			}
			return { status: "completed", processed: runningFeeds.length };
		}

		// Process single RSS feed
		return await processRssFeed(rssFeedId, step);
	}
);

async function processRssFeed(rssFeedId: string, step: any) {
	// Get RSS feed data from database
	const feedData = await step.run(`fetch-feed-${rssFeedId}`, async () => {
		const feeds = await db
			.select()
			.from(rssFeed)
			.where(eq(rssFeed.id, rssFeedId));

		if (feeds.length === 0) {
			throw new Error(`RSS feed with ID ${rssFeedId} not found`);
		}

		return feeds[0];
	});

	// Update status to running
	await step.run(`update-status-running-${rssFeedId}`, async () => {
		await db
			.update(rssFeed)
			.set({
				status: "running",
				updatedAt: new Date(),
			})
			.where(eq(rssFeed.id, rssFeedId));
	});

	try {
		// Fetch RSS content
		const content = await step.run(`fetch-content-${rssFeedId}`, () =>
			fetchRssContent(feedData.link!)
		);

		if (
			content.startsWith("Failed to fetch") ||
			content.startsWith("Error fetching")
		) {
			// Update status to error
			await step.run(`update-status-error-${rssFeedId}`, async () => {
				await db
					.update(rssFeed)
					.set({
						status: "error",
						updatedAt: new Date(),
					})
					.where(eq(rssFeed.id, rssFeedId));
			});

			return { status: "error", message: content };
		}

		// Generate summary
		const summary = await step.run(`summarize-content-${rssFeedId}`, () =>
			summarizeWithLLM(content)
		);

		if (!summary) {
			// Update status to error if summarization failed
			await step.run(`update-status-error-${rssFeedId}`, async () => {
				await db
					.update(rssFeed)
					.set({
						status: "error",
						updatedAt: new Date(),
					})
					.where(eq(rssFeed.id, rssFeedId));
			});

			return { status: "error", message: "Failed to generate summary" };
		}

		// Update RSS feed with summary and finished status
		await step.run(`update-feed-finished-${rssFeedId}`, async () => {
			await db
				.update(rssFeed)
				.set({
					summray: summary,
					status: "finished",
					updatedAt: new Date(),
				})
				.where(eq(rssFeed.id, rssFeedId));
		});

		return { status: "finished", summary };
	} catch (error) {
		console.error(`Error processing RSS feed ${rssFeedId}:`, error);

		// Update status to error
		await step.run(`update-status-error-${rssFeedId}`, async () => {
			await db
				.update(rssFeed)
				.set({
					status: "error",
					updatedAt: new Date(),
				})
				.where(eq(rssFeed.id, rssFeedId));
		});

		return { status: "error", message: String(error) };
	}
}
