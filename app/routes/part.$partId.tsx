import { getAuth } from "@clerk/remix/ssr.server";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigation,
} from "@remix-run/react";
import { eq } from "drizzle-orm";
import { useTransition } from "react";
import { db } from "~/db/db.server";
import { products } from "~/db/schema";
import { UserManager } from "~/utils/user.server";

export async function loader({ params }: LoaderFunctionArgs) {
	const partId = params.partId;

	if (!partId) {
		throw new Response("Product code not provided", { status: 404 });
	}

	const product = await db.query.products.findFirst({
		where: eq(products.id, partId),
	});

	if (!product) {
		throw new Response("Product not found", { status: 404 });
	}

	return json(product);
}

export async function action(args: any) {
	const formData = await args.request.formData();
	const { userId }: any = await getAuth(args);
	const productId = formData.get("productId");

	if (!userId || !productId) {
		return json({ success: false, error: "please login to your account" });
	}
	try {
		const userManager = new UserManager(userId);
		const inCart = await userManager.addCart({ productId, userId });
		return json({ success: `added! there are ${inCart} in cart` });
	} catch (error: any) {
		console.log(error);
		if (
			error.code === "P0001" &&
			error.message.includes("Not enough stock for product")
		) {
			return json({
				success: false,
				error: `maximum quantity reached`,
			});
		}
		return json({ success: false, error: "error during cart update" });
	}
}

export default function ProductPage() {
	const product = useLoaderData<typeof loader>();
	const actionData: any = useActionData();
	const navigation: any = useNavigation();
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="flex flex-col md:flex-row justify-center gap-8">
				<div>
					{product.imageUrl ? (
						<img
							src={product.imageUrl}
							alt={product.name}
							className="w-full max-w-md h-auto rounded-lg shadow-md"
						/>
					) : (
						<div className="w-full h-80 bg-gray-200 flex items-center justify-center rounded-lg shadow-md">
							<span className="text-gray-400">No image available</span>
						</div>
					)}
				</div>
				<div className="flex flex-col max-w-sm justify-between">
					<div>
						<h1 className="text-4xl font-bold text-gray-800 mb-16">
							{product.name}
						</h1>
						<p className="text-gray-600 text-sm mb-4 break-all whitespace-pre-line">
							{product.description}
						</p>
						<p>
							<span className=" text-gray-800">remaining</span>{" "}
							<span className="font-bold">{product.quantity}</span>
						</p>
					</div>
					<div className="flex justify-between items-center mb-6">
						<span className="text-2xl font-bold text-gray-900">
							$ {Number(product.price).toFixed(2)}
						</span>
						<Form method="post">
							<input type="hidden" name="productId" value={product.id} />
							<button
								disabled={navigation.state === "submitting"}
								type="submit"
								className="px-4 py-2 rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{navigation.state === "submitting"
									? "adding ..."
									: "add to cart"}
							</button>
							{actionData?.success && (
								<p className="text-green-500 mt-4">{actionData?.success}</p>
							)}
							{actionData?.error && (
								<p className="text-red-500 mt-4">{actionData.error}</p>
							)}
						</Form>
					</div>
				</div>
			</div>
		</div>
	);
}
