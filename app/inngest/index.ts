import { generateAIData } from "./generate";
import { ragSystem } from "./analyze";
import { llmScraper } from "./scrape";
import { llmRSS } from "./rss";
import { saudiNewsSync } from "./stock";

export const functions = [
	generateAIData,
	ragSystem,
	llmScraper,
	llmRSS,
	saudiNewsSync,
];

export { inngest } from "./client";
