// app/routes/_dash.dashboard._index.tsx

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
import { generations, users } from "~/db/schema";
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
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const CreateGenerationSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(500, "Name must be 500 characters or less"),
	len: z
		.number()
		.min(1, "Must generate at least 1 row")
		.max(1000, "Maximum 1000 rows allowed"),
	llmCommands: z
		.array(z.string().min(1, "Command cannot be empty"))
		.min(1, "At least one command is required")
		.max(10, "Maximum 10 commands allowed"),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const { userId } = await getAuth(args);
	if (!userId) return redirect("/");

	const userGenerations = await db
		.select()
		.from(generations)
		.where(eq(generations.userId, userId))
		.orderBy(generations.createdAt);
	return json({ generations: userGenerations });
};

export async function action(args: ActionFunctionArgs) {
	const { userId } = await getAuth(args);
	if (!userId)
		return json({ error: "Authentication required" }, { status: 401 });

	const formData = await args.request.formData();
	const formType = formData.get("_form") as string;

	if (formType === "create") {
		const name = formData.get("name") as string;
		const len = Number(formData.get("len"));
		const llmCommands = JSON.parse(
			formData.get("llmCommands") as string
		) as string[];

		const validationResult = CreateGenerationSchema.safeParse({
			name,
			len,
			llmCommands,
		});
		if (!validationResult.success) {
			return json(
				{ error: validationResult.error.flatten().fieldErrors },
				{ status: 400 }
			);
		}

		const [newGeneration] = await db
			.insert(generations)
			.values({
				userId,
				name: validationResult.data.name,
				len: validationResult.data.len,
				status: "running",
				data: {
					columns: [],
					llm_commands: validationResult.data.llmCommands,
					rows: [],
				},
			})
			.returning({ id: generations.id });

		await inngest.send({
			name: "ai/generate.tabular.data",
			data: { generationId: newGeneration.id },
		});
		return json({ success: true });
	}
	return json({ error: "Invalid form type" }, { status: 400 });
}

function CreateGenerationModal() {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [len, setLen] = useState(100);
	const [llmCommands, setLlmCommands] = useState([""]);
	const navigation = useNavigation();
	const isSubmitting = navigation.state === "submitting";

	useEffect(() => {
		if (navigation.state === "idle") {
			setOpen(false);
			setName("");
			setLen(100);
			setLlmCommands([""]);
		}
	}, [navigation.state]);

	const addCommand = () => setLlmCommands((prev) => [...prev, ""]);
	const removeCommand = (index: number) =>
		setLlmCommands((prev) => prev.filter((_, i) => i !== index));
	const updateCommand = (index: number, value: string) => {
		const newCommands = [...llmCommands];
		newCommands[index] = value;
		setLlmCommands(newCommands);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus className="mr-2 h-4 w-4" /> New Generation
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create New Generation</DialogTitle>
				</DialogHeader>
				<Form method="post">
					<div className="grid gap-4 py-4">
						<input type="hidden" name="_form" value="create" />
						<input
							type="hidden"
							name="llmCommands"
							value={JSON.stringify(llmCommands.filter(Boolean))}
						/>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="name" className="text-right">
								Name
							</Label>
							<Input
								id="name"
								name="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="col-span-3"
								required
								maxLength={500}
							/>
						</div>
						<div className="grid grid-cols-4 items-center gap-4">
							<Label htmlFor="len" className="text-right">
								Rows
							</Label>
							<Input
								id="len"
								name="len"
								type="number"
								value={len}
								onChange={(e) => setLen(Number(e.target.value))}
								className="col-span-3"
								min="1"
								max="1000"
								required
							/>
						</div>
						<div className="space-y-2">
							<Label>Commands ({llmCommands.length}/10)</Label>
							{llmCommands.map((command, index) => (
								<div key={index} className="flex items-center gap-2">
									<Input
										value={command}
										onChange={(e) => updateCommand(index, e.target.value)}
										placeholder={`e.g., "A random first name"`}
										maxLength={1000}
									/>
									{llmCommands.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeCommand(index)}
										>
											<X className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
							{llmCommands.length < 10 && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addCommand}
								>
									Add Command
								</Button>
							)}
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

export default function GenerationDashboard() {
	const { generations } = useLoaderData<typeof loader>();
	const revalidator = useRevalidator();

	useEffect(() => {
		const interval = setInterval(() => revalidator.revalidate(), 5000);
		return () => clearInterval(interval);
	}, [revalidator]);

	const handleDownloadJson = (generation: any) => {
		const jsonContent = JSON.stringify(generation.data, null, 2);
		const blob = new Blob([jsonContent], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${generation.name || "generation"}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle>Data Generations</CardTitle>
				<CreateGenerationModal />
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Rows Generated</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Download</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{generations.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="text-center">
									No generations found.
								</TableCell>
							</TableRow>
						) : (
							generations.map((gen: any) => (
								<TableRow key={gen.id}>
									<TableCell className="font-medium">{gen.name}</TableCell>
									<TableCell>{gen.data?.rows?.length || 0}</TableCell>
									<TableCell>
										<Badge
											variant={
												gen.status === "finished"
													? "default"
													: gen.status === "error"
													? "destructive"
													: "secondary"
											}
										>
											{gen.status}
										</Badge>
									</TableCell>
									<TableCell>
										<Button
											variant="link"
											size="sm"
											onClick={() => handleDownloadJson(gen)}
											disabled={!gen.data?.rows?.length}
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
