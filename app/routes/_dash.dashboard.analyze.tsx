// app/routes/_dash.dashboard.analyze.tsx

import React, { useState, useEffect } from "react";
import { Plus, Minus } from "lucide-react";
import {
	Form,
	useLoaderData,
	useNavigation,
	useRevalidator,
	useActionData,
} from "@remix-run/react";
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from "@remix-run/node";
import { eq } from "drizzle-orm";
import { db } from "~/db/db.server";
import { analysis } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth } from "@clerk/remix/ssr.server";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

const createAnalysisSchema = z.object({
	name: z.string().min(1).max(100),
	sources: z.array(z.string().min(1).max(1500)).min(1).max(5),
});

const querySchema = z.object({
	analysisId: z.string().uuid(),
	question: z.string().min(1).max(500),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const { userId } = await getAuth(args);
	if (!userId) return redirect("/");
	const userAnalysis = await db
		.select()
		.from(analysis)
		.where(eq(analysis.userId, userId))
		.orderBy(analysis.createdAt);
	return json({ analysis: userAnalysis });
};

export async function action(args: ActionFunctionArgs) {
	const { userId } = await getAuth(args);
	if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

	const formData = await args.request.formData();
	const formType = formData.get("_form");

	if (formType === "create") {
		const sources = Array.from(formData.keys())
			.filter((key) => key.startsWith("source_"))
			.map((key) => formData.get(key) as string);
		const validation = createAnalysisSchema.safeParse({
			name: formData.get("name"),
			sources,
		});

		if (!validation.success) {
			return json({ error: validation.error.flatten() }, { status: 400 });
		}
		const [newAnalysis] = await db
			.insert(analysis)
			.values({
				userId,
				name: validation.data.name,
				status: "running",
				data: { data: validation.data.sources },
			})
			.returning({ id: analysis.id });

		await inngest.send({
			name: "ai/rag.process",
			data: { analysisId: newAnalysis.id },
		});
		return json({ success: true });
	}

	if (formType === "query") {
		const validation = querySchema.safeParse({
			analysisId: formData.get("analysisId"),
			question: formData.get("question"),
		});
		if (!validation.success) {
			return json({ error: validation.error.flatten() }, { status: 400 });
		}
		await inngest.send({
			name: "ai/rag.query",
			data: validation.data,
		});
		return json({ success: true, querySent: true });
	}

	return json({ error: "Invalid form type" }, { status: 400 });
}

export default function AnalysisDashboard() {
	const { analysis: analysisData } = useLoaderData<typeof loader>();
	const actionData = useActionData<typeof action>();
	const navigation = useNavigation();
	const revalidator = useRevalidator();

	const [sources, setSources] = useState([""]);
	const isCreating =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "create";
	const isQuerying =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "query";

	useEffect(() => {
		const interval = setInterval(() => revalidator.revalidate(), 5000);
		return () => clearInterval(interval);
	}, [revalidator]);

	useEffect(() => {
		if (navigation.state === "idle" && !isCreating) {
			setSources([""]);
		}
	}, [navigation.state, isCreating]);

	const addSource = () => setSources((s) => [...s, ""]);
	const removeSource = (index: number) =>
		setSources((s) => s.filter((_, i) => i !== index));
	const updateSource = (index: number, value: string) =>
		setSources((s) => {
			const newSources = [...s];
			newSources[index] = value;
			return newSources;
		});

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Create New Analysis</CardTitle>
				</CardHeader>
				<CardContent>
					<Form method="post" className="space-y-4">
						<input type="hidden" name="_form" value="create" />
						<div className="space-y-2">
							<Label htmlFor="name">Analysis Name</Label>
							<Input name="name" id="name" required maxLength={100} />
						</div>
						<div className="space-y-2">
							<Label>Data Sources ({sources.length}/5)</Label>
							{sources.map((source, index) => (
								<div key={index} className="flex items-start gap-2">
									<Textarea
										name={`source_${index}`}
										value={source}
										onChange={(e) => updateSource(index, e.target.value)}
										rows={3}
										maxLength={1500}
										required
									/>
									{sources.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => removeSource(index)}
										>
											<Minus className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
							{sources.length < 5 && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={addSource}
								>
									<Plus className="mr-2 h-4 w-4" /> Add Source
								</Button>
							)}
						</div>
						<Button type="submit" disabled={isCreating}>
							{isCreating ? "Creating..." : "Create Analysis"}
						</Button>
					</Form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Your Analyses</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{analysisData.length === 0 ? (
						<p className="text-center text-muted-foreground py-8">
							No analyses found.
						</p>
					) : (
						analysisData.map((item: any) => (
							<Card key={item.id}>
								<CardHeader>
									<div className="flex justify-between items-start">
										<CardTitle>{item.name}</CardTitle>
										<Badge
											variant={
												item.status === "finished"
													? "default"
													: item.status === "error"
													? "destructive"
													: "secondary"
											}
										>
											{item.status}
										</Badge>
									</div>
								</CardHeader>
								{item.status === "finished" && (
									<CardContent className="space-y-4">
										<Form method="post" className="flex gap-2">
											<input type="hidden" name="_form" value="query" />
											<input type="hidden" name="analysisId" value={item.id} />
											<Input
												name="question"
												placeholder="Ask a question..."
												required
												disabled={isQuerying}
											/>
											<Button type="submit" disabled={isQuerying}>
												{isQuerying ? "Asking..." : "Ask"}
											</Button>
										</Form>
										{item.answer && (
											<div className="p-4 bg-muted rounded-lg text-sm">
												<p className="whitespace-pre-wrap">{item.answer}</p>
											</div>
										)}
									</CardContent>
								)}
							</Card>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}
