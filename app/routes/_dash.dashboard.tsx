import React, { useState, useEffect } from "react";
import { X, Plus, Download } from "lucide-react";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from "@remix-run/node";
import { eq } from "drizzle-orm";
import { db } from "~/db/db.server";
import { generations, users } from "~/db/schema"; // Adjust import path as needed
import { inngest } from "~/inngest/client";
import { getAuth, rootAuthLoader } from "@clerk/remix/ssr.server";

type GenerationStatus = "error" | "running" | "finished";

type GenerationData = {
	columns: string[];
	llm_commands: string[];
	rows: Record<string, any>[];
};

type Generation = {
	id: string;
	userId: string;
	name: string | null;
	len: number | null;
	status: GenerationStatus;
	data: GenerationData;
	createdAt: Date;
};

// Loader function - fetch generations from DB based on authenticated user
export const loader = async (args: LoaderFunctionArgs) => {
	const authData = await rootAuthLoader(args);
	const { userId } = await getAuth(args);

	if (!userId) {
		return json({ generations: [] });
	}

	try {
		// Ensure user exists in database
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.id, userId));

		if (existingUser.length === 0) {
			await db.insert(users).values({ id: userId });
		}

		// Fetch all generations for the authenticated user
		const userGenerations = await db
			.select()
			.from(generations)
			.where(eq(generations.userId, userId))
			.orderBy(generations.createdAt); // Order by creation date

		return json({
			generations: userGenerations,
			authData,
		});
	} catch (error) {
		console.error("Failed to fetch generations:", error);
		return json({
			generations: [],
			authData,
			error: "Failed to fetch generations",
		});
	}
};

// Action function - handle generation creation
export async function action(args: ActionFunctionArgs) {
	const formData = await args.request.formData();
	const formType = formData.get("_form") as string;

	// Get authenticated user ID
	const { userId } = await getAuth(args);

	if (!userId) {
		return json(
			{ success: false, error: "Authentication required" },
			{ status: 401 }
		);
	}

	if (formType === "create") {
		const name = formData.get("name") as string;
		const len = parseInt(formData.get("len") as string);
		const llmCommandsJson = formData.get("llmCommands") as string;

		if (!name?.trim() || !llmCommandsJson) {
			return json(
				{ success: false, error: "Name and commands are required" },
				{ status: 400 }
			);
		}

		let llmCommands;
		try {
			llmCommands = JSON.parse(llmCommandsJson);
		} catch {
			return json(
				{ success: false, error: "Invalid commands format" },
				{ status: 400 }
			);
		}

		try {
			// Create new generation record in database
			const newGeneration = await db
				.insert(generations)
				.values({
					userId,
					name: name.trim(),
					len,
					status: "running",
					data: {
						columns: [],
						llm_commands: llmCommands,
						rows: [],
					},
				})
				.returning({ id: generations.id });

			const generationId = newGeneration[0].id;

			// Send event to Inngest
			await inngest.send({
				name: "ai/generate.tabular.data",
				data: {
					generationId,
				},
			});

			return redirect("/dashboard");
		} catch (error) {
			console.error("Failed to create generation:", error);
			return json(
				{ success: false, error: "Failed to create generation" },
				{ status: 500 }
			);
		}
	}

	return json({ success: false, error: "Invalid form type" }, { status: 400 });
}

