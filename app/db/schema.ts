import { relations, sql } from "drizzle-orm";
import {
	pgTable,
	text,
	timestamp,
	jsonb,
	integer,
	pgEnum,
	uuid,
} from "drizzle-orm/pg-core";

export const statusEnum = pgEnum("status", ["error", "running", "finished"]);

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const generations = pgTable("generations", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name"),
	len: integer("len"),
	status: statusEnum("status").notNull().default("running"),
	data: jsonb("data")
		.notNull()
		.default('{"columns": [], "llm_commands": [], "rows": []}'),
	createdAt: timestamp("created_at").defaultNow().notNull(),
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
	columns: string[];
	llm_commands: string[];
	rows: Record<string, any>[];
};

export type GenerationStatus = "error" | "running" | "finished";
