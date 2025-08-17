import { useState } from "react";
import {
	Menu,
	Home,
	Users,
	BarChart3,
	LogOut,
	Pickaxe,
	WashingMachine,
	Rss,
	Search,
	Bell,
	Settings,
	CreditCard,
	FileText,
	HelpCircle,
	X,
} from "lucide-react";
import { Outlet, redirect, useLocation } from "@remix-run/react";
import { SignOutButton, useUser } from "@clerk/remix";
import { LoaderFunction } from "@remix-run/node";
import { getAuth } from "@clerk/remix/ssr.server";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

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
	const { user } = useUser();

	const navigation = [
		{ name: "Generate", href: "/dashboard/", icon: WashingMachine },
		{ name: "Analyze", href: "/dashboard/analyze", icon: BarChart3 },
		{ name: "Scrape", href: "/dashboard/scrape", icon: Pickaxe },
		{ name: "RSS Feed AI", href: "/dashboard/rss", icon: Rss },
	];

	const SidebarContent = () => (
		<>
			<div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
				<a href="/" className="flex items-center gap-2 font-semibold">
					<span>Datafy</span>
				</a>
			</div>
			<div className="flex-1">
				<nav className="grid items-start px-2 text-sm font-medium lg:px-4">
					{navigation.map((item) => {
						const isCurrent = location.pathname === item.href;
						return (
							<a
								key={item.name}
								href={item.href}
								onClick={() => setSidebarOpen(false)}
								className={cn(
									"flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
									isCurrent ? "bg-muted text-primary" : "text-muted-foreground"
								)}
							>
								<item.icon className="h-4 w-4" />
								{item.name}
							</a>
						);
					})}
				</nav>
			</div>
			<div className="mt-auto p-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="w-full justify-start gap-2 px-2">
							<Avatar className="h-8 w-8">
								<AvatarImage src={user?.imageUrl} />
								<AvatarFallback>
									{user?.firstName?.charAt(0) ||
										user?.emailAddresses[0]?.emailAddress
											?.charAt(0)
											?.toUpperCase() ||
										"U"}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-col items-start text-left">
								<span className="text-sm font-medium">
									{user?.fullName || user?.firstName || "User"}
								</span>
								<span className="text-xs text-muted-foreground">
									{user?.emailAddresses[0]?.emailAddress}
								</span>
							</div>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>My Account</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() =>
								window.open(
									"https://github.com/mu6m/better-datafy/issues",
									"_blank"
								)
							}
						>
							<HelpCircle className="mr-2 h-4 w-4" />
							Get Help
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<SignOutButton>
							<DropdownMenuItem className="cursor-pointer">
								<LogOut className="mr-2 h-4 w-4" />
								Log out
							</DropdownMenuItem>
						</SignOutButton>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);

	return (
		<div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
			{/* Desktop Sidebar */}
			<div className="hidden border-r bg-muted/40 md:block">
				<div className="flex h-full max-h-screen flex-col gap-2">
					<SidebarContent />
				</div>
			</div>

			{/* Mobile Sidebar Overlay */}
			{sidebarOpen && (
				<div className="fixed inset-0 z-50 md:hidden">
					<div
						className="absolute inset-0 bg-black/50"
						onClick={() => setSidebarOpen(false)}
					/>
					<div className="relative flex h-full w-[280px] flex-col gap-2 border-r bg-background">
						<div className="flex h-14 items-center justify-between border-b px-4">
							<a href="/" className="flex items-center gap-2 font-semibold">
								<span>Datafy</span>
							</a>
							<Button
								variant="ghost"
								size="icon"
								onClick={() => setSidebarOpen(false)}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
						<div className="flex-1">
							<nav className="grid items-start px-2 text-sm font-medium">
								{navigation.map((item) => {
									const isCurrent = location.pathname === item.href;
									return (
										<a
											key={item.name}
											href={item.href}
											onClick={() => setSidebarOpen(false)}
											className={cn(
												"flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary",
												isCurrent
													? "bg-muted text-primary"
													: "text-muted-foreground"
											)}
										>
											<item.icon className="h-4 w-4" />
											{item.name}
										</a>
									);
								})}
							</nav>
						</div>
						<div className="mt-auto p-4">
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										className="w-full justify-start gap-2 px-2"
									>
										<Avatar className="h-8 w-8">
											<AvatarImage src={user?.imageUrl} />
											<AvatarFallback>
												{user?.firstName?.charAt(0) ||
													user?.emailAddresses[0]?.emailAddress
														?.charAt(0)
														?.toUpperCase() ||
													"U"}
											</AvatarFallback>
										</Avatar>
										<div className="flex flex-col items-start text-left">
											<span className="text-sm font-medium">
												{user?.fullName || user?.firstName || "User"}
											</span>
											<span className="text-xs text-muted-foreground">
												{user?.emailAddresses[0]?.emailAddress}
											</span>
										</div>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-56">
									<DropdownMenuLabel>My Account</DropdownMenuLabel>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="cursor-pointer"
										onClick={() =>
											window.open(
												"https://github.com/mu6m/better-datafy/issues",
												"_blank"
											)
										}
									>
										<HelpCircle className="mr-2 h-4 w-4" />
										Get Help
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<SignOutButton>
										<DropdownMenuItem className="cursor-pointer">
											<LogOut className="mr-2 h-4 w-4" />
											Log out
										</DropdownMenuItem>
									</SignOutButton>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>
				</div>
			)}

			<div className="flex flex-col">
				<header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
					<Button
						variant="outline"
						size="icon"
						className="shrink-0 md:hidden"
						onClick={() => setSidebarOpen(true)}
					>
						<Menu className="h-5 w-5" />
						<span className="sr-only">Toggle navigation menu</span>
					</Button>
					<div className="w-full flex-1"></div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="secondary" size="icon" className="rounded-full">
								<Avatar className="h-8 w-8">
									<AvatarImage src={user?.imageUrl} />
									<AvatarFallback>
										{user?.firstName?.charAt(0) ||
											user?.emailAddresses[0]?.emailAddress
												?.charAt(0)
												?.toUpperCase() ||
											"U"}
									</AvatarFallback>
								</Avatar>
								<span className="sr-only">Toggle user menu</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuLabel>My Account</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() =>
									window.open(
										"https://github.com/mu6m/better-datafy/issues",
										"_blank"
									)
								}
							>
								Support
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<SignOutButton>
								<DropdownMenuItem className="cursor-pointer">
									Logout
								</DropdownMenuItem>
							</SignOutButton>
						</DropdownMenuContent>
					</DropdownMenu>
				</header>
				<main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
