import { inngest } from "./client";
import { Pinecone } from "@pinecone-database/pinecone";
import { HfInference } from "@huggingface/inference";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { db } from "~/db/db.server";
import { analysis } from "~/db/schema";
import { eq } from "drizzle-orm";

const pinecone = new Pinecone();
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

const PINECONE_INDEX = "datafy";
const EMBEDDING_MODEL = "BAAI/bge-large-en-v1.5";

async function fetchUrlContent(url: string): Promise<string> {
	try {
		const response = await fetch(
			url.startsWith("http") ? url : `https://${url}`
		);
		if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
		const html = await response.text();
		return html
			.replace(
				/<style[^>]*>[\s\S]*?<\/style>|<script[^>]*>[\s\S]*?<\/script>|<[^>]*>/gi,
				" "
			)
			.replace(/\s+/g, " ")
			.trim();
	} catch (error) {
		console.error(`Error fetching ${url}:`, error);
		return `Failed to fetch content from ${url}.`;
	}
}

async function prepareAndEmbedContent(analysisId: string, sources: string[]) {
	const index = pinecone.index(PINECONE_INDEX).namespace(analysisId);
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1000,
		chunkOverlap: 100,
	});

	const resolvedSources = await Promise.all(
		sources.map((src) => (src.startsWith("http") ? fetchUrlContent(src) : src))
	);

	const allChunks = (
		await Promise.all(
			resolvedSources.map((text, sourceIndex) =>
				splitter
					.splitText(text)
					.then((chunks) => chunks.map((content) => ({ content, sourceIndex })))
			)
		)
	).flat();

	if (allChunks.length === 0) return;

	const embeddings = (await hf.featureExtraction({
		model: EMBEDDING_MODEL,
		inputs: allChunks.map((chunk) => chunk.content),
	})) as number[][];

	const vectors = allChunks.map(({ content, sourceIndex }, i) => ({
		id: `chunk-${sourceIndex}-${i}`,
		values: embeddings[i],
		metadata: { content, sourceIndex },
	}));

	for (let i = 0; i < vectors.length; i += 100) {
		await index.upsert(vectors.slice(i, i + 100));
	}
}

async function queryEmbeddings(
	analysisId: string,
	question: string
): Promise<string[]> {
	const index = pinecone.index(PINECONE_INDEX).namespace(analysisId);
	const questionEmbedding = await hf.featureExtraction({
		model: EMBEDDING_MODEL,
		inputs: question,
	});

	const { matches } = await index.query({
		vector: questionEmbedding as number[],
		topK: 3,
		includeMetadata: true,
	});

	return matches
		.map((match) => (match.metadata?.content as string) || "")
		.filter(Boolean);
}

async function generateAnswer(
	question: string,
	contexts: string[]
): Promise<string> {
	const prompt = `Using the following context, answer the question.\n\nContext:\n${contexts.join(
		"\n---\n"
	)}\n\nQuestion: ${question}\n\nAnswer:`;

	const response = await hf.chatCompletion({
		model: "meta-llama/Llama-3.1-8B-Instruct",

		messages: [{ role: "user", content: prompt }],

		max_tokens: 500,
	});

	return response.choices[0].message.content;
}

export const ragProcess = inngest.createFunction(
	{ id: "rag-process" },
	{ event: "ai/rag.process" },
	async ({ event, step }) => {
		const { analysisId } = event.data;
		const setStatus = (status: "running" | "finished" | "error") =>
			db.update(analysis).set({ status }).where(eq(analysis.id, analysisId));

		try {
			await step.run("set-status-running", () => setStatus("running"));
			const record = await step.run("fetch-analysis-record", async () => {
				const [data] = await db
					.select()
					.from(analysis)
					.where(eq(analysis.id, analysisId));
				if (!data) throw new Error(`Analysis record ${analysisId} not found.`);
				return data;
			});

			const sources = (record.data?.data as string[]) || [];
			if (sources.length === 0)
				throw new Error("No text sources found to process.");

			await step.run("prepare-and-embed-content", () =>
				prepareAndEmbedContent(analysisId, sources)
			);
			await step.run("set-status-finished", () => setStatus("finished"));
			return { status: "finished", analysisId };
		} catch (error) {
			await step.run("set-status-error", () => setStatus("error"));
			throw error;
		}
	}
);

export const ragQuery = inngest.createFunction(
	{ id: "rag-query" },
	{ event: "ai/rag.query" },
	async ({ event, step }) => {
		const { analysisId, question } = event.data;

		const contexts = await step.run("query-content-embeddings", () =>
			queryEmbeddings(analysisId, question)
		);

		const answer = await step.run("generate-final-answer", () =>
			generateAnswer(question, contexts)
		);

		await step.run("save-answer-to-db", () =>
			db.update(analysis).set({ answer }).where(eq(analysis.id, analysisId))
		);

		return { status: "answered", question, answer };
	}
);
