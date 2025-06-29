import { inngest } from "./client";
import { Pinecone } from "@pinecone-database/pinecone";

interface ApiResponse {
	announcementList: any[];
}

interface NewsItem {
	PRESS_REL_ID: number;
	TITLE: string;
	SHORT_DESC: string;
	PR_DATE: string;
	timestamp: string;
	announcementUrl: string;
}

// Initialize Pinecone
const pinecone = new Pinecone({
	apiKey: process.env.PINECONE_API_KEY!,
});

const index = pinecone.index("stock");

async function scrapeSaudiExchangeNews(): Promise<any[]> {
	const cookies = {
		"com.ibm.wps.state.preprocessors.locale.LanguageCookie": "ar",
		"BIGipServerSaudiExchange.sa.app~SaudiExchange.sa_pool":
			"2600407468.20480.0000",
		JSESSIONID:
			"!a8ZGEfnp40rK+svHYTs5PW+MzmvOZ5iu/IDO7G1BvPJ6EVNI9LLsJNgyJiaYLRv1CSQD1R3b16JlyF+4925zqtrYSbf00gDcyGQ0",
		TS01fdeb15:
			"0102d17fad9f4f475bca1a8723573ffff7a342382fae2450711362f2b42194068151cc2b2a64ddeba81b9af75f78848100c2da79559181da5e18e35631200d37c18a9113d3e4dc7dd490d3364421902e0a4275f25f350ecfe7936981dc4c3d237281898f63",
	};

	const headers = {
		accept: "*/*",
		"accept-language": "en-US,en;q=0.9,ar;q=0.8,fr;q=0.7",
		"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
		origin: "https://www.saudiexchange.sa",
		priority: "u=1, i",
		referer:
			"https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements/issuer-announcements-details/!ut/p/z1/lZDNDoIwEISfxSfoWOxSj1VjqQEB-RF7MT0ZjKIxxueXeBOV4Nw2-SYzs8yyitnGPeqDu9eXxp3ae2dpLxSBBxIxgnwOQqapyOV4YTy2fQdkpAnpWqUx9wV0CWb_8iNLBNJlEnkhNtCgYX78kBqQb3sRTl0gVlO_rbiaaRMqT5LfBb78oBPxOfIF9KzI3I1dz0VRoTbHiRo9AWCpL4U!/?uri=nm%3Aoid%3AZ6_5A602H80OOA970QFJBGILA3867&page=1",
		"sec-ch-ua":
			'"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
		"sec-ch-ua-mobile": "?0",
		"sec-ch-ua-platform": '"Windows"',
		"sec-fetch-dest": "empty",
		"sec-fetch-mode": "cors",
		"sec-fetch-site": "same-origin",
		"user-agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
		"x-requested-with": "XMLHttpRequest",
	};

	const data = new URLSearchParams({
		annoucmentType: "1_-1",
		symbol: "",
		sectorDpId: "",
		searchType: "",
		fromDate: "01/01/1900",
		toDate: "01/01/2100",
		datePeriod: "",
		productType: "",
		advisorsList: "",
		textSearch: "",
		pageNumberDb: "1",
		pageSize: "100", // Reduced from 1000000 to avoid large responses
	});

	// Convert cookies to cookie string
	const cookieString = Object.entries(cookies)
		.map(([key, value]) => `${key}=${value}`)
		.join("; ");

	try {
		const response = await fetch(
			"https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/!ut/p/z1/jc_LDoIwEAXQb-ELei12qMuqsWBAQB5iN6YrU6NojPH7Je6A-JjdJOfO5DLDGmZa-3RH-3DX1p67fW_oIBSBhxJpqmYB8tV6rqNY-ZICtusDFJnoQJb4MbbQIGb-yePDKPzOmz5BWC5AKDRVpZwsOQ3B-MYAyEQT8o3KUx4I6BqjF-OSb_ClRWHv7HapGrjoNFWe9wLe2EEE/p0/IZ7_5A602H80O0TRC068TFQ7NN00C3=CZ6_5A602H80OOA970QFJBGILA3867=NJgetNewsListData=/",
			{
				method: "POST",
				headers: {
					...headers,
					cookie: cookieString,
				},
				body: data,
			}
		);

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result: ApiResponse = await response.json();
		console.log(`Scraped ${result.announcementList.length} announcements`);
		return result.announcementList;
	} catch (error) {
		console.error("Error scraping Saudi Exchange news:", error);
		throw error;
	}
}

// Function to check if item exists in Pinecone
async function checkItemExists(pressRelId: number): Promise<boolean> {
	try {
		const queryResponse = await index.query({
			id: pressRelId.toString(),
			topK: 1,
			includeMetadata: false,
		});

		return queryResponse.matches.length > 0;
	} catch (error) {
		console.error(`Error checking if item ${pressRelId} exists:`, error);
		return false;
	}
}

// Function to add items to Pinecone
async function addItemToPinecone(item: NewsItem): Promise<void> {
	try {
		// Combine relevant text for embedding
		const textToEmbed = `${item.TITLE} ${item.SHORT_DESC}`;

		// Generate embedding
		const embedding = await generateEmbedding(textToEmbed);

		// Prepare metadata
		const metadata = {
			title: item.TITLE,
			shortDesc: item.SHORT_DESC,
			prDate: item.PR_DATE,
			timestamp: item.timestamp,
			announcementUrl: item.announcementUrl,
		};

		// Upsert to Pinecone
		await index.upsert([
			{
				id: item.PRESS_REL_ID.toString(),
				values: embedding,
				metadata,
			},
		]);

		console.log(`Added item ${item.PRESS_REL_ID} to Pinecone`);
	} catch (error) {
		console.error(`Error adding item ${item.PRESS_REL_ID} to Pinecone:`, error);
		throw error;
	}
}

// Process items in batches
async function processItemsBatch(items: any[], batchSize: number = 10) {
	let addedCount = 0;
	let skippedCount = 0;
	const errors: string[] = [];

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);

		for (const item of batch) {
			try {
				// Check if item already exists
				const exists = await checkItemExists(item.announcementUrl);

				if (!exists) {
					await addItemToPinecone(item);
					addedCount++;
				} else {
					console.log(`Item ${item.announcementUrl} already exists, skipping`);
					skippedCount++;
				}
			} catch (error) {
				const errorMsg = `Failed to process item ${item.announcementUrl}: ${error}`;
				console.error(errorMsg);
				errors.push(errorMsg);
			}
		}

		// Small delay between batches to avoid rate limits
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	return {
		addedCount,
		skippedCount,
		errors,
	};
}

// Main Inngest cron job function
export const saudiNewsSync = inngest.createFunction(
	{
		id: "saudi-news-sync",
		retries: 3,
	},
	{ cron: "0 9 * * *" }, // Runs daily at 9 AM UTC
	async ({ event, step }) => {
		// Step 1: Scrape and process in one step to avoid large step outputs
		const results = await step.run("scrape-and-process-news", async () => {
			// Scrape the news data
			const newsItems = await scrapeSaudiExchangeNews();

			// Process items immediately without storing large arrays in step output
			const processResults = await processItemsBatch(newsItems);

			return {
				totalItems: newsItems.length,
				...processResults,
			};
		});

		console.log("Saudi News Sync completed:", results);

		return {
			success: true,
			message: `Processed ${results.totalItems} items. Added: ${results.addedCount}, Skipped: ${results.skippedCount}, Errors: ${results.errors.length}`,
			details: results,
		};
	}
);
