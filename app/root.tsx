import type { MetaFunction, LoaderFunction } from "@remix-run/node";

import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "@remix-run/react";

import { rootAuthLoader } from "@clerk/remix/ssr.server";
import { ClerkApp } from "@clerk/remix";
import { title } from "./config";
import type { LinksFunction } from "@remix-run/node";
import stylesheet from "~/tailwind.css?url";
import Nav from "./component/Nav";

export const links: LinksFunction = () => [
	{ rel: "stylesheet", href: stylesheet },
];
export const meta: MetaFunction = () => [
	{
		title: title,
	},
];

export const loader: LoaderFunction = (args) => rootAuthLoader(args);

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
			<Nav />
			<Outlet />
		</main>
	);
}

export default ClerkApp(App);