export default function GenerationDashboard() {
	const { generations } = useLoaderData<typeof loader>();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const navigation = useNavigation();

	const isSubmitting =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "create";

	const handleDownloadJson = (generation: Generation) => {
		const jsonContent = JSON.stringify(generation.data, null, 2);
		const blob = new Blob([jsonContent], { type: "application/json" });
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = `${generation.name || "generation"}_${generation.id}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	useEffect(() => {
		if (navigation.state === "idle" && !isSubmitting) {
			setShowCreateModal(false);
		}
	}, [navigation.state, isSubmitting]);

	return (
		<div className="max-w-4xl mx-auto p-6">
			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h2 className="text-xl font-semibold text-gray-900">
						Data Generations
					</h2>
					<button
						onClick={() => setShowCreateModal(true)}
						className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
					>
						<Plus className="w-4 h-4 mr-2" />
						New Generation
					</button>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Name
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Rows Generated
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Download
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{generations.length === 0 ? (
								<tr>
									<td
										colSpan={4}
										className="px-6 py-12 text-center text-gray-500"
									>
										No generations found. Create your first one to get started.
									</td>
								</tr>
							) : (
								generations.map((generation) => (
									<tr key={generation.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{generation.name ||
													`Generation ${generation.id.slice(0, 8)}`}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{generation.data?.rows?.length || 0}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span
												className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
													generation.status === "finished"
														? "bg-green-100 text-green-800"
														: generation.status === "error"
														? "bg-red-100 text-red-800"
														: "bg-blue-100 text-blue-800"
												}`}
											>
												{generation.status}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
											<button
												onClick={() => handleDownloadJson(generation)}
												className="inline-flex items-center text-blue-600 hover:text-blue-800 disabled:text-gray-400"
												disabled={!generation.data?.rows?.length}
											>
												<Download className="w-4 h-4 mr-1" />
												JSON
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			<CreateGenerationModal
				isOpen={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				isSubmitting={isSubmitting}
			/>
		</div>
	);
}

function CreateGenerationModal({
	isOpen,
	onClose,
	isSubmitting,
}: {
	isOpen: boolean;
	onClose: () => void;
	isSubmitting: boolean;
}) {
	const [name, setName] = useState("");
	const [len, setLen] = useState(100);
	const [llmCommands, setLlmCommands] = useState([""]);

	const addCommand = () => {
		setLlmCommands([...llmCommands, ""]);
	};

	const removeCommand = (index: number) => {
		if (llmCommands.length > 1) {
			setLlmCommands(llmCommands.filter((_, i) => i !== index));
		}
	};

	const updateCommand = (index: number, value: string) => {
		const newCommands = [...llmCommands];
		newCommands[index] = value;
		setLlmCommands(newCommands);
	};

	const resetForm = () => {
		setName("");
		setLen(100);
		setLlmCommands([""]);
	};

	const handleSubmit = (e: React.FormEvent) => {
		const validCommands = llmCommands.filter((cmd) => cmd.trim());
		if (!name.trim() || validCommands.length === 0) {
			e.preventDefault();
			alert("Please provide a name and at least one command.");
			return;
		}
	};

	// Reset form when modal closes
	useEffect(() => {
		if (!isOpen) {
			resetForm();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h3 className="text-lg font-semibold text-gray-900">
						Create New Generation
					</h3>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600"
						disabled={isSubmitting}
					>
						<X className="w-6 h-6" />
					</button>
				</div>

				<Form method="post" onSubmit={handleSubmit}>
					<input type="hidden" name="_form" value="create" />
					<input
						type="hidden"
						name="llmCommands"
						value={JSON.stringify(llmCommands.filter((cmd) => cmd.trim()))}
					/>

					<div className="p-6">
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name
								</label>
								<input
									type="text"
									name="name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="e.g., Customer Data"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Number of Rows
								</label>
								<input
									type="number"
									name="len"
									value={len}
									onChange={(e) => setLen(Number(e.target.value))}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									min="1"
									max="10000"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									LLM Commands
								</label>
								<div className="space-y-2">
									{llmCommands.map((command, index) => (
										<div key={index} className="flex gap-2">
											<input
												type="text"
												value={command}
												onChange={(e) => updateCommand(index, e.target.value)}
												className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
												placeholder={`Command ${
													index + 1
												} (e.g., "Generate a first name")`}
												disabled={isSubmitting}
											/>
											{llmCommands.length > 1 && (
												<button
													type="button"
													onClick={() => removeCommand(index)}
													className="px-3 py-2 text-red-600 hover:text-red-800"
													disabled={isSubmitting}
												>
													<X className="w-4 h-4" />
												</button>
											)}
										</div>
									))}
									<button
										type="button"
										onClick={addCommand}
										className="text-blue-600 hover:text-blue-800 text-sm font-medium"
										disabled={isSubmitting}
									>
										+ Add Command
									</button>
								</div>
							</div>
						</div>

						<div className="flex gap-3 mt-6">
							<button
								type="button"
								onClick={onClose}
								className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
								disabled={isSubmitting}
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={isSubmitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
							>
								{isSubmitting ? "Creating..." : "Create"}
							</button>
						</div>
					</div>
				</Form>
			</div>
		</div>
	);
}
