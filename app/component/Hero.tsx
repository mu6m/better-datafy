import { useState, useEffect } from "react";
import {
	ArrowRight,
	Database,
	Brain,
	Globe,
	Zap,
	Github,
	Star,
} from "lucide-react";

export default function DatafyHero() {
	const [isVisible, setIsVisible] = useState(false);
	const [currentWord, setCurrentWord] = useState(0);

	const words = ["Generate", "Analyze", "Scrape"];

	useEffect(() => {
		setIsVisible(true);
		const interval = setInterval(() => {
			setCurrentWord((prev) => (prev + 1) % words.length);
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="bg-blue-500 relative min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
			{/* Animated background elements */}
			<div className="absolute inset-0">
				<div className="absolute top-20 left-20 w-72 h-72 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
				<div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
				<div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
			</div>

			{/* Grid pattern overlay */}
			<div className="absolute inset-0 opacity-40">
				<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"></div>
				<div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent"></div>
			</div>

			<div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
				<div className="text-center max-w-5xl mx-auto">
					{/* Logo/Brand */}
					<div
						className={`transition-all duration-1000 ${
							isVisible
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-10"
						}`}
					>
						<div className="flex items-center justify-center mb-8">
							<div className="relative">
								<div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-2xl">
									<Database className="w-8 h-8 text-white" />
								</div>
								<div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
									<Brain className="w-3 h-3 text-white" />
								</div>
							</div>
							<h1 className="ml-4 text-4xl font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent">
								Datafy
							</h1>
						</div>
					</div>

					{/* Main headline */}
					<div
						className={`transition-all duration-1000 delay-300 ${
							isVisible
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-10"
						}`}
					>
						<h2 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
							<span className="inline-block">
								<span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent transition-all duration-500">
									{words[currentWord]}
								</span>
							</span>
							<br />
							<span className="text-white">Data using</span>
							<br />
							<span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
								AI Power
							</span>
						</h2>
					</div>

					{/* Subtitle */}
					<div
						className={`transition-all duration-1000 delay-500 ${
							isVisible
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-10"
						}`}
					>
						<p className="text-xl sm:text-2xl text-gray-300 mb-4 max-w-3xl mx-auto leading-relaxed">
							Free & Open Source SaaS platform that empowers you to generate,
							analyze, and scrape data with cutting-edge AI technology
						</p>
						<div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-12">
							<Github className="w-4 h-4" />
							<span>Open Source</span>
							<span className="w-1 h-1 bg-gray-400 rounded-full"></span>
							<Star className="w-4 h-4" />
							<span>Free Forever</span>
							<span className="w-1 h-1 bg-gray-400 rounded-full"></span>
							<Zap className="w-4 h-4" />
							<span>AI Powered</span>
						</div>
					</div>

					{/* CTA Buttons */}
					<div
						className={`transition-all duration-1000 delay-700 ${
							isVisible
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-10"
						}`}
					>
						<div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
							<button className="group relative px-8 py-4 bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105 hover:-translate-y-1">
								<span className="flex items-center gap-2">
									Get Started Free
									<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
								</span>
								<div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
							</button>

							<button className="group relative px-8 py-4 border-2 border-gray-600 text-white font-semibold rounded-2xl hover:border-purple-400 transition-all duration-300 hover:scale-105 hover:-translate-y-1 backdrop-blur-sm">
								<span className="flex items-center gap-2">
									<Github className="w-5 h-5" />
									View on GitHub
								</span>
								<div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
							</button>
						</div>
					</div>

					{/* Feature highlights */}
					<div
						className={`transition-all duration-1000 delay-900 ${
							isVisible
								? "opacity-100 translate-y-0"
								: "opacity-0 translate-y-10"
						}`}
					>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
							<div className="group p-6 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 hover:border-purple-400/50 transition-all duration-300 hover:scale-105 hover:-translate-y-2">
								<div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
									<Database className="w-6 h-6 text-white" />
								</div>
								<h3 className="text-xl font-semibold text-white mb-2">
									Generate Data
								</h3>
								<p className="text-gray-300">
									Create synthetic datasets with AI-powered generation
									algorithms
								</p>
							</div>

							<div className="group p-6 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 hover:border-blue-400/50 transition-all duration-300 hover:scale-105 hover:-translate-y-2">
								<div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
									<Brain className="w-6 h-6 text-white" />
								</div>
								<h3 className="text-xl font-semibold text-white mb-2">
									Analyze Insights
								</h3>
								<p className="text-gray-300">
									Discover patterns and insights with advanced AI analytics
								</p>
							</div>

							<div className="group p-6 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105 hover:-translate-y-2">
								<div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
									<Globe className="w-6 h-6 text-white" />
								</div>
								<h3 className="text-xl font-semibold text-white mb-2">
									Scrape Web Data
								</h3>
								<p className="text-gray-300">
									Extract data from websites with intelligent scraping tools
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Floating particles */}
			<div className="absolute inset-0 pointer-events-none">
				<div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-400 rounded-full animate-ping"></div>
				<div className="absolute top-3/4 right-1/4 w-2 h-2 bg-blue-400 rounded-full animate-ping delay-1000"></div>
				<div className="absolute bottom-1/4 left-3/4 w-2 h-2 bg-cyan-400 rounded-full animate-ping delay-2000"></div>
			</div>
		</div>
	);
}
