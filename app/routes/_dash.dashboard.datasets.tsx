// app/routes/_dash.dashboard.datasets.tsx

import { Download } from "lucide-react";
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db/db.server";
import { datasets } from "~/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";

export const loader = async (args: LoaderFunctionArgs) => {
	const data = await db.select().from(datasets).orderBy(datasets.updatedAt);
	return json({ data });
};

export default function DataDashboard() {
	const { data } = useLoaderData<typeof loader>();

	const handleDownload = (dataset: (typeof data)[number]) => {
		const link = document.createElement("a");
		link.href = dataset.link as string;
		link.target = "_blank";
		link.download = `${dataset.name}.json`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Datasets</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Updated At</TableHead>
							<TableHead>Download</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.length === 0 ? (
							<TableRow>
								<TableCell colSpan={3} className="h-24 text-center">
									No datasets found.
								</TableCell>
							</TableRow>
						) : (
							data.map((dataset) => (
								<TableRow key={dataset.id}>
									<TableCell className="font-medium">
										{dataset.name || `Dataset ${dataset.id.slice(0, 8)}`}
									</TableCell>
									<TableCell>
										{new Date(dataset.updatedAt!).toLocaleString()}
									</TableCell>
									<TableCell>
										<Button
											variant="link"
											size="sm"
											onClick={() => handleDownload(dataset)}
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
