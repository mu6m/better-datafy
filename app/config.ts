import { BarChart3, Pickaxe, Rss, WashingMachine } from "lucide-react";

export const title = "Datafy";
export const description = "generate, analyse and scrape data using ai";
export const navLinks = [
	{ name: "Generate", href: "/dashboard/", icon: WashingMachine },
	{ name: "Analyze", href: "/dashboard/analyze", icon: BarChart3 },
	{ name: "Scrape", href: "/dashboard/scrape", icon: Pickaxe },
	{ name: "RSS Feed AI", href: "/dashboard/rss", icon: Rss },
];
