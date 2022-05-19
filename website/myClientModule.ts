import type { ClientModule } from "@docusaurus/types";
import { logPageView } from "@tidb-community/tracking-script";

// https://docusaurus.io/docs/advanced/client#client-module-lifecycles
const module: ClientModule = {
  onRouteDidUpdate({ location, previousLocation }) {
    if (process.env.NODE_ENV === "production") {
      // Add community analytics scripts after route changed.
      logPageView();
    }
  },
};

export default module;
