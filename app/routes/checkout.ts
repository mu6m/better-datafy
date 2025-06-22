import { json } from "@remix-run/node";
import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db/db.server";
import { orders, cartItems, products } from "~/db/schema";

export const action = async ({ request }: any) => {
	try {
		const body = await request.json();
		const userId = body.meta.custom_data.id;

		const userCartItems: any = await db.query.cartItems.findMany({
			where: eq(cartItems.userId, userId),
			with: {
				product: true,
			},
		});

		const cartTotal = userCartItems.reduce((total: any, item: any) => {
			return total + item.product.price * item.quantity;
		}, 0);

		const totalAmount = body.data.attributes.first_order_item.price / 100;

		if (totalAmount >= cartTotal) {
			await db.transaction(async (trx) => {
				await trx.insert(orders).values(
					userCartItems.map((cartItem: any) => ({
						userId: cartItem.userId,
						productId: cartItem.productId,
						quantity: cartItem.quantity,
						price: cartItem.product.price,
					}))
				);

				await trx.delete(cartItems).where(eq(cartItems.userId, userId));

				for (const cartItem of userCartItems) {
					await trx
						.update(products)
						.set({
							quantity: sql`${products.quantity} - ${cartItem.quantity}`,
						})
						.where(
							and(
								eq(products.id, cartItem.productId),
								sql`${products.quantity} >= ${cartItem.quantity}`
							)
						);
				}
			});

			return json({ success: true });
		} else {
			return json(
				{ error: "Total amount exceeds cart total" },
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error(error);
		return json(
			{ error: "An error occurred while processing the order" },
			{ status: 500 }
		);
	}
};
