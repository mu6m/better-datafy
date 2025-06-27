import { generateAIData } from "./generate";
import { ragSystem } from "./analyze";
import { llmScraper } from "./scrape";
import { llmRSS } from "./rss";

export const functions = [generateAIData, ragSystem, llmScraper, llmRSS];

export { inngest } from "./client";
