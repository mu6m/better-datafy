import { useState } from "react";
import { Menu, LogOut, HelpCircle } from "lucide-react";
import { Outlet, redirect, useLocation } from "@remix-run/react";
import { SignOutButton, useUser } from "@clerk/remix";
import { LoaderFunction } from "@remix-run/node";
import { getAuth } from "@clerk/remix/ssr.server";
import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTrigger,
} from "~/components/ui/sheet";
import { navLinks } from "~/config";

export const loader: LoaderFunction = async (args) => {
	const { userId } = await getAuth(args);
	if (!userId) {
		return redirect("/");
	}
	return {};
};

function SidebarNav({
	isMobile = false,
	onLinkClick,
}: {
	isMobile?: boolean;
	onLinkClick?: () => void;
}) {
	const location = useLocation();
	return (
		<nav
			className={cn(
				"grid items-start gap-2 px-2 text-sm font-medium lg:px-4",
				isMobile && "px-4"
			)}
		>
			{navLinks.map((item) => (
				<a
					key={item.name}
					href={item.href}
					onClick={onLinkClick}
					className={cn(
						buttonVariants({ variant: "ghost" }),
						"justify-start gap-3",
						location.pathname === item.href
							? "bg-muted text-primary"
							: "text-muted-foreground"
					)}
				>
					<item.icon className="h-4 w-4" />
					{item.name}
				</a>
			))}
		</nav>
	);
}

function UserMenu() {
	const { user } = useUser();
	const userInitial =
		user?.firstName?.charAt(0) ??
		user?.emailAddresses[0]?.emailAddress.charAt(0).toUpperCase() ??
		"U";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="secondary" size="icon" className="rounded-full">
					<Avatar className="h-8 w-8">
						<AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "User"} />
						<AvatarFallback>{userInitial}</AvatarFallback>
					</Avatar>
					<span className="sr-only">Toggle user menu</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{user?.fullName || "My Account"}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					className="cursor-pointer"
					onSelect={() =>
						window.open(
							"https://github.com/mu6m/better-datafy/issues",
							"_blank"
						)
					}
				>
					<HelpCircle className="mr-2 h-4 w-4" />
					<span>Support</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<SignOutButton>
					<DropdownMenuItem className="cursor-pointer">
						<LogOut className="mr-2 h-4 w-4" />
						<span>Log out</span>
					</DropdownMenuItem>
				</SignOutButton>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default function DashboardLayout() {
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	return (
		<div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
			<div className="hidden border-r bg-muted/40 md:block">
				<div className="flex h-full max-h-screen flex-col gap-2">
					<div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
						<a href="/" className="flex items-center gap-2 font-semibold">
							<span>Datafy</span>
						</a>
					</div>
					<div className="flex-1">
						<SidebarNav />
					</div>
				</div>
			</div>
			<div className="flex flex-col">
				<header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6">
					<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
						<SheetTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="shrink-0 md:hidden"
							>
								<Menu className="h-5 w-5" />
								<span className="sr-only">Toggle navigation menu</span>
							</Button>
						</SheetTrigger>
						<SheetContent side="left" className="flex flex-col p-0">
							<SheetHeader className="h-14 items-start border-b px-4 lg:h-[60px] lg:px-6">
								<a href="/" className="flex items-center gap-2 font-semibold">
									<span>Datafy</span>
								</a>
							</SheetHeader>
							<div className="flex-1 py-2">
								<SidebarNav
									isMobile
									onLinkClick={() => setMobileSidebarOpen(false)}
								/>
							</div>
						</SheetContent>
					</Sheet>
					<div className="w-full flex-1" />
					<UserMenu />
				</header>
				<main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
