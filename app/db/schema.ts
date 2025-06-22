import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const generations = pgTable("generations", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name"),
	data: jsonb("data")
		.notNull()
		.default('{"columns": [], "llm_commands": [], "rows": []}'),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
	generations: many(generations),
}));

export const generationsRelations = relations(generations, ({ one }) => ({
	user: one(users, {
		fields: [generations.userId],
		references: [users.id],
	}),
}));

export type GenerationData = {
	columns: string[]; // Array of column names (1-10 columns)
	llm_commands: string[]; // Array of LLM commands corresponding to each column
	rows: Record<string, any>[]; // Array of row objects
};
