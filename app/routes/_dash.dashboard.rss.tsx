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
import { rssFeed, users } from "~/db/schema";
import { inngest } from "~/inngest/client";
import { getAuth, rootAuthLoader } from "@clerk/remix/ssr.server";

type RssFeedData = {
	id: string;
	userId: string;
	name: string | null;
	link: string | null;
	summray: string | null;
	status: "error" | "running" | "finished";
	updatedAt: Date;
	createdAt: Date;
};

const CreateRssFeedSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be 100 characters or less"),
	link: z
		.string()
		.min(1, "Link is required")
		.max(500, "Link must be 500 characters or less")
		.url("Must be a valid URL"),
});

// Loader function - fetch RSS feeds from DB based on authenticated user
export const loader = async (args: LoaderFunctionArgs) => {
	const authData = await rootAuthLoader(args);
	const { userId } = await getAuth(args);

	if (!userId) {
		return json({ rssFeeds: [] });
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

		// Fetch all RSS feeds for the authenticated user
		const userRssFeeds = await db
			.select()
			.from(rssFeed)
			.where(eq(rssFeed.userId, userId))
			.orderBy(rssFeed.updatedAt); // Order by update date

		return json({
			rssFeeds: userRssFeeds,
			authData,
		});
	} catch (error) {
		console.error("Failed to fetch RSS feeds:", error);
		return json({
			rssFeeds: [],
			authData,
			error: "Failed to fetch RSS feeds",
		});
	}
};

// Action function - handle RSS feed creation
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
		const link = formData.get("link") as string;

		// Validate using Zod schema
		const validationResult = CreateRssFeedSchema.safeParse({
			name,
			link,
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
			// Create new RSS feed record in database
			const newRssFeed = await db
				.insert(rssFeed)
				.values({
					userId,
					name: validatedData.name.trim(),
					link: validatedData.link,
					status: "running",
					summray: null,
				})
				.returning({ id: rssFeed.id });

			const rssFeedId = newRssFeed[0].id;

			// Send event to Inngest
			await inngest.send({
				name: "ai/llm.rss",
				data: {
					rssFeedId,
				},
			});

			return redirect("/dashboard/rss");
		} catch (error) {
			console.error("Failed to create RSS feed:", error);
			return json(
				{ success: false, error: "Failed to create RSS feed" },
				{ status: 500 }
			);
		}
	}

	return json({ success: false, error: "Invalid form type" }, { status: 400 });
}

export default function RssFeedDashboard() {
	const revalidator = useRevalidator();
	const { rssFeeds } = useLoaderData<typeof loader>();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const navigation = useNavigation();

	const isSubmitting =
		navigation.state === "submitting" &&
		navigation.formData?.get("_form") === "create";

	// Filter RSS feeds based on search query
	const filteredRssFeeds = rssFeeds.filter(
		(feed: RssFeedData) =>
			feed.summray?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			feed.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			feed.link?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Auto-revalidate every 30 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			revalidator.revalidate();
		}, 30000);

		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (navigation.state === "idle" && !isSubmitting) {
			setShowCreateModal(false);
		}
	}, [navigation.state, isSubmitting]);

	const formatDate = (date: Date | string) => {
		const d = new Date(date);
		return d.toLocaleDateString() + " " + d.toLocaleTimeString();
	};

	return (
		<div className="max-w-4xl mx-auto p-6">
			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h2 className="text-xl font-semibold text-gray-900">
						RSS Feed Summaries
					</h2>
					<button
						onClick={() => setShowCreateModal(true)}
						className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
					>
						<Plus className="w-4 h-4 mr-2" />
						Add RSS Feed
					</button>
				</div>

				{/* Search Bar */}
				<div className="p-6 border-b border-gray-200">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
						<input
							type="text"
							placeholder="Search summaries..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				{/* RSS Feed List */}
				<div className="divide-y divide-gray-200">
					{filteredRssFeeds.length === 0 ? (
						<div className="px-6 py-12 text-center text-gray-500">
							{searchQuery
								? "No matching RSS feeds found."
								: "No RSS feeds found. Add your first one to get started."}
						</div>
					) : (
						filteredRssFeeds.map((feed: RssFeedData) => (
							<div key={feed.id} className="p-6 hover:bg-gray-50">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
											<h3 className="text-lg font-medium text-gray-900">
												{feed.name || "Untitled Feed"}
											</h3>
											<span
												className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
													feed.status === "finished"
														? "bg-green-100 text-green-800"
														: feed.status === "error"
														? "bg-red-100 text-red-800"
														: "bg-blue-100 text-blue-800"
												}`}
											>
												{feed.status}
											</span>
										</div>
										<p className="text-sm text-gray-500 mb-3">
											<a
												href={feed.link || "#"}
												target="_blank"
												rel="noopener noreferrer"
												className="hover:text-blue-600"
											>
												{feed.link}
											</a>
										</p>
										{feed.summray && (
											<p className="text-gray-700 leading-relaxed">
												{feed.summray}
											</p>
										)}
									</div>
								</div>
								<div className="mt-4 text-xs text-gray-500">
									Updated: {formatDate(feed.updatedAt)}
								</div>
							</div>
						))
					)}
				</div>
			</div>

			<CreateRssFeedModal
				isOpen={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				isSubmitting={isSubmitting}
			/>
		</div>
	);
}

function CreateRssFeedModal({
	isOpen,
	onClose,
	isSubmitting,
}: {
	isOpen: boolean;
	onClose: () => void;
	isSubmitting: boolean;
}) {
	const [name, setName] = useState("");
	const [link, setLink] = useState("");
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	const resetForm = () => {
		setName("");
		setLink("");
		setValidationErrors([]);
	};

	const handleSubmit = (e: React.FormEvent) => {
		setValidationErrors([]);

		// Client-side validation
		const validationResult = CreateRssFeedSchema.safeParse({
			name: name.trim(),
			link: link.trim(),
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
					<h3 className="text-lg font-semibold text-gray-900">Add RSS Feed</h3>
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
									Name <span className="text-gray-500">(max 100 chars)</span>
								</label>
								<input
									type="text"
									name="name"
									value={name}
									onChange={(e) => setName(e.target.value.slice(0, 100))}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="e.g., Tech News RSS"
									required
									disabled={isSubmitting}
									maxLength={100}
								/>
								<div className="text-xs text-gray-500 mt-1">
									{name.length}/100 characters
								</div>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									RSS Feed URL{" "}
									<span className="text-gray-500">(max 500 chars)</span>
								</label>
								<input
									type="url"
									name="link"
									value={link}
									onChange={(e) => setLink(e.target.value.slice(0, 500))}
									className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="https://example.com/rss"
									required
									disabled={isSubmitting}
									maxLength={500}
								/>
								<div className="text-xs text-gray-500 mt-1">
									{link.length}/500 characters
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
								{isSubmitting ? "Adding..." : "Add Feed"}
							</button>
						</div>
					</div>
				</Form>
			</div>
		</div>
	);
}
