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
import { scrapes, users } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth, rootAuthLoader } from "@clerk/remix/ssr.server";

type ScrapeStatus = "error" | "running" | "finished";

type ScrapeData = {
	links: string[];
	scrape: string[];
	data: string[][];
};

type Scrape = {
	id: string;
	userId: string;
	name: string | null;
	status: ScrapeStatus;
	data: ScrapeData;
	createdAt: Date;
};

const CreateScrapeSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(500, "Name must be 500 characters or less"),
	links: z
		.array(
			z
				.string()
				.url("Invalid URL format")
				.max(500, "URL must be 500 characters or less")
		)
		.min(1, "At least one link is required")
		.max(5, "Maximum 5 links allowed"),
	scrapeInstructions: z
		.array(
			z
				.string()
				.min(1, "Instruction cannot be empty")
				.max(500, "Instruction must be 500 characters or less")
		)
		.min(1, "At least one instruction is required"),
});

export const loader = async (args: LoaderFunctionArgs) => {
	const authData = await rootAuthLoader(args);
	const { userId } = await getAuth(args);

	if (!userId) {
		return json({ scrapes: [] });
	}

	try {
		const existingUser = await db
			.select()
			.from(users)
			.where(eq(users.id, userId));

		if (existingUser.length === 0) {
			await db.insert(users).values({ id: userId });
		}

		const userScrapes = await db
			.select()
			.from(scrapes)
			.where(eq(scrapes.userId, userId))
			.orderBy(scrapes.createdAt);

		return json({
			scrapes: userScrapes,
			authData,
		});
	} catch (error) {
		console.error("Failed to fetch scrapes:", error);
		return json({
			scrapes: [],
			authData,
			error: "Failed to fetch scrapes",
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
		const linksJson = formData.get("links") as string;
		const scrapeInstructionsJson = formData.get("scrapeInstructions") as string;

		let links, scrapeInstructions;
		try {
			links = JSON.parse(linksJson);
			scrapeInstructions = JSON.parse(scrapeInstructionsJson);
		} catch {
			return json(
				{ success: false, error: "Invalid data format" },
				{ status: 400 }
			);
		}

		const validationResult = CreateScrapeSchema.safeParse({
			name,
			links,
			scrapeInstructions,
		});

		if (!validationResult.success) {
			const errorMessages = validationResult.error.errors
				.map((err) => `${err.path.join(".")}: ${err.message}`)
				.join(", ");

			return json(
				{ success: false, error: `Validation failed: ${errorMessages}` },
				{ status: 400 }
			);
		}

		const validatedData = validationResult.data;

		try {
			const newScrape = await db
				.insert(scrapes)
				.values({
					userId,
					name: validatedData.name.trim(),
					status: "running",
					data: {
						links: validatedData.links,
						scrape: validatedData.scrapeInstructions,
						data: [],
					},
				})
				.returning({ id: scrapes.id });

			const scrapeId = newScrape[0].id;

			await inngest.send({
				name: "ai/llm.scrape",
				data: {
					scrapeId,
				},
			});

			return redirect("/dashboard/scrape");
		} catch (error) {
			console.error("Failed to create scrape:", error);
			return json(
				{ success: false, error: "Failed to create scrape" },
				{ status: 500 }
			);
		}
	}

	return json({ success: false, error: "Invalid form type" }, { status: 400 });
}

export default function ScrapesDashboard() {
	const revalidator = useRevalidator();

	useEffect(() => {
		const interval = setInterval(() => {
			revalidator.revalidate();
		}, 5000);

		return () => clearInterval(interval);
	}, []);

	const { scrapes } = useLoaderData<typeof loader>();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const navigation = useNavigation();

	const isSubmitting =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "create";

	const handleDownloadJson = (scrape: Scrape) => {
		const jsonContent = JSON.stringify(scrape.data, null, 2);
		const blob = new Blob([jsonContent], { type: "application/json" });
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = `${scrape.name || "scrape"}_${scrape.id}.json`;
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
					<h2 className="text-xl font-semibold text-gray-900">Web Scrapes</h2>
					<button
						onClick={() => setShowCreateModal(true)}
						className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
					>
						<Plus className="w-4 h-4 mr-2" />
						New Scrape
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
									Links Count
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
							{scrapes.length === 0 ? (
								<tr>
									<td
										colSpan={4}
										className="px-6 py-12 text-center text-gray-500"
									>
										No scrapes found. Create your first one to get started.
									</td>
								</tr>
							) : (
								scrapes.map((scrape: any) => (
									<tr key={scrape.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{scrape.name || `Scrape ${scrape.id.slice(0, 8)}`}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{scrape.data?.links?.length || 0}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span
												className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
													scrape.status === "finished"
														? "bg-green-100 text-green-800"
														: scrape.status === "error"
														? "bg-red-100 text-red-800"
														: "bg-blue-100 text-blue-800"
												}`}
											>
												{scrape.status}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
											<button
												onClick={() => handleDownloadJson(scrape)}
												className="inline-flex items-center text-blue-600 hover:text-blue-800 disabled:text-gray-400"
												disabled={!scrape.data?.data?.length}
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

			<CreateScrapeModal
				isOpen={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				isSubmitting={isSubmitting}
			/>
		</div>
	);
}

function CreateScrapeModal({
	isOpen,
	onClose,
	isSubmitting,
}: {
	isOpen: boolean;
	onClose: () => void;
	isSubmitting: boolean;
}) {
	const [name, setName] = useState("");
	const [links, setLinks] = useState([""]);
	const [scrapeInstructions, setScrapeInstructions] = useState([""]);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	const addLink = () => {
		if (links.length < 5) {
			setLinks([...links, ""]);
		}
	};

	const removeLink = (index: number) => {
		if (links.length > 1) {
			setLinks(links.filter((_, i) => i !== index));
		}
	};

	const updateLink = (index: number, value: string) => {
		const newLinks = [...links];
		newLinks[index] = value.slice(0, 500);
		setLinks(newLinks);
	};

	const addInstruction = () => {
		setScrapeInstructions([...scrapeInstructions, ""]);
	};

	const removeInstruction = (index: number) => {
		if (scrapeInstructions.length > 1) {
			setScrapeInstructions(scrapeInstructions.filter((_, i) => i !== index));
		}
	};

	const updateInstruction = (index: number, value: string) => {
		const newInstructions = [...scrapeInstructions];
		newInstructions[index] = value.slice(0, 500);
		setScrapeInstructions(newInstructions);
	};

	const resetForm = () => {
		setName("");
		setLinks([""]);
		setScrapeInstructions([""]);
		setValidationErrors([]);
	};

	const handleSubmit = (e: React.FormEvent) => {
		setValidationErrors([]);

		const validLinks = links.filter((link) => link.trim());
		const validInstructions = scrapeInstructions.filter((inst) => inst.trim());

		const validationResult = CreateScrapeSchema.safeParse({
			name: name.trim(),
			links: validLinks,
			scrapeInstructions: validInstructions,
		});

		if (!validationResult.success) {
			e.preventDefault();
			const errorMessages = validationResult.error.errors.map(
				(err) => `${err.path.join(".")}: ${err.message}`
			);
			setValidationErrors(errorMessages);
			return;
		}
	};

	useEffect(() => {
		if (!isOpen) {
			resetForm();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h3 className="text-lg font-semibold text-gray-900">
						Create New Scrape
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
						name="links"
						value={JSON.stringify(links.filter((link) => link.trim()))}
					/>
					<input
						type="hidden"
						name="scrapeInstructions"
						value={JSON.stringify(
							scrapeInstructions.filter((inst) => inst.trim())
						)}
					/>

					<div className="p-6">
						{validationErrors.length > 0 && (
							<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
								<div className="text-sm text-red-600">
									{validationErrors.map((error, index) => (
										<div key={index}>• {error}</div>
									))}
								</div>
							</div>
						)}

						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Name
								</label>
								<input
									type="text"
									name="name"
									value={name}
									onChange={(e) => setName(e.target.value.slice(0, 500))}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="e.g., News Articles"
									required
									disabled={isSubmitting}
									maxLength={500}
								/>
								<div className="text-xs text-gray-500 mt-1">
									{name.length}/500 characters
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Links (max 5)
								</label>
								<div className="space-y-2">
									{links.map((link, index) => (
										<div key={index} className="flex gap-2">
											<input
												type="url"
												value={link}
												onChange={(e) => updateLink(index, e.target.value)}
												className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
												placeholder="https://example.com"
												disabled={isSubmitting}
												maxLength={500}
											/>
											{links.length > 1 && (
												<button
													type="button"
													onClick={() => removeLink(index)}
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
										onClick={addLink}
										className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:text-gray-400"
										disabled={isSubmitting || links.length >= 5}
									>
										+ Add Link ({links.length}/5)
									</button>
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Scrape Instructions
								</label>
								<div className="space-y-2">
									{scrapeInstructions.map((instruction, index) => (
										<div key={index} className="space-y-1">
											<div className="flex gap-2">
												<textarea
													value={instruction}
													onChange={(e) =>
														updateInstruction(index, e.target.value)
													}
													className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
													placeholder="What to extract from the page"
													rows={2}
													disabled={isSubmitting}
													maxLength={500}
												/>
												{scrapeInstructions.length > 1 && (
													<button
														type="button"
														onClick={() => removeInstruction(index)}
														className="px-3 py-2 text-red-600 hover:text-red-800 self-start"
														disabled={isSubmitting}
													>
														<X className="w-4 h-4" />
													</button>
												)}
											</div>
											<div className="text-xs text-gray-500">
												{instruction.length}/500 characters
											</div>
										</div>
									))}
									<button
										type="button"
										onClick={addInstruction}
										className="text-blue-600 hover:text-blue-800 text-sm font-medium"
										disabled={isSubmitting}
									>
										+ Add Instruction
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
