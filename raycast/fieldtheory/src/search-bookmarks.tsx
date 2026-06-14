import { Action, ActionPanel, List, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { runFt } from "./lib/ft";

interface BookmarkResult {
  id: string;
  text?: string;
  author?: string;
  url?: string;
}

export default function Command() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BookmarkResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) {
      setItems([]);
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => {
      runFt(["search", query, "--limit", "12", "--json"])
        .then((stdout) => {
          if (cancelled) return;
          const parsed = JSON.parse(stdout);
          setItems(parsed.results || parsed);
        })
        .catch((error) => {
          if (!cancelled) {
            showToast({
              style: Toast.Style.Failure,
              title: "Search failed",
              message: String(error.message || error),
            });
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <List
      filtering={false}
      searchBarPlaceholder="Search local bookmarks..."
      onSearchTextChange={setQuery}
      throttle
    >
      {items.map((item) => (
        <List.Item
          key={item.id}
          title={(item.text || item.id).slice(0, 90)}
          subtitle={item.author}
          actions={
            <ActionPanel>
              {item.url ? <Action.OpenInBrowser url={item.url} /> : null}
              <Action.CopyToClipboard content={item.id} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
