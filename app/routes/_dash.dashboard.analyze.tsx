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
import { analysis, users } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth, rootAuthLoader } from "@clerk/remix/ssr.server";
import { z } from "zod";

const createAnalysisSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be less than 100 characters"),
	sources: z
		.array(
			z
				.string()
				.min(1, "Source cannot be empty")
				.max(1500, "Source must be less than 1500 characters")
		)
		.min(1, "At least 1 source is required")
		.max(5, "Maximum 5 sources allowed"),
});

const querySchema = z.object({
	analysisId: z.string().uuid("Invalid analysis ID"),
	question: z
		.string()
		.min(1, "Question is required")
		.max(500, "Question must be less than 500 characters"),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const authData = await rootAuthLoader(args);
	const { userId } = await getAuth(args);

	if (!userId) {
		return json({ analysis: [] });
	}

	try {
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.id, userId));

		if (existingUser.length === 0) {
			await db.insert(users).values({ id: userId });
		}

		const userAnalysis = await db
			.select()
			.from(analysis)
			.where(eq(analysis.userId, userId))
			.orderBy(analysis.createdAt);

		return json({
			analysis: userAnalysis,
			authData,
		});
	} catch (error) {
		console.error("Failed to fetch analysis:", error);
		return json({
			analysis: [],
			authData,
			error: "Failed to fetch analysis",
		});
	}
};

export async function action(args: ActionFunctionArgs) {
	const formData = await args.request.formData();
	const formType = formData.get("_form") as string;

	const { userId } = await getAuth(args);

	if (!userId) {
		return json(
			{ success: false, error: "Authentication required" },
			{ status: 401 }
		);
	}

	if (formType === "create") {
		const name = formData.get("name") as string;
		const sourcesCount = parseInt(formData.get("sourcesCount") as string);

		const sources = [];
		for (let i = 0; i < sourcesCount; i++) {
			const source = formData.get(`source_${i}`) as string;
			if (source?.trim()) {
				sources.push(source.trim());
			}
		}

		const validation = createAnalysisSchema.safeParse({ name, sources });

		if (!validation.success) {
			return json(
				{
					success: false,
					error: validation.error.errors[0].message,
					fieldErrors: validation.error.flatten().fieldErrors,
				},
				{ status: 400 }
			);
		}

		try {
			const newAnalysis = await db
				.insert(analysis)
				.values({
					userId,
					name: validation.data.name,
					status: "running",
					data: { data: validation.data.sources },
				})
				.returning({ id: analysis.id });

			const analysisId = newAnalysis[0].id;

			await inngest.send({
				name: "ai/rag.process",
				data: {
					analysisId,
				},
			});

			return redirect("/dashboard/analyze");
		} catch (error) {
			console.error("Failed to create analysis:", error);
			return json(
				{ success: false, error: "Failed to create analysis" },
				{ status: 500 }
			);
		}
	}

	if (formType === "query") {
		const analysisId = formData.get("analysisId") as string;
		const question = formData.get("question") as string;

		const validation = querySchema.safeParse({ analysisId, question });

		if (!validation.success) {
			return json(
				{
					success: false,
					error: validation.error.errors[0].message,
				},
				{ status: 400 }
			);
		}

		try {
			const result = await inngest.send({
				name: "ai/rag.query",
				data: {
					analysisId: validation.data.analysisId,
					question: validation.data.question,
				},
			});

			return json({ success: true, result });
		} catch (error) {
			console.error("Failed to query analysis:", error);
			return json(
				{ success: false, error: "Failed to query analysis" },
				{ status: 500 }
			);
		}
	}

	return json({ success: false, error: "Invalid form type" }, { status: 400 });
}

