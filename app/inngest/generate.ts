import { inngest } from "./client";

// Interface for the event payload received by the Inngest function
interface GenerateDataEvent {
	data: {
		llm_commands: string[]; // Array of commands (column descriptions) for the AI
		num_items: number; // Number of rows to generate
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

/**
 * Generates tabular data using an AI model (Hugging Face Mixtral-8x7B-Instruct-v0.1).
 * The AI generates a JSON array of arrays based on provided commands and desired number of items.
 *
 * @param commands An array of strings, where each string describes a column for the data.
 * @param numItems The desired number of rows to generate.
 * @returns A Promise that resolves to a 2D array (table) of generated data,
 * or an error message within a 2D array if generation fails.
 */
async function generateAITabularData(
	commands: string[],
	numItems: number
): Promise<any[][]> {
	// Create a numbered list of column descriptions for the AI prompt
	const columnDescriptions = commands
		.map((command, i) => `${i + 1}. ${command}`)
		.join("\n");

	// Construct a detailed prompt for the AI to ensure it returns the correct format.
	// The prompt is made more explicit about the expected JSON array of arrays format,
	// especially for single-command scenarios, to prevent the AI from generating extra data.
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
	console.log("This may take a moment...");

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
export const generateAIData = inngest.createFunction(
	{ id: "generate-ai-data" }, // Unique ID for the Inngest function
	{ event: "ai/generate.tabular.data" }, // Event trigger for this function
	// Asynchronous handler function for the Inngest event
	async ({ event, step }: { event: GenerateDataEvent; step: any }) => {
		// Destructure relevant data from the event payload
		const { llm_commands: commands, num_items: numberOfItems } = event.data;

		// Validate if commands are provided and not empty
		if (!commands || commands.length === 0) {
			return {
				error: "Error: 'llm_commands' key not found in input or is empty.",
				data: null,
			};
		}

		// Generate mock data using the AI model within an Inngest step.
		// `step.run` ensures this operation is trackable and retriable within Inngest.
		const mockData = await step.run("generate-tabular-data", async () => {
			return await generateAITabularData(commands, numberOfItems);
		});

		// Return the result, including metadata, for the event consumer
		return {
			message: `Successfully generated ${mockData.length} rows of data`,
			data: mockData, // The generated tabular data
			columns: commands, // The original commands (column descriptions)
			rowCount: mockData.length, // The number of generated rows
		};
	}
);
