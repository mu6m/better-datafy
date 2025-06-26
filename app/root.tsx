import type { MetaFunction, LoaderFunction } from "@remix-run/node";

import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "@remix-run/react";

import { getAuth, rootAuthLoader } from "@clerk/remix/ssr.server";
import { ClerkApp } from "@clerk/remix";
import { title } from "./config";
import type { LinksFunction } from "@remix-run/node";
import stylesheet from "~/tailwind.css?url";
import { db } from "./db/db.server";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: stylesheet },
];
export const meta: MetaFunction = () => [
	{
		title: title,
	},
];

export const loader: LoaderFunction = async (args) => {
	const authData = await rootAuthLoader(args);
	const { userId } = await getAuth(args);

	if (userId) {
		try {
			const existingUser = await db
				.select()
				.from(users)
				.where(eq(users.id, userId));
			if (existingUser.length === 0) {
				await db.insert(users).values({ id: userId });
			}
		} catch (error) {
			console.error("Database error:", error);
		}
	}

	return rootAuthLoader(args);
};

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" dir="ltr">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

function App() {
	return (
		<main>
			<Outlet />
		</main>
	);
}

export default ClerkApp(App);
