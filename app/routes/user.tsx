import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useActionData, Link } from "@remix-run/react";
import { db } from "~/db/db.server";
import { users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/remix/ssr.server";
import { UserManager } from "~/utils/user.server";
import { SignOutButton } from "@clerk/remix";

export const loader = async (request: any) => {
	const { userId }: any = await getAuth(request);
	let [user]: any = await db.select().from(users).where(eq(userId, users.id));
	if (!user) {
		user = {
			address: "",
			number: "",
		};
	}
	return json({ user });
};

export const action = async (args: any) => {
	const formData = await args.request.formData();
	const { userId }: any = await getAuth(args);
	const number = formData.get("number");
	const address = formData.get("address");

	try {
		const userManager = new UserManager(userId);
		await userManager.updateData({ number, address });
		return json({ success: true });
	} catch (error) {
		return json({ success: false, error: "data update failed" });
	}
};

export default function UserProfile() {
	const { user }: any = useLoaderData();
	const actionData: any = useActionData();

	return (
		<div className="max-w-md mx-auto flex flex-col items-center justify-center gap-8 my-4">
			<h1 className="text-2xl font-bold">update account</h1>
			<Form method="post" className="space-y-4 w-full">
				<div>
					<label
						htmlFor="number"
						className="block text-sm font-medium text-gray-700"
					>
						mobile number
					</label>
					<input
						type="text"
						name="number"
						id="number"
						defaultValue={user.number}
						className="py-2 px-2 mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
					/>
				</div>
				<div>
					<label
						htmlFor="address"
						className="block text-sm font-medium text-gray-700"
					>
						shipping address
					</label>
					<textarea
						rows={10}
						name="address"
						id="address"
						defaultValue={user.address}
						className="py-2 px-2 mt-1 block w-full border border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
					/>
				</div>
				<button
					type="submit"
					className="w-full py-2 px-4 border border-transparent shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
				>
					save
				</button>
				{actionData?.success && <p className="text-green-500 mt-4">saved!</p>}
				{actionData?.error && (
					<p className="text-red-500 mt-4">{actionData.error}</p>
				)}
			</Form>
			<Link
				to={"/orders"}
				className="w-full text-center bg-green-500 hover:bg-green-600 text-white py-2 px-4  rounded-sm"
			>
				show orders
			</Link>
			<SignOutButton>
				<button className="w-full bg-red-500 hover:bg-red-600 text-white py-2 px-4  rounded-sm">
					logout
				</button>
			</SignOutButton>
		</div>
	);
}
