process.title = "jayai";
process.emitWarning = (() => { }) as typeof process.emitWarning;

import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { main } from "./cli/commands";

setGlobalDispatcher(new EnvHttpProxyAgent());

main(process.argv);