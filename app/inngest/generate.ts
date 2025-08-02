import { inngest } from "./client";
import { db } from "~/db/db.server";
import { generations } from "~/db/schema";
import { eq } from "drizzle-orm";
import { HfInference } from "@huggingface/inference";

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

interface GenerateDataEvent {
	data: {
		generationId: string;
	};
}

// Enhanced JSON cleaning and validation function
function cleanAndValidateJSON(rawText: string): string {
	let cleanedText = rawText
		.trim()
		// Remove markdown code blocks
		.replace(/```json/gi, "")
		.replace(/```/g, "")
		// Remove common AI response prefixes
		.replace(/^(here's|here is|the json|json:)/gi, "")
		// Remove trailing commas before closing brackets
		.replace(/,(\s*[}\]])/g, "$1")
		// Remove any text before the first [
		.replace(/^[^[]*/, "")
		// Remove any text after the last ]
		.replace(/[^\]]*$/, "")
		.trim();

	// Ensure we have brackets
	if (!cleanedText.startsWith("[") || !cleanedText.endsWith("]")) {
		throw new Error("Response doesn't contain a valid JSON array structure");
	}

	return cleanedText;
}

// Enhanced JSON parsing with better error handling
function parseGeneratedJSON(rawText: string): any[][] {
	try {
		const cleanedText = cleanAndValidateJSON(rawText);
		const data = JSON.parse(cleanedText);

		// Validate structure
		if (!Array.isArray(data)) {
			throw new Error("Generated data is not an array");
		}

		if (data.length === 0) {
			throw new Error("Generated data array is empty");
		}

		// Validate that all elements are arrays
		if (!data.every((row) => Array.isArray(row))) {
			throw new Error("Not all elements in the generated data are arrays");
		}

		return data;
	} catch (error) {
		console.error("JSON parsing failed:", error);
		throw new Error(`Failed to parse JSON: ${error.message}`);
	}
}

// Improved prompt with more specific instructions
function createPrompt(commands: string[], numItems: number): string {
	const columnDescriptions = commands
		.map((command, i) => `${i + 1}. ${command}`)
		.join("\n");

	return `
Your task is to generate a JSON array of arrays, representing tabular data, based on a user's request.

User Request: Generate ${numItems} rows of data with the following columns:
${columnDescriptions}

CRITICAL INSTRUCTIONS:
1. Return ONLY a JSON array of arrays - no other text
2. Each inner array represents one row with ${commands.length} values
3. Values must be properly quoted strings or numbers
4. No trailing commas
5. Ensure all strings are properly closed with quotes
6. Generate realistic, varied random data

For example:
- If the request is for 3 items with columns "City", the output should be like this:
  [["Paris"], ["Tokyo"], ["New York"]]

- If the request is for 2 items with columns "City" and "Country", the output should be like this:
  [["London", "UK"], ["Berlin", "Germany"]]


Generate ${numItems} rows now:`;
}

// Main generation function with improved error handling
async function generateAITabularData(
	commands: string[],
	numItems: number = 50
): Promise<any[][]> {
	const prompt = createPrompt(commands, numItems);

	console.log(
		`Generating ${numItems} rows with columns: ${commands.join(", ")}`
	);

	try {
		const response = await hf.chatCompletion({
			model: "meta-llama/Llama-3.1-8B-Instruct",
			messages: [{ role: "user", content: prompt }],
			max_tokens: 1_000_000, // Adjust tokens based on expected output
			temperature: 2, // Lower temperature for more consistent JSON
			provider: "auto",
		});

		const generatedText = response.choices[0].message.content;
		const data = parseGeneratedJSON(generatedText);

		// Validate row structure
		const expectedColumns = commands.length;
		const validRows = data.filter((row) => row.length === expectedColumns);

		if (validRows.length === 0) {
			throw new Error("No valid rows found with correct column count");
		}

		// Truncate if we got more rows than requested
		const finalData = validRows.slice(0, numItems);

		console.log(`Successfully generated ${finalData.length} valid rows`);
		return finalData;
	} catch (error) {
		console.error("Primary generation failed:", error);
		throw error;
	}
}

// Fallback with different approach
async function generateAITabularDataFallback(
	commands: string[],
	numItems: number = 50
): Promise<any[][]> {
	console.log("Using fallback generation method...");

	// Try with even more explicit instructions
	const prompt = `You must respond with only valid JSON. Create ${numItems} rows of data.

Columns: ${commands.join(", ")}

Return format: [["row1col1","row1col2"],["row2col1","row2col2"]]

JSON only:`;

	try {
		const response = await hf.chatCompletion({
			model: "meta-llama/Llama-3.1-8B-Instruct",
			messages: [{ role: "user", content: prompt }],
			max_tokens: Math.min(2000, numItems * 30),
			temperature: 0.1, // Very low temperature for consistency
			provider: "auto",
		});

		const generatedText = response.choices[0].message.content;
		return parseGeneratedJSON(generatedText);
	} catch (error) {
		console.error("Fallback generation failed:", error);
		throw error;
	}
}

