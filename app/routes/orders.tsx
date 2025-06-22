import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { getAuth } from "@clerk/remix/ssr.server";
import { db } from "~/db/db.server";
import { eq } from "drizzle-orm";
import { orders } from "~/db/schema";

export async function loader(args: any) {
	const { userId }: any = await getAuth(args);
	const userOrders: any = await db.query.orders.findMany({
		where: eq(orders.userId, userId),
		with: {
			product: true,
		},
	});
	return json({ orders: userOrders });
}

export default function OrdersPage() {
	const { orders }: any = useLoaderData();

	return (
		<div className="container mx-auto py-6 max-w-md">
			<h1 className="text-2xl font-bold mb-6">orders</h1>
			<div className="bg-white shadow-md rounded p-2">
				{orders.length > 0 ? (
					<ul className="divide-y divide-gray-200">
						{orders.map((order: any) => (
							<li
								key={order.orderId}
								className="py-4 flex items-center justify-between gap-8"
							>
								<div>
									<p className="text-lg font-semibold">{order.product.name}</p>
									<p className="text-sm text-gray-500">
										quantity: {order.quantity}
									</p>
									<p className="text-sm text-gray-500">
										status :<span className="font-medium">{order.status}</span>
									</p>
								</div>
								<div className="text-right">
									<p className="text-lg font-bold text-blue-600">
										$ {order.price * order.quantity}
									</p>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-gray-500">there are no orders</p>
				)}
			</div>
			<p className="text-gray-500">
				support contact: <a href="mailto:test@ledraa.com">test@ledraa.com</a>
			</p>
		</div>
	);
}
