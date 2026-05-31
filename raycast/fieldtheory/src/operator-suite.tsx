import { Action, ActionPanel, Detail, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

export default function Command() {
  const [markdown, setMarkdown] = useState("Loading Field Theory operator suite...");

  useEffect(() => {
    runFt(["suite", "status", "--json"])
      .then((stdout) => {
        const status = JSON.parse(stdout);
        setMarkdown([
          "# " + status.name,
          "",
          "**Version:** " + status.version,
          "",
          "## Surfaces",
          ...status.surfaces.map((surface: string) => "- " + surface),
          "",
          "## Workflows",
          ...status.workflows.map((workflow: any) => "- **" + workflow.name + "**: `" + workflow.command + "`"),
        ].join("\n"));
      })
      .catch((error) => {
        showToast({ style: Toast.Style.Failure, title: "ft suite failed", message: String(error.message || error) });
        setMarkdown("Could not run `ft suite status --json`.");
      });
  }, []);

  return (
    <Detail
      markdown={markdown}
      actions={<ActionPanel><Action.CopyToClipboard title="Copy Status" content={markdown} /></ActionPanel>}
    />
  );
}

