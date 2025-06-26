import { serve } from "inngest/remix";
import { inngest } from "~/inngest/client";
import { functions } from "~/inngest";

const handler = serve({
	client: inngest,
	functions: functions,
});

export { handler as action, handler as loader };
