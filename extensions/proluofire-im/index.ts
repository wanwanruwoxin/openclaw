import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { proluofireImPlugin } from "./src/channel.js";
import { setProluofireImRuntime } from "./src/runtime.js";

const plugin = {
  id: "proluofire-im",
  name: "Proluofire IM",
  description: "Proluofire IM channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setProluofireImRuntime(api.runtime);
    api.registerChannel({ plugin: proluofireImPlugin });
  },
};

export default plugin;
