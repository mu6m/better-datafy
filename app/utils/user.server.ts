import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "~/db/db.server";
import { cartItems, products, users } from "~/db/schema";
import { LemonsqueezyClient } from "lemonsqueezy.ts";

export class UserManager {
	private userId: any;

	constructor(userId: string) {
		this.userId = userId;
	}

	async createUserIfNotExists(): Promise<void> {
		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.id, this.userId))
			.limit(1);

		if (!existingUser) {
			await db.insert(users).values({
				id: this.userId,
				number: "",
				address: "",
			});
		}
	}

	async addCart({ productId }: any) {
		await this.createUserIfNotExists();

		const user = await db.query.users.findFirst({
			where: eq(users.id, this.userId),
		});

		if (!user) {
			throw new Error("User does not exist.");
		}
		const [inCart] = await db
			.insert(cartItems)
			.values({ userId: this.userId, productId, quantity: 1 })
			.onConflictDoUpdate({
				target: [cartItems.userId, cartItems.productId],
				set: { quantity: sql`${cartItems.quantity} + 1` },
			})
			.returning({ quantity: cartItems.quantity });
		return inCart.quantity;
	}

	async updateData({ number, address }: any): Promise<void> {
		await this.createUserIfNotExists();

		await db
			.update(users)
			.set({ number, address })
			.where(eq(users.id, this.userId));
	}

	async removeCart({ productId }: any) {
		await db
			.delete(cartItems)
			.where(
				and(
					eq(this.userId, cartItems.userId),
					eq(productId, cartItems.productId)
				)
			);
	}

	async updateCart({ productId, quantity }: any) {
		await db
			.update(cartItems)
			.set({ quantity })
			.where(
				and(
					eq(this.userId, cartItems.userId),
					eq(productId, cartItems.productId)
				)
			);
	}

	async pay() {
		const separator =
			"\n\n______________________________________________________________________________________________________\n\n";
		const items: any = await db.query.cartItems.findMany({
			where: eq(cartItems.userId, this.userId),
			with: {
				product: true,
			},
		});
		const total = items.reduce((total: any, item: any) => {
			return total + item.product.price * item.quantity;
		}, 0);
		const client = new LemonsqueezyClient(process.env.LEMON_API!);
		// let cartArr = JSON.stringify(items).match(/.{1,255}/g) || [];
		const checkout: any = await client.createCheckout({
			checkout_options: {
				button_color: "#2DD272",
			},
			product_options: {
				redirect_url: "https://store.ledraa.com/orders",
				name: "open store",
				description: `your items : ${separator} ${items
					.map((item: any) => {
						return `${item.product.name} (x ${item.quantity}) price: ${
							item.quantity * item.product.price
						} $`;
					})
					.join(separator)} ${separator} [there is 10$ shipping fee]`,
			},
			checkout_data: {
				custom: {
					id: this.userId,
				},
			},
			expires_at: new Date(Date.now() + 5 * 60 * 1000),
			custom_price: (total + 10) * 100,
			//  * 105, add it if you need 5 percent more
			store: "59035",
			variant: "558027",
		});
		return checkout.data.attributes.url;
	}
}
