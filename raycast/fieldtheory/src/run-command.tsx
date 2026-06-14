import { Action, ActionPanel, List, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

const COMMANDS = [
  { title: "Status", args: ["status", "--json"] },
  { title: "Paths", args: ["paths", "--json"] },
  { title: "Recall Pack", args: ["recall", "agent memory", "--json"] },
  { title: "Suite", args: ["suite", "status", "--json"] },
  { title: "Commands Validate", args: ["commands", "validate", "--json"] },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function Command() {
  const [detail, setDetail] = useState("Select a command.");

  async function run(args: string[]) {
    try {
      setDetail(await runFt(args));
    } catch (error: unknown) {
      showToast({
        style: Toast.Style.Failure,
        title: "Command failed",
        message: errorMessage(error),
      });
    }
  }

  useEffect(() => {
    run(COMMANDS[0].args);
  }, []);

  return (
    <List isShowingDetail>
      {COMMANDS.map((command) => (
        <List.Item
          key={command.title}
          title={command.title}
          subtitle={"ft " + command.args.join(" ")}
          detail={
            <List.Item.Detail markdown={"```json\n" + detail + "\n```"} />
          }
          actions={
            <ActionPanel>
              <Action title="Run" onAction={() => run(command.args)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
