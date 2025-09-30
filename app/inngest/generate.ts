import { inngest } from "./client";
import { db } from "~/db/db.server";
import { generations } from "~/db/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const client = new OpenAI({
	baseURL: "https://router.huggingface.co/v1",
	apiKey: process.env.HUGGINGFACE_API_KEY,
});

async function generateAITable(
	columns: string[],
	rowCount: number
): Promise<Record<string, any>[]> {
	if (!columns?.length) {
		throw new Error("Columns array cannot be empty.");
	}
	if (rowCount <= 0 || rowCount > 1000) {
		throw new Error("Number of rows must be between 1 and 1000.");
	}

	const prompt = `
    Generate ${rowCount} rows of realistic and diverse data for these columns: ${columns.join(
		", "
	)}.
    Respond ONLY with a valid JSON array of objects. Each object should represent a single row.
    Do not include any explanations or surrounding text.
  `;

	const response = await client.chat.completions.create({
		model: "openai/gpt-oss-120b:cerebras",
		messages: [{ role: "user", content: prompt }],
		response_format: { type: "json_object" },
	});

	const content = response.choices[0].message.content;
	if (!content) {
		throw new Error("AI returned an empty response.");
	}

	try {
		const result = JSON.parse(content);
		const dataArray = Array.isArray(result)
			? result
			: result.data || result.rows;

		if (!Array.isArray(dataArray)) {
			throw new Error(
				"The AI response was not in the expected JSON array format."
			);
		}
		return dataArray;
	} catch (e) {
		console.error("Failed to parse AI JSON response:", content);
		throw new Error("AI returned invalid JSON.");
	}
}

export const generateAIData = inngest.createFunction(
	{ id: "generate-ai-data" },
	{ event: "ai/generate.tabular.data" },
	async ({ event, step }) => {
		const { generationId } = event.data;

		try {
			const generationRecord = await step.run(
				"fetch-generation-record",
				async () => {
					const [record] = await db
						.select()
						.from(generations)
						.where(eq(generations.id, generationId))
						.limit(1);

					if (!record) {
						throw new Error(`Generation record ${generationId} not found.`);
					}
					return record;
				}
			);

			const rowCount = generationRecord.len;
			const columns = (generationRecord.data as any)?.llm_commands as string[];

			const rows = await step.run("generate-ai-table-data", () =>
				generateAITable(columns, rowCount)
			);

			await step.run("update-record-as-finished", () =>
				db
					.update(generations)
					.set({
						status: "finished",
						data: { columns, rows },
					})
					.where(eq(generations.id, generationId))
			);

			return {
				message: `Successfully generated ${rows.length} rows for generation ${generationId}.`,
				status: "finished",
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`Failed to process generation ${generationId}:`,
				errorMessage
			);

			await step.run("update-record-as-error", async () => {
				try {
					await db
						.update(generations)
						.set({
							status: "error",
							data: { error: errorMessage },
						})
						.where(eq(generations.id, generationId));
				} catch (dbError) {
					console.error(
						`CRITICAL: Could not update error status for ${generationId}:`,
						dbError
					);
					throw dbError;
				}
			});

			throw error;
		}
	}
);
