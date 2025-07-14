import { inngest } from "./client";
import { Pinecone } from "@pinecone-database/pinecone";
import { HfInference } from "@huggingface/inference";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { db } from "~/db/db.server";
import { analysis } from "~/db/schema";
import { eq } from "drizzle-orm";

interface ContentItem {
	type: "link" | "text";
	text: string;
}

const pinecone = new Pinecone();
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const indexName = "datafy";

const embeddingModel = "BAAI/bge-large-en-v1.5";
const embeddingDimension = 1024;

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
			dimension: embeddingDimension,
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

async function chunkText(text: string): Promise<string[]> {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1000,
		chunkOverlap: 100,
	});

	const chunks = await splitter.splitText(text);
	return chunks;
}

async function uploadContent(analysisId: string, textSources: string[]) {
	await initializeIndex();
	const index = pinecone.index(indexName).namespace(analysisId);
	const batchSize = 100;

	for (let [sourceIndex, textContent] of textSources.entries()) {
		if (
			textContent.startsWith("http://") ||
			textContent.startsWith("https://")
		) {
			textContent = await fetchUrlContent(textContent);
		}
		const contentChunks = await chunkText(textContent);

		const vectors = [];
		for (const [i, chunk] of contentChunks.entries()) {
			const embedding = await hf.featureExtraction({
				model: embeddingModel,
				inputs: chunk,
			});

			vectors.push({
				id: `content-${analysisId}-source${sourceIndex}-${Date.now()}-${i}`,
				values: embedding as number[],
				metadata: { content: chunk, sourceIndex },
			});

			if (vectors.length === batchSize) {
				await index.upsert(vectors);
				vectors.length = 0;
			}
		}

		if (vectors.length > 0) {
			await index.upsert(vectors);
		}
	}
	return { success: true, count: textSources.length };
}

async function queryContent(analysisId: string, question: string) {
	const index = pinecone.index(indexName).namespace(analysisId);

	const questionEmbedding = await hf.featureExtraction({
		model: embeddingModel,
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

	try {
		const response = await hf.chatCompletion({
			model: "meta-llama/Llama-3.1-8B-Instruct",
			messages: [{ role: "user", content: prompt }],
			max_tokens: 500,
			temperature: 0.7,
			provider: "auto",
		});

		return response.choices[0].message.content;
	} catch (error) {
		throw new Error(
			`AI generation failed: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}

export const ragProcess = inngest.createFunction(
	{ id: "rag-process" },
	{ event: "ai/rag.process" },
	async ({ event, step }) => {
		const { analysisId } = event.data;

		try {
			await step.run("update-status-running", async () => {
				await db
					.update(analysis)
					.set({ status: "running" })
					.where(eq(analysis.id, analysisId));
			});

			const analysisData = await step.run("fetch-analysis", async () => {
				const result = await db
					.select()
					.from(analysis)
					.where(eq(analysis.id, analysisId))
					.limit(1);

				if (result.length === 0) {
					throw new Error("Analysis not found");
				}

				return result[0];
			});

			const textSources = analysisData.data?.data || [];

			await step.run("upload-content", () =>
				uploadContent(analysisId, textSources)
			);

			await step.run("update-status-finished", async () => {
				await db
					.update(analysis)
					.set({ status: "finished" })
					.where(eq(analysis.id, analysisId));
			});

			return { status: "finished", analysisId };
		} catch (error) {
			await step.run("update-status-error", async () => {
				await db
					.update(analysis)
					.set({ status: "error" })
					.where(eq(analysis.id, analysisId));
			});

			throw error;
		}
	}
);

export const ragQuery = inngest.createFunction(
	{ id: "rag-query" },
	{ event: "ai/rag.query" },
	async ({ event, step }) => {
		const { analysisId, question } = event.data;

		const contexts = await step.run("query-content", () =>
			queryContent(analysisId, question)
		);

		const answer = await step.run("generate-answer", () =>
			generateAnswer(question, contexts)
		);

		await db
			.update(analysis)
			.set({ answer })
			.where(eq(analysis.id, analysisId));

		return { status: "finished", question, answer };
	}
);