// Generate simple fallback data if AI fails
function generateSimpleFallbackData(
	commands: string[],
	numItems: number
): any[][] {
	console.log("Generating simple fallback data...");

	const fallbackData: any[][] = [];
	for (let i = 0; i < numItems; i++) {
		const row = commands.map((command, index) => {
			// Generate simple placeholder data based on column name
			const lowerCommand = command.toLowerCase();
			if (lowerCommand.includes("name")) return `Name ${i + 1}`;
			if (lowerCommand.includes("email")) return `user${i + 1}@example.com`;
			if (lowerCommand.includes("age")) return 20 + (i % 50);
			if (lowerCommand.includes("city"))
				return ["New York", "London", "Paris", "Tokyo"][i % 4];
			if (lowerCommand.includes("country"))
				return ["USA", "UK", "France", "Japan"][i % 4];
			if (lowerCommand.includes("phone"))
				return `+1-555-${String(i + 1).padStart(4, "0")}`;
			if (lowerCommand.includes("date"))
				return new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
					.toISOString()
					.split("T")[0];
			if (lowerCommand.includes("price") || lowerCommand.includes("cost"))
				return (Math.random() * 1000).toFixed(2);

			// Default fallback
			return `${command} ${i + 1}`;
		});
		fallbackData.push(row);
	}

	return fallbackData;
}

// Enhanced main function with multiple fallback levels
async function generateAITabularDataWithFallbacks(
	commands: string[],
	numItems: number = 50
): Promise<any[][]> {
	// Validate inputs
	if (!commands || commands.length === 0) {
		throw new Error("Commands array is empty or undefined");
	}

	if (numItems <= 0 || numItems > 1000) {
		throw new Error("Number of items must be between 1 and 1000");
	}

	// Try primary method
	try {
		return await generateAITabularData(commands, numItems);
	} catch (primaryError) {
		console.log("Primary method failed, trying fallback...");

		// Try fallback method
		try {
			return await generateAITabularDataFallback(commands, numItems);
		} catch (fallbackError) {
			console.log("AI methods failed, using simple fallback data...");

			// Last resort: generate simple structured data
			return generateSimpleFallbackData(commands, numItems);
		}
	}
}

// Updated Inngest function
export const generateAIData = inngest.createFunction(
	{ id: "generate-ai-data" },
	{ event: "ai/generate.tabular.data" },
	async ({ event, step }: { event: GenerateDataEvent; step: any }) => {
		const { generationId } = event.data;

		try {
			// Step 1: Fetch generation data
			const generationRecord = await step.run(
				"fetch-generation-data",
				async () => {
					const result = await db
						.select()
						.from(generations)
						.where(eq(generations.id, generationId))
						.limit(1);

					if (result.length === 0) {
						throw new Error(`Generation with ID ${generationId} not found`);
					}

					return result[0];
				}
			);

			const { len: numberOfItems, data: generationData } = generationRecord;
			const { llm_commands } = generationData as { llm_commands: string[] };

			// Validate inputs
			if (!llm_commands || llm_commands.length === 0) {
				throw new Error(
					"'llm_commands' not found in generation data or is empty"
				);
			}

			if (!numberOfItems || numberOfItems <= 0) {
				throw new Error("'len' not found in generation data or is invalid");
			}

			// Step 2: Generate data with enhanced error handling
			const mockData = await step.run("generate-tabular-data", async () => {
				return await generateAITabularDataWithFallbacks(
					llm_commands,
					numberOfItems
				);
			});

			// Step 3: Update database with generated data
			await step.run("update-status-finished", async () => {
				const rows = mockData.map((row) => {
					const obj: Record<string, any> = {};
					llm_commands.forEach((command, index) => {
						obj[command] = row[index] || null;
					});
					return obj;
				});

				await db
					.update(generations)
					.set({
						status: "finished",
						data: {
							columns: llm_commands,
							llm_commands: llm_commands,
							rows: rows,
						},
					})
					.where(eq(generations.id, generationId));
			});

			return {
				message: `Successfully generated ${mockData.length} rows of data`,
				generationId,
				status: "finished",
				rowCount: mockData.length,
			};
		} catch (error) {
			// Handle errors
			await step.run("update-status-error-catch", async () => {
				try {
					await db
						.update(generations)
						.set({
							status: "error",
							data: {
								columns: [],
								llm_commands: [],
								rows: [],
								error: error instanceof Error ? error.message : String(error),
							},
						})
						.where(eq(generations.id, generationId));
				} catch (dbError) {
					console.error(
						"Failed to update database with error status:",
						dbError
					);
				}
			});

			return {
				error: error instanceof Error ? error.message : String(error),
				generationId,
				status: "error",
			};
		}
	}
);
