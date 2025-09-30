// app/routes/_dash.dashboard.rss.tsx

import React, { useState, useEffect } from "react";
import { X, Plus, Search } from "lucide-react";
import {
	Form,
	useLoaderData,
	useNavigation,
	useRevalidator,
} from "@remix-run/react";
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from "@remix-run/node";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db/db.server";
import { rssFeed } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth } from "@clerk/remix/ssr.server";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardFooter,
} from "~/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";

const CreateRssFeedSchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	link: z.string().url("Must be a valid URL").max(500),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const { userId } = await getAuth(args);
	if (!userId) return redirect("/");

	const userRssFeeds = await db
		.select()
		.from(rssFeed)
		.where(eq(rssFeed.userId, userId))
		.orderBy(rssFeed.updatedAt);
	return json({ rssFeeds: userRssFeeds });
};

export async function action(args: ActionFunctionArgs) {
	const { userId } = await getAuth(args);
	if (!userId)
		return json({ error: "Authentication required" }, { status: 401 });

	const formData = await args.request.formData();
	if (formData.get("_form") === "create") {
		const validation = CreateRssFeedSchema.safeParse({
			name: formData.get("name"),
			link: formData.get("link"),
		});

		if (!validation.success) {
			return json({ error: validation.error.flatten() }, { status: 400 });
		}

		const [newFeed] = await db
			.insert(rssFeed)
			.values({ ...validation.data, userId, status: "running" })
			.returning({ id: rssFeed.id });

		await inngest.send({
			name: "ai/llm.rss",
			data: { rssFeedId: newFeed.id },
		});
		return json({ success: true });
	}
	return json({ error: "Invalid form type" }, { status: 400 });
}

function CreateRssFeedModal() {
	const [open, setOpen] = useState(false);
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	useEffect(() => {
		if (navigation.state === "idle" && !isSubmitting) setOpen(false);
	}, [navigation.state, isSubmitting]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" /> Add RSS Feed
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add New RSS Feed</DialogTitle>
				</DialogHeader>
				<Form method="post">
					<div className="grid gap-4 py-4">
						<input type="hidden" name="_form" value="create" />
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input id="name" name="name" required maxLength={100} />
						</div>
						<div className="space-y-2">
							<Label htmlFor="link">RSS Feed URL</Label>
							<Input
								id="link"
								name="link"
								type="url"
								required
								maxLength={500}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Adding..." : "Add Feed"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

export default function RssFeedDashboard() {
	const { rssFeeds } = useLoaderData<typeof loader>();
	const [searchQuery, setSearchQuery] = useState("");
	const revalidator = useRevalidator();

	useEffect(() => {
		const interval = setInterval(() => revalidator.revalidate(), 30000);
		return () => clearInterval(interval);
	}, [revalidator]);

	const filteredFeeds = rssFeeds.filter(
		(feed: any) =>
			feed.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			feed.summray?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>RSS Feed Summaries</CardTitle>
				<CreateRssFeedModal />
			</CardHeader>
			<CardContent>
				<div className="relative mb-4">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
					<Input
						placeholder="Search summaries..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-10"
					/>
				</div>
				<div className="space-y-4">
					{filteredFeeds.length === 0 ? (
						<p className="text-center text-muted-foreground py-8">
							No feeds found.
						</p>
					) : (
						filteredFeeds.map((feed: any) => (
							<Card key={feed.id}>
								<CardHeader>
									<div className="flex items-center justify-between">
										<CardTitle>{feed.name}</CardTitle>
										<Badge
											variant={
												feed.status === "finished"
													? "default"
													: feed.status === "error"
													? "destructive"
													: "secondary"
											}
										>
											{feed.status}
										</Badge>
									</div>
									<CardDescription>
										<a
											href={feed.link}
											target="_blank"
											rel="noopener noreferrer"
											className="hover:underline"
										>
											{feed.link}
										</a>
									</CardDescription>
								</CardHeader>
								{feed.summray && (
									<CardContent>
										<p className="text-sm">{feed.summray}</p>
									</CardContent>
								)}
								<CardFooter>
									<p className="text-xs text-muted-foreground">
										Updated: {new Date(feed.updatedAt).toLocaleString()}
									</p>
								</CardFooter>
							</Card>
						))
					)}
				</div>
			</CardContent>
		</Card>
	);
}
