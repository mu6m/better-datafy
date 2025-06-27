import { inngest } from "./client";
import { Pinecone } from "@pinecone-database/pinecone";
import { InferenceClient } from "@huggingface/inference";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

interface ContentItem {
	type: "link" | "text";
	text: string;
}

interface RAGEvent {
	data: {
		sessionId: string;
		contentItems: ContentItem[];
		question?: string;
		mode: "upload" | "query";
	};
}

interface MistralResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

const pinecone = new Pinecone();
const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
const indexName = "datafy";

// --- Model Configuration ---
// Using a model with a larger dimension. Ensure this matches your index.
// You can find more models at https://huggingface.co/models?pipeline_tag=feature-extraction
const embeddingModel = "BAAI/bge-large-en-v1.5";
const embeddingDimension = 1024; // The dimension of the bge-large-en-v1.5 model

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
		return `Error fetching content from ${url} please note this when the user asks you anything about it`;
	}
}

async function initializeIndex() {
	const existingIndexes = await pinecone.listIndexes();
	if (!existingIndexes.indexes?.some((index) => index.name === indexName)) {
		await pinecone.createIndex({
			name: indexName,
			dimension: embeddingDimension, // *** FIX: Use the correct dimension for your chosen model ***
			metric: "cosine",
			spec: {
				serverless: {
					cloud: "aws",
					region: "us-east-1",
				},
			},
			waitUntilReady: true,
		});
	}
}

/**
 * NEW: A function to split large text into smaller chunks.
 * This is crucial for handling large documents and staying within model context limits.
 */
async function chunkText(text: string): Promise<string[]> {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1000, // The maximum size of each chunk
		chunkOverlap: 100, // The number of characters to overlap between chunks
	});

	const chunks = await splitter.splitText(text);
	return chunks;
}

async function uploadContent(sessionId: string, contentItems: ContentItem[]) {
	await initializeIndex();
	const index = pinecone.index(indexName).namespace(sessionId);
	const batchSize = 100; // Pinecone recommends upserting in batches of 100 or fewer

	for (const item of contentItems) {
		const content =
			item.type === "link" ? await fetchUrlContent(item.text) : item.text;

		// *** NEW: Chunk the content before embedding ***
		const contentChunks = await chunkText(content);

		const vectors = [];
		for (const [i, chunk] of contentChunks.entries()) {
			const embedding = await hf.featureExtraction({
				model: embeddingModel,
				inputs: chunk,
			});

			vectors.push({
				id: `content-${sessionId}-${Date.now()}-${i}`,
				values: embedding as number[],
				metadata: { content: chunk },
			});

			// Upsert in batches to avoid overwhelming the API
			if (vectors.length === batchSize) {
				await index.upsert(vectors);
				vectors.length = 0; // Clear the batch
			}
		}

		// Upsert any remaining vectors
		if (vectors.length > 0) {
			await index.upsert(vectors);
		}
	}
	return { success: true, count: contentItems.length };
}

async function queryContent(sessionId: string, question: string) {
	const index = pinecone.index(indexName).namespace(sessionId);

	const questionEmbedding = await hf.featureExtraction({
		model: embeddingModel, // *** FIX: Use the same model for querying ***
		inputs: question,
	});

	const queryResponse = await index.query({
		vector: questionEmbedding as number[],
		topK: 3,
		includeMetadata: true,
	});

	return queryResponse.matches
		.map((match) => (match.metadata?.content as string) || "")
		.filter(Boolean);
}

async function generateAnswer(question: string, contexts: string[]) {
	const contextText = contexts.join("\n\n---\n\n");
	const prompt = `Context:\n${contextText}\n\nQuestion: ${question}\n\nAnswer:`;

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
			}),
		}
	);

	if (!response.ok) {
		throw new Error(`API error: ${response.statusText}`);
	}

	const data: MistralResponse = await response.json();
	return data.choices[0].message.content;
}

export const ragSystem = inngest.createFunction(
	{ id: "rag-system-simplified" },
	{ event: "ai/rag.process" },
	async ({ event, step }) => {
		const { sessionId, contentItems, question, mode } = event.data;

		if (mode === "upload") {
			const result = await step.run("upload-content", () =>
				uploadContent(sessionId, contentItems)
			);
			return { status: "finished", ...result };
		}

		if (mode === "query") {
			if (!question) {
				throw new Error("A question is required for query mode.");
			}
			const contexts = await step.run("query-content", () =>
				queryContent(sessionId, question)
			);
			const answer = await step.run("generate-answer", () =>
				generateAnswer(question, contexts)
			);
			return { status: "finished", question, answer };
		}

		throw new Error(`Invalid mode: ${mode}`);
	}
);
