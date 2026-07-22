import { useState } from "react";
import { ControllerPanel } from "../controllers/ControllerPanel.js";
import { EnumPanel } from "../enums/EnumPanel.js";

export function InformationPanel() {
  const [active, setActive] = useState<"controllers" | "enums">("controllers");
  return (
    <div className="information-panel">
      <div className="information-tabs" role="tablist" aria-label="工程信息分类">
        <button
          type="button"
          role="tab"
          aria-selected={active === "controllers"}
          onClick={() => setActive("controllers")}
        >
          Controllers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={active === "enums"}
          onClick={() => setActive("enums")}
        >
          Enums
        </button>
      </div>
      <div className="information-content" role="tabpanel">
        {active === "controllers" ? <ControllerPanel /> : <EnumPanel />}
      </div>
    </div>
  );
}
