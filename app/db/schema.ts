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

// User Table: The central entity
export const users = pgTable("users", {
	id: text("id").primaryKey(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Other tables that reference the User table
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

export const analysis = pgTable("analysis", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name"),
	data: jsonb("data").notNull().default('{"data": []}'),
	answer: text("answer"),
	status: statusEnum("status").notNull().default("running"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scrapes = pgTable("scrapes", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name"),
	data: jsonb("data").notNull().default('{"links": [],"scrape":[],"data":[]}'),
	status: statusEnum("status").notNull().default("running"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rssFeed = pgTable("rssFeed", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	name: text("name"),
	link: text("link"),
	summray: text("summray"),
	status: statusEnum("status").notNull().default("running"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Independent table with no relations
export const datasets = pgTable("datasets", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name"),
	link: text("link"),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ====== RELATIONS DEFINITIONS ======

// A user can have many generations, analyses, rssFeeds, and scrapes
export const usersRelations = relations(users, ({ many }) => ({
	generations: many(generations),
	analysis: many(analysis),
	rssFeeds: many(rssFeed),
	scrapes: many(scrapes),
}));

// Each generation belongs to exactly one user
export const generationsRelations = relations(generations, ({ one }) => ({
	user: one(users, {
		fields: [generations.userId],
		references: [users.id],
	}),
}));

// Each analysis belongs to exactly one user
export const analysisRelations = relations(analysis, ({ one }) => ({
	user: one(users, {
		fields: [analysis.userId],
		references: [users.id],
	}),
}));

// Each rssFeed belongs to exactly one user
export const rssFeedRelations = relations(rssFeed, ({ one }) => ({
	user: one(users, {
		fields: [rssFeed.userId],
		references: [users.id],
	}),
}));

// Each scrape belongs to exactly one user
export const scrapesRelations = relations(scrapes, ({ one }) => ({
	user: one(users, {
		fields: [scrapes.userId],
		references: [users.id],
	}),
}));

// ====== TYPES ======

export type GenerationData = {
	columns: string[];
	llm_commands: string[];
	rows: Record<string, any>[];
};

export type GenerationStatus = "error" | "running" | "finished";
