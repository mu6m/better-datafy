import { db } from "~/db/db.server";
import { generations } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { GenerationData, GenerationStatus } from "~/db/schema";
import { inngest } from "~/inngest/client";

export class GenerationManager {
	private userId: string;

	constructor(userId: string) {
		this.userId = userId;
	}

	async getGenerations(): Promise<(typeof generations.$inferSelect)[]> {
		return await db.query.generations.findMany({
			where: eq(generations.userId, this.userId),
			orderBy: (generations, { desc }) => [desc(generations.createdAt)],
		});
	}

	async createGeneration(
		name: string,
		llm_commands: string[],
		totalRows = 1000
	): Promise<void> {
		const userManager = new UserManager(this.userId);
		await userManager.createUserIfNotExists();

		const batchSize = 100;
		let generatedRows: any[][] = [];
		let status: GenerationStatus = "running";

		await db.insert(generations).values({
			id: generationId,
			userId: this.userId,
			name,
			status: "running",
			len: 0,
			data: {
				columns: llm_commands,
				llm_commands,
				rows: [],
			},
		});

		try {
			for (let offset = 0; offset < totalRows; offset += batchSize) {
				const result = await inngest.send({
					name: "ai/generate.tabular.data",
					data: {
						llm_commands,
						num_items: Math.min(batchSize, totalRows - offset),
					},
				});

				if (result?.data?.data) {
					generatedRows.push(...result.data.data);
				}
			}
		} catch (err) {
			status = "error";
		}

		await db
			.update(generations)
			.set({
				status,
				len: generatedRows.length,
				data: {
					columns: llm_commands,
					llm_commands,
					rows: generatedRows,
				},
			})
			.where(eq(generations.id, generationId));
	}
}
