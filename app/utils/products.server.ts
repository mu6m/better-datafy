import { db } from "~/db/db.server";
import { products } from "~/db/schema";
import { sql } from "drizzle-orm";

export const ITEMS_PER_PAGE = 12;

export async function getProducts(page: number, searchQuery?: string) {
	const offset = (page - 1) * ITEMS_PER_PAGE;

	let query: any = db.select().from(products);

	if (searchQuery) {
		query = query.where(
			sql`${products.name} ILIKE ${`%${searchQuery}%`} OR ${
				products.description
			} ILIKE ${`%${searchQuery}%`}`
		);
	}

	const totalItems = await db
		.select({ count: sql<number>`count(*)` })
		.from(query.as("search_results"))
		.then((result: any) => Number(result[0].count));

	const productList = await query
		.limit(ITEMS_PER_PAGE)
		.offset(offset)
		.orderBy(products.createdAt);

	return {
		products: productList,
		totalPages: Math.ceil(totalItems / ITEMS_PER_PAGE),
		currentPage: page,
	};
}
