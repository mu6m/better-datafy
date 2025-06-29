import { generateAIData } from "./generate";
import { ragProcess, ragQuery } from "./analyze";
import { llmScraper } from "./scrape";
import { llmRSS } from "./rss";
import { saudiNewsSync } from "./stock";

export const functions = [
	generateAIData,
	ragProcess,
	ragQuery,
	llmScraper,
	llmRSS,
	saudiNewsSync,
];

export { inngest } from "./client";
