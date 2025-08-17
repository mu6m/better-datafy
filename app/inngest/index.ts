import { generateAIData } from "./generate";
import { ragProcess, ragQuery } from "./analyze";
import { llmScraper } from "./scrape";
import { llmRSS } from "./rss";

export const functions = [
	generateAIData,
	ragProcess,
	ragQuery,
	llmScraper,
	llmRSS,
];

export { inngest } from "./client";
