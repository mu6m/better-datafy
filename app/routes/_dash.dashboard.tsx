export default function IndexDashboard() {
	const tasks = [
		{
			id: 1,
			name: "E-commerce Product Scraping",
			status: "Running",
			downloadAvailable: false,
		},
		{
			id: 2,
			name: "Social Media Data Collection",
			status: "Completed",
			downloadAvailable: true,
		},
		{
			id: 3,
			name: "News Articles Extraction",
			status: "Running",
			downloadAvailable: false,
		},
		{
			id: 4,
			name: "Property Listings Scraper",
			status: "Failed",
			downloadAvailable: false,
		},
		{
			id: 5,
			name: "Restaurant Reviews Mining",
			status: "Completed",
			downloadAvailable: true,
		},
	];

	const getStatusColor = (status: any) => {
		switch (status) {
			case "Running":
				return "bg-blue-100 text-blue-800";
			case "Completed":
				return "bg-green-100 text-green-800";
			case "Failed":
				return "bg-red-100 text-red-800";
			default:
				return "bg-gray-100 text-gray-800";
		}
	};

	return (
		<>
			<div className="bg-white rounded-lg shadow-sm border border-gray-200">
				<div className="flex items-center justify-between p-6 border-b border-gray-200">
					<h2 className="text-lg font-semibold text-gray-900">
						Current Running Tasks
					</h2>
					<button className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors duration-200">
						Create Task
					</button>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Task Name
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Download Data
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{tasks.map((task) => (
								<tr key={task.id} className="hover:bg-gray-50">
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="text-sm font-medium text-gray-900">
											{task.name}
										</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span
											className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
												task.status
											)}`}
										>
											{task.status === "Running" ? "Scraping" : task.status}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										{task.downloadAvailable ? (
											<button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
												Download
											</button>
										) : (
											<span className="text-gray-400 text-sm">
												Not Available
											</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</>
	);
}
