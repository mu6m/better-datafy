import { Download } from "lucide-react";
import { useLoaderData } from "@remix-run/react";
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { db } from "~/db/db.server";
import { datasets } from "~/db/schema";

export const loader = async (args: LoaderFunctionArgs) => {
	const data = await db.select().from(datasets).orderBy(datasets.updatedAt);

	return json({
		data,
	});
};

export default function DataDashboard() {
	const { data } = useLoaderData<typeof loader>();

	return (
		<div className="max-w-4xl mx-auto p-6">
			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h2 className="text-xl font-semibold text-gray-900">Datasets</h2>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Name
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Updated At
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Download
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{data.length === 0 ? (
								<tr>
									<td
										colSpan={4}
										className="px-6 py-12 text-center text-gray-500"
									>
										No datasets found.
									</td>
								</tr>
							) : (
								data.map((dataset) => (
									<tr key={dataset.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{dataset.name || `Dataset ${dataset.id.slice(0, 8)}`}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{dataset.updatedAt}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
											<button
												onClick={() => {
													const link = document.createElement("a");
													link.href = dataset.link;
													link.target = "_blank";
													link.download = `${dataset.name}.json`;
													document.body.appendChild(link);
													link.click();
													document.body.removeChild(link);
												}}
												className="inline-flex items-center text-blue-600 hover:text-blue-800 disabled:text-gray-400"
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
		</div>
	);
}
