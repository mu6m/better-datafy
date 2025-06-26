import { Outlet } from "@remix-run/react";
import Nav from "~/component/Nav";

export default function LandingLayout() {
	return (
		<>
			<main className="bg-blue-500 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
				<Nav />
				<Outlet />
			</main>
		</>
	);
}
