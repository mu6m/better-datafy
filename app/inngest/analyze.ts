import { inngest } from "./client";
import { db } from "~/db/db.server"; // Adjust the import path to your database instance
import { generations } from "~/db/schema"; // Adjust the import path to your schema
import { eq } from "drizzle-orm";

// Interface for the event payload received by the Inngest function
interface GenerateDataEvent {
	data: {
		generationId: string; // UUID of the generation record
	};
}

// Interface for the expected response structure from the Hugging Face API
interface HuggingFaceResponse {
	choices: Array<{
		message: {
			content: string; // The AI's generated content (JSON string)
		};
	}>;
}

async function generateAITabularData(
	commands: string[],
	numItems: number = 50
): Promise<any[][]> {
	const columnDescriptions = commands
		.map((command, i) => `${i + 1}. ${command}`)
		.join("\n");

	const fullPrompt = `
You are a data generation assistant. Your task is to generate a JSON array of arrays, representing tabular data, based on a user's request.

User Request: Generate ${numItems} rows of data with the following columns:
${columnDescriptions}

IMPORTANT: Your response must ONLY be the raw JSON array of arrays. Do not include any other text, explanations, or markdown formatting.
Each inner array should represent one row of data.
The number of elements in each inner array must exactly match the number of column descriptions provided.
Each value in an inner array must correspond directly to its respective column description.

For example:
- If the request is for 3 items with columns "City", the output should be like this:
  [["Paris"], ["Tokyo"], ["New York"]]

- If the request is for 2 items with columns "City" and "Country", the output should be like this:
  [["London", "UK"], ["Berlin", "Germany"]]
`;

	console.log(
		`Sending request to AI model for ${numItems} rows with columns: ${commands.join(
			", "
		)}`
	);

	try {
		// Call the Hugging Face Inference API for chat completions
		const response = await fetch(
			"https://api-inference.huggingface.co/models/mistralai/Mixtral-8x7B-Instruct-v0.1/v1/chat/completions",
			{
				method: "POST",
				headers: {
					// Authorization header with API key from environment variables
					Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					// Messages array for the chat completion API (user role only for this task)
					messages: [{ role: "user", content: fullPrompt }],
					max_tokens: 1_000_000, // Maximum tokens for the AI's response
					temperature: 0.8, // Creativity/randomness of the AI's response
				}),
			}
		);

		// Check if the HTTP response was successful
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		// Parse the JSON response from the Hugging Face API
		const responseData: HuggingFaceResponse = await response.json();
		// Extract the generated text content from the AI's response
		const generatedText = responseData.choices[0].message.content;

		// Clean the generated text: remove markdown code blocks if present
		const cleanedText = generatedText
			.trim() // Remove leading/trailing whitespace
			.replace(/```json/g, "") // Remove '```json'
			.replace(/```/g, "") // Remove '```'
			.trim(); // Trim again after replacements

		// Parse the cleaned JSON string into a JavaScript array
		const data = JSON.parse(cleanedText);

		// Basic validation: Check if the parsed data is an array of arrays
		if (
			!Array.isArray(data) || // Must be an array
			(data.length > 0 && !data.every((row) => Array.isArray(row))) // If not empty, all elements must be arrays
		) {
			throw new Error(
				"Generated data is not in the expected list of lists format."
			);
		}

		console.log(`Successfully generated ${data.length} rows.`);
		return data;
	} catch (error) {
		console.error(
			`An error occurred during AI data generation or parsing: ${error}`
		);
		// Return a structured error message within a 2D array for consistent client-side handling
		return [["Error", `Failed to generate or parse data. Details: ${error}`]];
	}
}

// Inngest function definition to expose the data generation as an event-driven task
export const analyzeAIData = inngest.createFunction(
	{ id: "analyze-ai-data" }, // Unique ID for the Inngest function
	{ event: "ai/analyze.tabular.data" }, // Event trigger for this function
	// Asynchronous handler function for the Inngest event
	async ({ event, step }: { event: GenerateDataEvent; step: any }) => {
		const { generationId } = event.data;

		try {
			// Step 1: Fetch generation data from database
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

			// Extract data from the generation record
			const { len: numberOfItems, data: generationData } = generationRecord;
			const { llm_commands } = generationData as { llm_commands: string[] };

			// Validate if commands are provided and not empty
			if (!llm_commands || llm_commands.length === 0) {
				throw new Error(
					"'llm_commands' not found in generation data or is empty"
				);
			}

			if (!numberOfItems || numberOfItems <= 0) {
				throw new Error("'len' not found in generation data or is invalid");
			}

			// Step 2: Generate mock data using the AI model
			const mockData = await step.run("generate-tabular-data", async () => {
				return await generateAITabularData(llm_commands, numberOfItems);
			});

			// Check if generation was successful (no error data)
			const hasError =
				mockData.length > 0 &&
				mockData[0].length === 2 &&
				mockData[0][0] === "Error";

			if (hasError) {
				// Step 3a: Update database status to error
				await step.run("update-status-error", async () => {
					await db
						.update(generations)
						.set({
							status: "error",
							data: {
								...generationData,
								error: mockData[0][1], // Store the error message
							},
						})
						.where(eq(generations.id, generationId));
				});

				return {
					error: mockData[0][1],
					generationId,
					status: "error",
				};
			} else {
				// Step 3b: Update database with generated data and set status to finished
				await step.run("update-status-finished", async () => {
					// Convert array of arrays to array of objects for storage
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
			}
		} catch (error) {
			// Handle any errors that occur during the process
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
