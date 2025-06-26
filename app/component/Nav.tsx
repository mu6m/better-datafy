import { SignInButton, SignOutButton, useUser } from "@clerk/remix";

export default function Navbar() {
	const { isSignedIn, user } = useUser();

	return (
		<nav className="flex flex-row w-full justify-center content-center max-w-6xl mx-auto px-4 items-center my-8 gap-4">
			<div className="w-full flex gap-4 items-center sm:justify-start">
				<div>
					<a href="/" className="text-xl text-white font-bold">
						Datafy
					</a>
				</div>

				<div className="flex-1 w-full mx-4"></div>
			</div>

			<div className="flex items-center space-x-4">
				{!isSignedIn ? (
					<SignInButton mode="modal">
						<button className="bg-blue-500 hover:bg-blue-800 whitespace-nowrap text-white px-2 py-1 rounded-sm cursor-pointer">
							login
						</button>
					</SignInButton>
				) : (
					<>
						<a
							href="/dashboard/"
							className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-sm cursor-pointer"
						>
							account
						</a>
						<SignOutButton>
							<button className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded-sm cursor-pointer">
								logout
							</button>
						</SignOutButton>
					</>
				)}
			</div>
		</nav>
	);
}
