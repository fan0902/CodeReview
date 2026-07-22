import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

let configured = false;

export function configureMonaco(): void {
  if (configured) return;
  configured = true;
  loader.config({ monaco });
}
