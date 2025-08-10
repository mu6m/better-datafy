import React, { useState } from "react";
import {
	Menu,
	X,
	Home,
	Users,
	BarChart3,
	LogOut,
	Pickaxe,
	WashingMachine,
	BarChart2,
	Rss,
	File,
	Video,
	Youtube,
} from "lucide-react";
import { Outlet, redirect, useLocation } from "@remix-run/react";
import { SignOutButton } from "@clerk/remix";
import { LoaderFunction } from "@remix-run/node";
import { getAuth } from "@clerk/remix/ssr.server";

export const loader: LoaderFunction = async (args) => {
	const { userId } = await getAuth(args);

	if (!userId) {
		return redirect("/");
	}
	return userId;
};

export default function Dashboard() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const location = useLocation();

	const navigation = [
		{ name: "Generate", href: "/dashboard/", icon: WashingMachine },
		{ name: "Analyze", href: "/dashboard/analyze", icon: BarChart3 },
		{ name: "Scrape", href: "/dashboard/scrape", icon: Pickaxe },
		{ name: "Rss Feed AI", href: "/dashboard/rss", icon: Rss },
		// { name: "Datasets", href: "/dashboard/datasets", icon: File },
		// { name: "Stock LLM", href: "/dashboard/stockllm", icon: BarChart2 },
		// { name: "Yolo Training", href: "/dashboard/yolo", icon: Video },
		// {
		// 	name: "Summarize Youtube Video",
		// 	href: "/dashboard/youtube",
		// 	icon: Youtube,
		// },
	];

	return (
		<div className="max-h-screen min-h-screen bg-gray-50 flex">
			{/* Mobile sidebar overlay */}
			{sidebarOpen && (
				<div className="fixed inset-0 z-40 lg:hidden">
					<div
						className="fixed inset-0 bg-gray-600 bg-opacity-75"
						onClick={() => setSidebarOpen(false)}
					/>
				</div>
			)}

			{/* Sidebar */}
			<div
				className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:relative lg:flex lg:flex-col ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 flex-shrink-0">
					<div className="flex items-center">
						<div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
							<span className="text-white font-bold text-lg">D</span>
						</div>
						<span className="ml-3 text-xl font-semibold text-gray-900">
							Datafy
						</span>
					</div>
					<button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
						<X className="w-6 h-6 text-gray-500" />
					</button>
				</div>

				<nav className="flex-1 px-3 py-6 overflow-y-auto max-h-[83vh]">
					<div className="space-y-1">
						{navigation.map((item) => {
							const isCurrent = location.pathname === item.href;
							return (
								<a
									key={item.name}
									href={item.href}
									className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
										isCurrent
											? "bg-blue-50 text-blue-700 border-r-2 border-blue-700"
											: "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
									}`}
								>
									<item.icon
										className={`mr-3 h-5 w-5 transition-colors duration-200 ${
											isCurrent
												? "text-blue-500"
												: "text-gray-400 group-hover:text-gray-500"
										}`}
									/>
									{item.name}
								</a>
							);
						})}
					</div>
				</nav>

				<div className="px-3 pb-4 border-t border-gray-200 pt-4 flex-shrink-0">
					<SignOutButton>
						<button className="group flex items-center w-full px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200">
							<LogOut className="mr-3 h-5 w-5" />
							Logout
						</button>
					</SignOutButton>
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 flex flex-col lg:ml-0">
				{/* Top header */}
				<div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
					<div className="flex items-center h-16 px-4 sm:px-6 lg:px-8">
						<button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
							<Menu className="w-6 h-6 text-gray-500" />
						</button>
						<h1 className="ml-4 lg:ml-0 text-xl font-semibold text-gray-900">
							Dashboard
						</h1>
					</div>
				</div>

				{/* Page content */}
				<main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
