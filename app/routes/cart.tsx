import {
	useLoaderData,
	Form,
	json,
	useActionData,
	redirect,
} from "@remix-run/react";
import { getAuth } from "@clerk/remix/ssr.server";
import { db } from "~/db/db.server";
import { cartItems } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import { UserManager } from "~/utils/user.server";

export const loader = async (args: any) => {
	const { userId }: any = await getAuth(args);
	const userManager = new UserManager(userId);
	await userManager.createUserIfNotExists();

	const Items = await db.query.cartItems.findMany({
		where: eq(cartItems.userId, userId),
		with: {
			product: true,
		},
	});

	return { cartItems: Items };
};

export const action = async (args: any) => {
	const formData = await args.request.formData();
	const { userId }: any = await getAuth(args);
	try {
		const userManager = new UserManager(userId);
		const action = formData.get("action");
		switch (action) {
			case "update": {
				const quantity = formData.get("quantity");
				const productId = formData.get("productId");
				await userManager.updateCart({ productId, quantity });
				break;
			}
			case "delete": {
				const productId = formData.get("productId");
				await userManager.removeCart({ productId });
				break;
			}
			case "pay": {
				const url = await userManager.pay();
				return redirect(url);
			}
		}
		return json({ success: true });
	} catch (error) {
		console.log(error);
		return json({ success: false, error: "error during update" });
	}
};

export default function Cart() {
	const { cartItems } = useLoaderData<typeof loader>();
	const actionData: any = useActionData();

	return (
		<div className="container mx-auto max-w-md my-8">
			<h1 className="text-3xl font-bold mb-4">cart</h1>
			<div className="bg-white rounded-lg shadow-lg p-6">
				<ul className="space-y-4">
					{cartItems.map((item: any) => (
						<li
							key={`${item.userId}-${item.productId}`}
							className="flex items-center justify-between"
						>
							<div>
								<p className="text-lg font-medium">{item.product.name}</p>
								<p className="text-gray-500">quantity: {item.quantity}</p>
								<p className="text-gray-500">
									total price: {item.product.price * item.quantity}
								</p>
							</div>
							<div className="flex items-center gap-8">
								<Form method="post" className="flex gap-4">
									<input
										type="text"
										name="action"
										hidden={true}
										value={"update"}
									/>
									<input
										type="text"
										name="productId"
										hidden={true}
										value={item.product.id}
									/>
									<input
										type="number"
										name="quantity"
										defaultValue={item.quantity}
										max={item.product.quantity}
										min={1}
										className="border border-gray-300 rounded px-3 py-2 w-16"
									/>
									<button
										type="submit"
										className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded"
									>
										update
									</button>
								</Form>
								<Form method="post">
									<input
										type="text"
										name="action"
										hidden={true}
										value={"delete"}
									/>
									<input
										type="text"
										name="productId"
										hidden={true}
										value={item.product.id}
									/>
									<button
										type="submit"
										className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded"
									>
										remove
									</button>
								</Form>
							</div>
						</li>
					))}
				</ul>
				{actionData?.success && (
					<p className="text-green-500 mt-4">updated succefully</p>
				)}
				{actionData?.error && (
					<p className="text-red-500 mt-4">{actionData.error}</p>
				)}
				{cartItems.length > 0 ? (
					<div className="mt-6 flex flex-col gap-4">
						<Form method="post">
							<input type="text" name="action" hidden={true} value={"pay"} />
							<button
								type="submit"
								className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
							>
								pay online
							</button>
						</Form>
						<a
							href="/user"
							target="_blank"
							className="bg-blue-500 w-fit hover:bg-blue-600 text-white px-4 py-2 rounded"
						>
							update the shipping address
						</a>
					</div>
				) : (
					<div className="mt-6 flex justify-center">
						<h1>the cart is empty</h1>
					</div>
				)}
			</div>
		</div>
	);
}
