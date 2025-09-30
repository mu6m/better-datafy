import React, { useState, useEffect } from "react";
import { X, Plus, Download } from "lucide-react";
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
import { scrapes } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth } from "@clerk/remix/ssr.server";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
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
import { Textarea } from "~/components/ui/textarea";

const CreateScrapeSchema = z.object({
	name: z.string().min(1, "Name is required").max(500),
	links: z.array(z.string().url()).min(1).max(5),
	scrapeInstructions: z.array(z.string().min(1)).min(1),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const { userId } = await getAuth(args);
	if (!userId) return redirect("/");

	const userScrapes = await db
		.select()
		.from(scrapes)
		.where(eq(scrapes.userId, userId))
		.orderBy(scrapes.createdAt);
	return json({ scrapes: userScrapes });
};

export async function action(args: ActionFunctionArgs) {
	const { userId } = await getAuth(args);
	if (!userId)
		return json({ error: "Authentication required" }, { status: 401 });

	const formData = await args.request.formData();
	if (formData.get("_form") === "create") {
		const data = {
			name: formData.get("name") as string,
			links: JSON.parse(formData.get("links") as string),
			scrapeInstructions: JSON.parse(
				formData.get("scrapeInstructions") as string
			),
		};

		const validation = CreateScrapeSchema.safeParse(data);
		if (!validation.success) {
			return json({ error: validation.error.flatten() }, { status: 400 });
		}

		const [newScrape] = await db
			.insert(scrapes)
			.values({
				userId,
				name: validation.data.name,
				status: "running",
				data: {
					links: validation.data.links,
					scrape: validation.data.scrapeInstructions,
					data: [],
				},
			})
			.returning({ id: scrapes.id });

		await inngest.send({
			name: "ai/llm.scrape",
			data: { scrapeId: newScrape.id },
		});

		return json({ success: true });
	}
	return json({ error: "Invalid form" }, { status: 400 });
}

function CreateScrapeModal() {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [links, setLinks] = useState([""]);
	const [scrapeInstructions, setScrapeInstructions] = useState([""]);
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	useEffect(() => {
		if (navigation.state === "idle" && !isSubmitting) {
			setOpen(false);
			setName("");
			setLinks([""]);
			setScrapeInstructions([""]);
		}
	}, [navigation.state, isSubmitting]);

	const updateItem = (setter: any, index: number, value: string) => {
		setter((prev: string[]) => {
			const newItems = [...prev];
			newItems[index] = value;
			return newItems;
		});
	};

	const addItem = (setter: any, limit: number) => {
		setter((prev: string[]) => (prev.length < limit ? [...prev, ""] : prev));
	};

	const removeItem = (setter: any, index: number) => {
		setter((prev: string[]) =>
			prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
		);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" /> New Scrape
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Create New Scrape</DialogTitle>
				</DialogHeader>
				<Form method="post">
					<div className="grid gap-4 py-4">
						<input type="hidden" name="_form" value="create" />
						<input
							type="hidden"
							name="links"
							value={JSON.stringify(links.filter(Boolean))}
						/>
						<input
							type="hidden"
							name="scrapeInstructions"
							value={JSON.stringify(scrapeInstructions.filter(Boolean))}
						/>
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								name="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Links ({links.length}/5)</Label>
							{links.map((link, index) => (
								<div key={index} className="flex items-center gap-2">
									<Input
										type="url"
										value={link}
										onChange={(e) =>
											updateItem(setLinks, index, e.target.value)
										}
										placeholder="https://example.com"
									/>
									{links.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeItem(setLinks, index)}
										>
											<X className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
							{links.length < 5 && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => addItem(setLinks, 5)}
								>
									Add Link
								</Button>
							)}
						</div>
						<div className="space-y-2">
							<Label>Scrape Instructions</Label>
							{scrapeInstructions.map((inst, index) => (
								<div key={index} className="flex items-start gap-2">
									<Textarea
										value={inst}
										onChange={(e) =>
											updateItem(setScrapeInstructions, index, e.target.value)
										}
										placeholder="e.g., Extract the article title"
										rows={2}
									/>
									{scrapeInstructions.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeItem(setScrapeInstructions, index)}
										>
											<X className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => addItem(setScrapeInstructions, 10)}
							>
								Add Instruction
							</Button>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Creating..." : "Create"}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

export default function ScrapesDashboard() {
	const { scrapes } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();

	useEffect(() => {
		const interval = setInterval(() => revalidator.revalidate(), 5000);
		return () => clearInterval(interval);
	}, [revalidator]);

	const handleDownloadJson = (scrape: any) => {
		const jsonContent = JSON.stringify(scrape.data, null, 2);
		const blob = new Blob([jsonContent], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${scrape.name || "scrape"}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Web Scrapes</CardTitle>
				<CreateScrapeModal />
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Links</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Download</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{scrapes.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="text-center">
									No scrapes found.
								</TableCell>
							</TableRow>
						) : (
							scrapes.map((scrape: any) => (
								<TableRow key={scrape.id}>
									<TableCell className="font-medium">{scrape.name}</TableCell>
									<TableCell>{scrape.data?.links?.length || 0}</TableCell>
									<TableCell>
										<Badge
											variant={
												scrape.status === "finished"
													? "default"
													: scrape.status === "error"
													? "destructive"
													: "secondary"
											}
										>
											{scrape.status}
										</Badge>
									</TableCell>
									<TableCell>
										<Button
											variant="link"
											size="sm"
											onClick={() => handleDownloadJson(scrape)}
											disabled={!scrape.data?.data?.length}
										>
											<Download className="mr-2 h-4 w-4" />
											JSON
										</Button>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