export default function AnalysisDashboard() {
	const revalidator = useRevalidator();
	const actionData = useActionData<typeof action>();

	useEffect(() => {
		const interval = setInterval(() => {
			revalidator.revalidate();
		}, 500);

		return () => clearInterval(interval);
	}, []);

	const { analysis: analysisData } = useLoaderData<typeof loader>();
	const navigation = useNavigation();

	const [sourcesCount, setSourcesCount] = useState(1);
	const [sources, setSources] = useState<string[]>([""]);

	const isCreating =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "create";

	const isQuerying =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "query";

	const addSource = () => {
		if (sourcesCount < 5) {
			setSourcesCount(sourcesCount + 1);
			setSources([...sources, ""]);
		}
	};

	const removeSource = (index: number) => {
		if (sourcesCount > 1) {
			setSourcesCount(sourcesCount - 1);
			setSources(sources.filter((_, i) => i !== index));
		}
	};

	const updateSource = (index: number, value: string) => {
		const newSources = [...sources];
		newSources[index] = value;
		setSources(newSources);
	};

	const resetForm = () => {
		setSourcesCount(1);
		setSources([""]);
	};

	useEffect(() => {
		if (navigation.state === "idle" && !isCreating && actionData?.success) {
			resetForm();
		}
	}, [navigation.state, isCreating, actionData]);

	return (
		<div className="max-w-4xl mx-auto p-6 space-y-6">
			<div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					Create New Analysis
				</h2>

				{actionData?.error && (
					<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
						<p className="text-sm text-red-600">{actionData.error}</p>
					</div>
				)}

				<Form method="post" className="space-y-4">
					<input type="hidden" name="_form" value="create" />
					<input type="hidden" name="sourcesCount" value={sourcesCount} />

					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Analysis Name
						</label>
						<input
							type="text"
							name="name"
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
							placeholder="Enter analysis name"
							required
							disabled={isCreating}
							maxLength={100}
						/>
					</div>

					<div>
						<div className="flex items-center justify-between mb-2">
							<label className="block text-sm font-medium text-gray-700">
								Data Sources ({sourcesCount}/5)
							</label>
							<div className="flex gap-2">
								{sourcesCount < 5 && (
									<button
										type="button"
										onClick={addSource}
										className="text-blue-600 hover:text-blue-800 text-sm font-medium"
										disabled={isCreating}
									>
										<Plus className="w-4 h-4 inline mr-1" />
										Add Source
									</button>
								)}
							</div>
						</div>

						<div className="space-y-3">
							{Array.from({ length: sourcesCount }, (_, index) => (
								<div key={index} className="relative">
									<div className="flex items-start gap-2">
										<div className="flex-1">
											<textarea
												name={`source_${index}`}
												value={sources[index] || ""}
												onChange={(e) => updateSource(index, e.target.value)}
												rows={4}
												className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
												placeholder={`Enter data source ${index + 1}...`}
												required
												disabled={isCreating}
												maxLength={1500}
											/>
											<div className="mt-1 text-xs text-gray-500">
												{sources[index]?.length || 0}/1500 characters
											</div>
										</div>
										{sourcesCount > 1 && (
											<button
												type="button"
												onClick={() => removeSource(index)}
												className="mt-2 p-1 text-red-600 hover:text-red-800"
												disabled={isCreating}
											>
												<Minus className="w-4 h-4" />
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					</div>

					<button
						type="submit"
						disabled={isCreating}
						className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
					>
						<Plus className="w-4 h-4 mr-2" />
						{isCreating ? "Creating..." : "Create Analysis"}
					</button>
				</Form>
			</div>

			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				<div className="p-6 border-b border-gray-200">
					<h2 className="text-xl font-semibold text-gray-900">Your Analysis</h2>
				</div>
				<div className="divide-y divide-gray-200">
					{analysisData.length === 0 ? (
						<div className="p-6 text-center text-gray-500">
							No analysis found. Create your first one above.
						</div>
					) : (
						analysisData.map((item: any) => (
							<div key={item.id} className="p-6">
								<div className="flex items-center justify-between mb-4">
									<div>
										<h3 className="text-lg font-medium text-gray-900">
											{item.name || `Analysis ${item.id.slice(0, 8)}`}
										</h3>
										<div className="flex items-center gap-2 mt-1">
											<span
												className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
													item.status === "finished"
														? "bg-green-100 text-green-800"
														: item.status === "error"
														? "bg-red-100 text-red-800"
														: "bg-blue-100 text-blue-800"
												}`}
											>
												{item.status}
											</span>
											<span className="text-xs text-gray-500">
												{item.data?.data?.length || 0} sources
											</span>
										</div>
									</div>
								</div>

								{item.status === "finished" && (
									<div className="flex flex-col gap-2">
										<Form method="post" className="flex gap-2">
											<input type="hidden" name="_form" value="query" />
											<input type="hidden" name="analysisId" value={item.id} />
											<input
												type="text"
												name="question"
												className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
												placeholder="Ask a question about this analysis..."
												required
												disabled={isQuerying}
												maxLength={500}
											/>
											<button
												type="submit"
												disabled={isQuerying}
												className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
											>
												{isQuerying ? "Asking..." : "Ask"}
											</button>
										</Form>
										{item.answer && (
											<div className="bg-blue-50 border border-blue-200 rounded-md p-4">
												<div className="bg-white rounded-md p-3 border border-blue-100">
													<p className="text-sm text-gray-900 whitespace-pre-wrap">
														{item.answer}
													</p>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
