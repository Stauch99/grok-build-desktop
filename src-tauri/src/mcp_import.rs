use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct McpNameCmd {
    pub name: String,
    pub command: String,
}

pub(crate) fn first_open_union(
    canonical: &[McpNameCmd],
    live: &[McpNameCmd],
) -> (Vec<McpNameCmd>, Vec<String>) {
    let mut next = canonical.to_vec();
    let mut conflicts = Vec::new();

    for row in live {
        match next.iter().find(|c| c.name == row.name) {
            None => next.push(row.clone()),
            Some(existing) if existing.command == row.command => {}
            Some(_) => conflicts.push(row.name.clone()),
        }
    }

    (next, conflicts)
}

fn command_from_entry(entry: &Value) -> Option<String> {
    let obj = entry.as_object()?;
    obj.get("commandOrUrl")
        .or_else(|| obj.get("command"))
        .or_else(|| obj.get("url"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

pub(crate) fn rows_from_mcp_text(text: &str) -> Vec<McpNameCmd> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(obj) = value.as_object() else {
        return Vec::new();
    };
    if let Some(servers) = obj.get("servers").and_then(|v| v.as_array()) {
        return servers
            .iter()
            .filter_map(|entry| {
                let name = entry.get("name").and_then(|n| n.as_str())?.to_string();
                let command = command_from_entry(entry)?;
                Some(McpNameCmd { name, command })
            })
            .collect();
    }
    if let Some(mcp_servers) = obj.get("mcpServers").and_then(|v| v.as_object()) {
        return mcp_servers
            .iter()
            .filter_map(|(name, entry)| {
                let command = command_from_entry(entry)?;
                Some(McpNameCmd {
                    name: name.clone(),
                    command,
                })
            })
            .collect();
    }
    Vec::new()
}

pub(crate) fn apply_first_open_file(canonical_text: &str, live_texts: &[&str]) -> (String, Vec<String>) {
    let mut canon = rows_from_mcp_text(canonical_text);
    let mut conflicts = vec![];
    for t in live_texts {
        let live = rows_from_mcp_text(t);
        let (next, c) = first_open_union(&canon, &live);
        canon = next;
        conflicts.extend(c);
    }
    let json = serde_json::json!({
        "servers": canon
            .iter()
            .map(|r| {
                serde_json::json!({
                    "name": r.name,
                    "transport": "stdio",
                    "commandOrUrl": r.command,
                })
            })
            .collect::<Vec<_>>()
    });
    (
        serde_json::to_string_pretty(&json).unwrap_or_else(|_| "{}".into()),
        conflicts,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(name: &str, command: &str) -> McpNameCmd {
        McpNameCmd {
            name: name.into(),
            command: command.into(),
        }
    }

    #[test]
    fn unions_missing_live_rows_into_empty_canonical() {
        let live = vec![row("git", "uvx"), row("docs", "https://x")];
        let (next, conflicts) = first_open_union(&[], &live);
        assert_eq!(next, live);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn skips_same_name_and_command() {
        let canonical = vec![row("git", "uvx")];
        let live = vec![row("git", "uvx")];
        let (next, conflicts) = first_open_union(&canonical, &live);
        assert_eq!(next, canonical);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn keeps_canonical_on_command_conflict() {
        let canonical = vec![row("git", "uvx")];
        let live = vec![row("git", "npx")];
        let (next, conflicts) = first_open_union(&canonical, &live);
        assert_eq!(next, canonical);
        assert_eq!(conflicts, vec!["git".to_string()]);
    }

    #[test]
    fn appends_missing_and_reports_conflicts_without_mutating_inputs() {
        let canonical = vec![row("git", "uvx"), row("docs", "https://x")];
        let live = vec![row("git", "npx"), row("new", "cmd")];
        let canonical_before = canonical.clone();
        let live_before = live.clone();

        let (next, conflicts) = first_open_union(&canonical, &live);

        assert_eq!(canonical, canonical_before);
        assert_eq!(live, live_before);
        assert_eq!(
            next,
            vec![
                row("git", "uvx"),
                row("docs", "https://x"),
                row("new", "cmd"),
            ]
        );
        assert_eq!(conflicts, vec!["git".to_string()]);
    }

    #[test]
    fn apply_first_open_imports_claude_then_keeps_canonical_on_conflict() {
        let claude = r#"{ "mcpServers": { "git": { "command": "uvx" } } }"#;
        let (out, conflicts) = apply_first_open_file("", &[claude]);
        assert!(conflicts.is_empty());
        let parsed: Value = serde_json::from_str(&out).expect("catalog json");
        let servers = parsed["servers"].as_array().expect("servers");
        assert_eq!(servers[0]["name"], "git");
        assert_eq!(servers[0]["commandOrUrl"], "uvx");
        assert_eq!(servers[0]["transport"], "stdio");

        let claude2 = r#"{ "mcpServers": { "git": { "command": "npx" } } }"#;
        let (out2, conflicts2) = apply_first_open_file(&out, &[claude2]);
        assert_eq!(conflicts2, vec!["git".to_string()]);
        let parsed2: Value = serde_json::from_str(&out2).expect("catalog json");
        assert_eq!(parsed2["servers"][0]["commandOrUrl"], "uvx");
    }
}
